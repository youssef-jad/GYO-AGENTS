import { readFileSync } from "node:fs";
import { approveGuardrail, checkChanges, checkExportedGuardrails, exportGuardrails, listGuardrails, removeGuardrail } from "./guardrails.js";
import { runGuardrailHook } from "./guardrail-hook.js";
import { maxPatchBytes } from "./patch.js";

async function readInput(limit: number): Promise<string> {
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of process.stdin) {
        bytes += chunk.length;
        if (bytes > limit) throw new Error(`Input exceeds ${limit} bytes.`);
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf-8");
}

export async function runGuardrailCli(args: string[]): Promise<void> {
    const [command, id] = args;
    const projectPath = process.cwd();

    if (command === "list" && args.length === 1) {
        console.log(JSON.stringify(listGuardrails(projectPath), null, 2));
    } else if (command === "export" && args.length === 1) {
        console.log(JSON.stringify(exportGuardrails(projectPath), null, 2));
    } else if (command === "approve" && id && args.length === 2) {
        console.log(JSON.stringify(approveGuardrail(projectPath, id), null, 2));
    } else if (command === "remove" && id && args.length === 2) {
        removeGuardrail(projectPath, id);
        console.log(`Removed guardrail ${id}`);
    } else if (command === "check" && (args.length === 1 || (args.length === 3 && id === "--rules" && args[2]))) {
        if (process.stdin.isTTY) throw new Error("Pipe a Git diff to guardrail check.");
        const patch = await readInput(maxPatchBytes);
        const report = args[2]
            ? checkExportedGuardrails(readFileSync(args[2], "utf-8"), patch)
            : checkChanges(projectPath, patch);
        console.log(JSON.stringify(report, null, 2));
        process.exitCode = report.violationCount > 0 ? 1 : 0;
    } else if (command === "hook" && args.length === 1) {
        try {
            console.log(JSON.stringify(runGuardrailHook(await readInput(maxPatchBytes))));
        } catch {
            console.log(JSON.stringify({
                systemMessage: "GYO Guardrails could not check the working diff. Run guardrail check manually to diagnose.",
            }));
        }
    } else {
        throw new Error("Usage: gyo-agents-mcp guardrail list | approve <id> | remove <id> | export | check [--rules <file>] | hook");
    }
}
