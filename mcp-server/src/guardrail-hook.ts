import { isAbsolute } from "node:path";
import { z } from "zod";
import { checkWorkingTree } from "./guardrails.js";

const stopEvent = z.object({
    hook_event_name: z.literal("Stop"),
    cwd: z.string().refine(isAbsolute),
    stop_hook_active: z.boolean().default(false),
});

export function runGuardrailHook(input: string): { decision?: "block"; reason?: string; systemMessage?: string } {
    const event = stopEvent.parse(JSON.parse(input));
    const report = checkWorkingTree(event.cwd);
    if (!report?.violationCount) return {};

    const summary = `GYO Guardrails found ${report.violationCount} violation(s) in the working diff.`;
    const findings = report.violations.slice(0, 10).map(({ path, line, ruleId, lesson }) =>
        `- ${path}:${line} [${ruleId}] ${lesson.slice(0, 300)}`
    );
    const detail = [summary, ...findings].join("\n");

    // Recheck after the continuation, but give each turn at most one retry.
    if (event.stop_hook_active) return { systemMessage: detail };
    return {
        decision: "block",
        reason: `${detail}\nFix violations within the current task scope before finishing. Report any remaining violations.`,
    };
}
