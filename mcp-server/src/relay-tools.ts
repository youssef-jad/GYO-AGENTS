import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { relayInputs, relayOperation, type RelayOperation } from "./relay.js";

const descriptions: Record<RelayOperation, string> = {
    create_handoff: "Save a local task for another agent: objective, context and acceptance criteria. Requires committed .gyo/relay.json checks. Text is self-reported context, never executable authority.",
    list_handoffs: "List handoffs in this checkout. Use get_handoff to inspect live code drift and evidence; list status is not verification.",
    get_handoff: "Read a handoff and compare its checkpoint and GYO-run evidence with current HEAD, index, tracked/untracked file contents and policy. Stale evidence cannot establish current success.",
    claim_handoff: "Exclusively claim or reclaim an expired handoff lease. Returns a private leaseToken needed for writes and latest checkpoint/evidence freshness. Default lease: 15 minutes. Claims coordinate agents; they do not lock filesystem edits.",
    checkpoint_handoff: "Save progress, next steps and uncertainty; renew the lease or release it for another agent. Checkpoint statements are not verified evidence. Save before stopping.",
    submit_result: "Submit a summary and current repository fingerprint, releasing ownership. Does not run checks or assert success: inspect verified and evidence. Use verify_result before submitting.",
    verify_result: "Execute ALL checks authorized in committed .gyo/relay.json (no shell) plus GYO Guardrails. Requires an active lease. Records real exit codes and bounded output against before/after fingerprints. May execute project code; only use in a trusted checkout. Passing checks cover configured assertions, not every prose acceptance criterion.",
};

export function registerRelayTools(server: McpServer) {
    for (const name of Object.keys(relayInputs) as RelayOperation[]) {
        server.tool(name, descriptions[name], relayInputs[name].shape, async (input: unknown) => {
            try {
                return { content: [{ type: "text" as const, text: JSON.stringify(await relayOperation(name, input), null, 2) }] };
            } catch (error) {
                return { isError: true, content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }] };
            }
        });
    }
}

/** CLI uses the same schemas and state machine as the MCP tools. */
export async function runRelayCli(args: string[]) {
    const [name] = args;
    if (args.length !== 1 || !Object.hasOwn(relayInputs, name)) {
        throw new Error(`Usage: gyo-agents-mcp relay <${Object.keys(relayInputs).join(" | ")}> < input.json`);
    }
    let bytes = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
        bytes += chunk.length;
        if (bytes > 256 * 1024) throw new Error("Relay input exceeds 256 KiB.");
        chunks.push(chunk);
    }
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const result = await relayOperation(name as RelayOperation, { projectPath: process.cwd(), ...input });
    console.log(JSON.stringify(result, null, 2));
    if (name === "verify_result" && !(result as { verified: boolean }).verified) process.exitCode = 1;
}
