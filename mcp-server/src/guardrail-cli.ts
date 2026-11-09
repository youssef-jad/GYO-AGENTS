import { readFileSync } from "node:fs";
import { approveGuardrail, checkChanges, checkExportedGuardrails, checkWorkingTree, exportGuardrails, listProjectGuardrails, removeGuardrail } from "./guardrails.js";
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
        console.log(JSON.stringify(listProjectGuardrails(projectPath), null, 2));
    } else if (command === "export" && args.length === 1) {
        console.log(JSON.stringify(exportGuardrails(projectPath), null, 2));
    } else if (command === "approve" && id && args.length === 2) {
        console.log(JSON.stringify(approveGuardrail(projectPath, id), null, 2));
    } else if (command === "remove" && id && args.length === 2) {
        removeGuardrail(projectPath, id);
        console.log(`Removed guardrail ${id}`);
    } else if (command === "check") {
        const workingTree = id === "--working-tree" && args.length === 2;
        const rulesFile = id === "--rules" && args.length === 3 ? args[2] : undefined;
        if (args.length !== 1 && !workingTree && !rulesFile) {
            throw new Error("Usage: gyo-agents-mcp guardrail check [--working-tree | --rules <file>]");
        }
        let report;
        if (workingTree) {
            report = checkWorkingTree(projectPath);
            if (!report) throw new Error("A working-tree check requires a Git repository.");
        } else {
            if (process.stdin.isTTY) throw new Error("Pipe a Git diff to guardrail check or use --working-tree.");
            const patch = await readInput(maxPatchBytes);
            report = rulesFile
                ? checkExportedGuardrails(readFileSync(rulesFile, "utf-8"), patch)
                : checkChanges(projectPath, patch);
        }
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
        throw new Error("Usage: gyo-agents-mcp guardrail list | approve <id> | remove <id> | export | check [--working-tree | --rules <file>] | hook");
    }
}
