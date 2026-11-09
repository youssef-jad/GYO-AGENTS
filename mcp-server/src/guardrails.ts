import { randomUUID } from "node:crypto";
import { realpathSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { z } from "zod";
import { correctionMap } from "./correction-map.js";
import { JsonStore, scopeKey } from "./json-store.js";
import { committedTeamRules, gitHead, gitRoot, teamRulesPath, workingAddedLines } from "./guardrail-git.js";
import { addedLines, repoPathParts, type AddedLine } from "./patch.js";

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

const exportedRules = z.object({ version: z.literal(1), rules: z.array(ruleDefinition) });

function readRules(rulesJson: string): RuleDefinition[] {
    const { rules } = exportedRules.parse(JSON.parse(rulesJson));
    if (new Set(rules.map(rule => rule.id)).size !== rules.length) {
        throw new Error("Guardrail IDs must be unique.");
    }
    return rules;
}

function teamGuardrails(root: string, head: string | undefined) {
    if (!head) return [];
    const contents = committedTeamRules(root, head);
    if (contents === undefined) return [];
    try {
        return readRules(contents).map(rule => ({ ...rule, source: "team" as const }));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid committed ${teamRulesPath}: ${message}`);
    }
}

function combinedGuardrails<T extends RuleDefinition>(
    projectPath: string, local: T[], revision?: { root: string; head?: string },
) {
    const root = revision?.root ?? gitRoot(projectPath);
    const team = root ? teamGuardrails(root, revision ? revision.head : gitHead(root)) : [];
    const sharedIds = new Set(team.map(rule => rule.id));
    return [...team, ...local.filter(rule => !sharedIds.has(rule.id))];
}

export function listProjectGuardrails(projectPath: string) {
    return combinedGuardrails(projectPath, listGuardrails(projectPath));
}

export function getTaskRules(projectPath: string, paths: string[]) {
    for (const path of paths) repoPathParts(path);
    return combinedGuardrails(projectPath, approvedGuardrails(projectPath)).filter(rule => {
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

function compileRules(definitions: RuleDefinition[]) {
    return definitions.map(rule => ({ rule, path: compileRule(rule) }));
}

export function checkChanges(projectPath: string, patch: string) {
    const rules = combinedGuardrails(projectPath, approvedGuardrails(projectPath));
    return checkLines(addedLines(patch), compileRules(rules));
}

export function checkWorkingTree(cwd: string) {
    const root = gitRoot(cwd);
    if (!root) return;
    const head = gitHead(root);
    const rules = compileRules(combinedGuardrails(root, approvedGuardrails(root), { root, head }));
    const lines = rules.length === 0 ? [] : workingAddedLines(root, head, path =>
        rules.some(rule => rule.path.test(path))
    );
    return checkLines(lines, rules);
}

export function checkExportedGuardrails(rulesJson: string, patch: string) {
    return checkLines(addedLines(patch), compileRules(readRules(rulesJson)));
}

function checkLines(lines: Iterable<AddedLine>, rules: ReturnType<typeof compileRules>) {
    const violations: Array<{ ruleId: string; path: string; line: number; lesson: string }> = [];
    let checkedAddedLines = 0;
    let violationCount = 0;
    let currentPath: string | undefined;
    let matchingRules: typeof rules = [];
    for (const line of lines) {
        if (line.path === teamRulesPath) continue;
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
