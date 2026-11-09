import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { realpathSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { z } from "zod";
import { correctionMap } from "./correction-map.js";
import { JsonStore, scopeKey } from "./json-store.js";
import { addedLines, maxPatchBytes, repoPathParts } from "./patch.js";

const ruleDefinition = z.object({
    id: z.string().uuid(),
    correctionId: z.string().min(1).max(100),
    lesson: z.string().min(1).max(2000),
    pathPattern: z.string().min(1).max(200),
    forbiddenLiteral: z.string().min(1).max(500),
});

type RuleDefinition = z.infer<typeof ruleDefinition>;

interface Guardrail extends RuleDefinition {
    projectPath: string;
    approvedAt: string | null;
}

const store = new JsonStore<{ version: number; rules: Guardrail[] }>("guardrails.json", () => ({
    version: 1, rules: [],
}));

function projectKey(projectPath: string): string {
    if (!isAbsolute(projectPath)) throw new Error("Provide the absolute project directory.");
    const path = realpathSync(projectPath);
    if (!statSync(path).isDirectory()) throw new Error("Provide a project directory.");
    return path;
}

function compilePathPattern(pattern: string): RegExp {
    const parts = repoPathParts(pattern);
    if (pattern.length > 200 || parts.filter(part => part === "**").length > 1 ||
        parts.some(part => part !== "**" && part.split("*").length > 2) || /[?\[\]{}]/.test(pattern)) {
        throw new Error("Use literal path segments, one * per segment, and at most one ** segment.");
    }
    const escaped = parts.map((part, i) => {
        if (part === "**") return i === parts.length - 1 ? ".*" : "(?:[^/]+/)*";
        const segments = part.split("*").map(text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
        return segments.join("[^/]*") + (i === parts.length - 1 ? "" : "/");
    });
    return new RegExp(`^${escaped.join("")}$`);
}

export function proposeGuardrail(input: {
    projectPath: string;
    correctionId: string;
    pathPattern: string;
    forbiddenLiteral: string;
}): Guardrail {
    const projectPath = projectKey(input.projectPath);
    compileRule({ pathPattern: input.pathPattern, forbiddenLiteral: input.forbiddenLiteral });

    const correction = correctionMap.getAll(projectPath).corrections.find(candidate =>
        candidate.id === input.correctionId && scopeKey(candidate.projectScope) === projectPath
    );
    if (!correction) throw new Error("Record a correction scoped to this project before proposing a guardrail.");
    if (correction.lesson.length > 2000) throw new Error("Use a correction with a lesson of up to 2,000 characters.");

    return store.update(data => {
        const existing = data.rules.find(rule =>
            rule.projectPath === projectPath && rule.correctionId === correction.id &&
            rule.pathPattern === input.pathPattern && rule.forbiddenLiteral === input.forbiddenLiteral
        );
        if (existing) return existing;

        const rule: Guardrail = {
            ...input,
            id: randomUUID(),
            projectPath,
            lesson: correction.lesson,
            approvedAt: null,
        };
        data.rules.push(rule);
        return rule;
    });
}

export function listGuardrails(projectPath: string): Guardrail[] {
    const project = projectKey(projectPath);
    return store.read().rules.filter(rule => rule.projectPath === project);
}

export function approveGuardrail(projectPath: string, id: string): Guardrail {
    const project = projectKey(projectPath);
    return store.update(data => {
        const rule = data.rules.find(candidate => candidate.projectPath === project && candidate.id === id);
        if (!rule) throw new Error("Guardrail not found in this project.");
        rule.approvedAt ??= new Date().toISOString();
        return rule;
    });
}

export function removeGuardrail(projectPath: string, id: string): void {
    const project = projectKey(projectPath);
    store.update(data => {
        const index = data.rules.findIndex(rule => rule.projectPath === project && rule.id === id);
        if (index === -1) throw new Error("Guardrail not found in this project.");
        data.rules.splice(index, 1);
    });
}

function compileRule(rule: Pick<RuleDefinition, "pathPattern" | "forbiddenLiteral">): RegExp {
    if (!rule.forbiddenLiteral.trim() || rule.forbiddenLiteral.length > 500 || /[\x00-\x1f\x7f]/.test(rule.forbiddenLiteral)) {
        throw new Error("Provide a non-blank, single-line literal up to 500 characters.");
    }
    return compilePathPattern(rule.pathPattern);
}

function approvedGuardrails(projectPath: string): Guardrail[] {
    return listGuardrails(projectPath).filter(rule => typeof rule.approvedAt === "string" && rule.approvedAt.length > 0);
}

export function getTaskRules(projectPath: string, paths: string[]): Guardrail[] {
    for (const path of paths) repoPathParts(path);
    return approvedGuardrails(projectPath).filter(rule => {
        const pattern = compileRule(rule);
        return paths.some(path => pattern.test(path));
    });
}

export function exportGuardrails(projectPath: string) {
    return {
        version: 1,
        rules: approvedGuardrails(projectPath).map(rule => ruleDefinition.parse(rule)),
    };
}

const exportedRules = z.object({ version: z.literal(1), rules: z.array(ruleDefinition) });

export function checkChanges(projectPath: string, patch: string) {
    return checkPatch(patch, approvedGuardrails(projectPath));
}

export function checkWorkingTree(projectPath: string) {
    const rules = approvedGuardrails(projectPath);
    if (!rules.length) return;
    const patch = execFileSync("git", [
        "-c", "core.quotePath=false", "diff", "--no-color", "--no-ext-diff", "--no-textconv",
        "--src-prefix=a/", "--dst-prefix=b/", "--no-relative", "--submodule=short", "HEAD", "--",
    ], {
        cwd: projectPath,
        encoding: "utf-8",
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
        maxBuffer: maxPatchBytes,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 5000,
    });
    return checkPatch(patch, rules);
}

export function checkExportedGuardrails(rulesJson: string, patch: string) {
    const { rules } = exportedRules.parse(JSON.parse(rulesJson));
    return checkPatch(patch, rules);
}

function checkPatch(patch: string, definitions: RuleDefinition[]) {
    const rules = definitions.map(rule => ({ rule, path: compileRule(rule) }));
    const violations: Array<{ ruleId: string; path: string; line: number; lesson: string }> = [];
    let checkedAddedLines = 0;
    let violationCount = 0;
    let currentPath: string | undefined;
    let matchingRules: typeof rules = [];
    for (const line of addedLines(patch)) {
        if (line.path !== currentPath) {
            currentPath = line.path;
            matchingRules = rules.filter(rule => rule.path.test(line.path));
        }
        if (matchingRules.length === 0) continue;
        checkedAddedLines++;
        for (const { rule } of matchingRules) {
            if (line.text.includes(rule.forbiddenLiteral)) {
                violationCount++;
                if (violations.length < 100) {
                    violations.push({ ruleId: rule.id, path: line.path, line: line.line, lesson: rule.lesson });
                }
            }
        }
    }
    return { approvedRules: rules.length, checkedAddedLines, violationCount, violations };
}
