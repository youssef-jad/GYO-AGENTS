import { createHash } from "crypto";
import {
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    writeFileSync,
} from "fs";
import { join } from "path";
import { dataDirectory } from "./json-store.js";
import { execFileSync } from "child_process";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ChangeSeverity = "high" | "medium" | "low";

interface DirectorySnapshot {
    topLevelDirs: string[];
}

interface DependencySnapshot {
    manifests: Record<string, string>; // filename → SHA-256
    packageNames: string[];
}

interface GitSnapshot {
    headHash: string;
    commitCount: number;
    isConventional: boolean;
    ticketPrefixes: string[];
    topVerbs: string[];
}

interface DomainSnapshot {
    topKeywords: string[]; // top 8
}

interface AgentConfigSnapshot {
    presentConfigs: string[];
}

export interface ProjectSnapshot {
    label: string;
    projectPath: string;
    capturedAt: string;
    directories: DirectorySnapshot;
    dependencies: DependencySnapshot;
    git: GitSnapshot;
    domains: DomainSnapshot;
    agentConfigs: AgentConfigSnapshot;
}

export interface ChangeEntry {
    signal: string;
    severity: ChangeSeverity;
    description: string;
    suggestedAction: string;
}

export interface SyncReport {
    upToDate: boolean;
    changeCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    recommendRegeneration: boolean;
    changes: ChangeEntry[];
    snapshotLabel: string;
    snapshotAge: string;
}

// ─── Known agent config files ───────────────────────────────────────────────────

const KNOWN_AGENT_CONFIGS = [
    "CLAUDE.md",
    "AGENTS.md",
    "GEMINI.md",
    ".clinerules",
    ".windsurfrules",
    ".aider.conf.yml",
    "CONVENTIONS.md",
    ".cursorrules",
    ".kiro",
    ".continue",
    ".github/copilot-instructions.md",
    ".roo",
    ".cursor/rules",
];

const IGNORED_DIRS = new Set([
    "node_modules", "dist", "build", "vendor", ".git", ".next",
    "out", "coverage", ".turbo", "tmp", ".cache",
]);

const MANIFEST_FILES = [
    "package.json", "composer.json", "go.mod", "Gemfile", "requirements.txt",
    "Pipfile", "pyproject.toml", "Cargo.toml", "pom.xml", "build.gradle",
];

// ─── Storage ───────────────────────────────────────────────────────────────────

function getSnapshotDir(): string {
    const dir = join(dataDirectory, "snapshots");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
}

function projectKey(projectPath: string): string {
    return createHash("sha256").update(projectPath).digest("hex").slice(0, 16);
}

function snapshotPath(projectPath: string): string {
    return join(getSnapshotDir(), `${projectKey(projectPath)}.json`);
}

function loadSnapshot(projectPath: string): ProjectSnapshot | null {
    const p = snapshotPath(projectPath);
    if (!existsSync(p)) return null;
    try {
        return JSON.parse(readFileSync(p, "utf-8")) as ProjectSnapshot;
    } catch {
        return null;
    }
}

function saveSnapshot(snapshot: ProjectSnapshot): void {
    writeFileSync(snapshotPath(snapshot.projectPath), JSON.stringify(snapshot, null, 2), "utf-8");
}

// ─── Capture helpers ───────────────────────────────────────────────────────────

function captureDirectories(projectPath: string): DirectorySnapshot {
    try {
        const entries = readdirSync(projectPath, { withFileTypes: true });
        const topLevelDirs = entries
            .filter(e => e.isDirectory() && !IGNORED_DIRS.has(e.name) && !e.name.startsWith("."))
            .map(e => e.name)
            .sort();
        return { topLevelDirs };
    } catch {
        return { topLevelDirs: [] };
    }
}

function sha256File(filePath: string): string {
    try {
        return createHash("sha256").update(readFileSync(filePath)).digest("hex");
    } catch {
        return "";
    }
}

function parsePackageNames(projectPath: string): string[] {
    const pkgPath = join(projectPath, "package.json");
    if (!existsSync(pkgPath)) return [];
    try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        return Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).slice(0, 30);
    } catch {
        return [];
    }
}

function captureDependencies(projectPath: string): DependencySnapshot {
    const manifests: Record<string, string> = {};
    for (const file of MANIFEST_FILES) {
        const full = join(projectPath, file);
        if (existsSync(full)) manifests[file] = sha256File(full);
    }
    return { manifests, packageNames: parsePackageNames(projectPath) };
}

function runGit(projectPath: string, ...args: string[]): string {
    return execFileSync("git", args, { cwd: projectPath, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 15_000 }).trim();
}

function captureGit(projectPath: string): GitSnapshot {
    try {
        const headHash = runGit(projectPath, "rev-parse", "HEAD");
        const commitCount = parseInt(runGit(projectPath, "rev-list", "--count", "HEAD"), 10) || 0;

        const msgs = runGit(projectPath, "log", "--pretty=%s", "-n", "200").split("\n").filter(Boolean);
        const conventional = msgs.filter(m => /^(feat|fix|chore|docs|style|refactor|test|perf|ci|build|revert)(\(.+\))?:/.test(m));
        const isConventional = conventional.length > msgs.length * 0.4;

        const ticketRe = /^([A-Z]{2,8}-\d+)/;
        const ticketPrefixes = [...new Set(msgs.map(m => {
            const match = m.match(ticketRe);
            return match ? match[1].replace(/-\d+$/, "") : null;
        }).filter(Boolean) as string[])].slice(0, 5);

        const verbRe = /^(?:[a-z]+\(.+\):\s*|[A-Z]+-\d+\s+)?([a-z]+)/i;
        const verbFreq: Record<string, number> = {};
        for (const m of msgs) {
            const match = m.match(verbRe);
            if (match) {
                const v = match[1].toLowerCase();
                verbFreq[v] = (verbFreq[v] || 0) + 1;
            }
        }
        const topVerbs = Object.entries(verbFreq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([v]) => v);

        return { headHash, commitCount, isConventional, ticketPrefixes, topVerbs };
    } catch {
        return { headHash: "", commitCount: 0, isConventional: false, ticketPrefixes: [], topVerbs: [] };
    }
}

function captureDomains(projectPath: string): DomainSnapshot {
    try {
        const msgs = runGit(projectPath, "log", "--pretty=%s%b", "-n", "300").split("\n").filter(Boolean);
        const stopWords = new Set(["the", "a", "an", "and", "or", "in", "on", "to", "for", "of", "with", "fix", "add", "feat", "chore", "update", "change", "remove"]);
        const freq: Record<string, number> = {};
        for (const m of msgs) {
            for (const word of m.toLowerCase().split(/\W+/)) {
                if (word.length > 3 && !stopWords.has(word)) {
                    freq[word] = (freq[word] || 0) + 1;
                }
            }
        }
        const topKeywords = Object.entries(freq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([k]) => k);
        return { topKeywords };
    } catch {
        return { topKeywords: [] };
    }
}

function captureAgentConfigs(projectPath: string): AgentConfigSnapshot {
    const presentConfigs = KNOWN_AGENT_CONFIGS.filter(c => existsSync(join(projectPath, c)));
    return { presentConfigs };
}

// ─── Public: snapshot ──────────────────────────────────────────────────────────

export function snapshotConfig(projectPath: string, label = "baseline"): ProjectSnapshot {
    const snapshot: ProjectSnapshot = {
        label,
        projectPath,
        capturedAt: new Date().toISOString(),
        directories: captureDirectories(projectPath),
        dependencies: captureDependencies(projectPath),
        git: captureGit(projectPath),
        domains: captureDomains(projectPath),
        agentConfigs: captureAgentConfigs(projectPath),
    };
    saveSnapshot(snapshot);
    return snapshot;
}

// ─── Public: sync (diff) ───────────────────────────────────────────────────────

export function syncAgentConfig(projectPath: string): SyncReport {
    const baseline = loadSnapshot(projectPath);
    if (!baseline) {
        return {
            upToDate: false,
            changeCount: 0,
            highCount: 0,
            mediumCount: 0,
            lowCount: 0,
            recommendRegeneration: false,
            changes: [{
                signal: "no-snapshot",
                severity: "high",
                description: "No baseline snapshot found for this project.",
                suggestedAction: "Run snapshot_config first to capture a baseline, then call sync_agent_config after making changes.",
            }],
            snapshotLabel: "",
            snapshotAge: "",
        };
    }

    const live = {
        directories: captureDirectories(projectPath),
        dependencies: captureDependencies(projectPath),
        git: captureGit(projectPath),
        domains: captureDomains(projectPath),
        agentConfigs: captureAgentConfigs(projectPath),
    };

    const changes: ChangeEntry[] = [];

    // 1. Directory changes
    const oldDirs = new Set(baseline.directories.topLevelDirs);
    const newDirs = new Set(live.directories.topLevelDirs);
    const addedDirs = live.directories.topLevelDirs.filter(d => !oldDirs.has(d));
    const removedDirs = baseline.directories.topLevelDirs.filter(d => !newDirs.has(d));

    if (addedDirs.length > 0) {
        changes.push({
            signal: "new-directories",
            severity: "high",
            description: `New top-level directories detected: ${addedDirs.join(", ")}`,
            suggestedAction: "Update the Project Structure / Architecture section of your agent config files.",
        });
    }
    if (removedDirs.length > 0) {
        changes.push({
            signal: "removed-directories",
            severity: "medium",
            description: `Removed top-level directories: ${removedDirs.join(", ")}`,
            suggestedAction: "Update the Project Structure section to remove stale directory references.",
        });
    }

    // 2. Dependency manifest changes
    for (const [file, oldHash] of Object.entries(baseline.dependencies.manifests)) {
        const newHash = live.dependencies.manifests[file];
        if (newHash && newHash !== oldHash) {
            changes.push({
                signal: "manifest-changed",
                severity: "medium",
                description: `${file} has changed since the snapshot.`,
                suggestedAction: "Update the Architecture / Essential Commands sections with new dependencies.",
            });
        }
    }
    // New manifests not in baseline
    for (const file of Object.keys(live.dependencies.manifests)) {
        if (!(file in baseline.dependencies.manifests)) {
            changes.push({
                signal: "new-manifest",
                severity: "medium",
                description: `New dependency manifest found: ${file}`,
                suggestedAction: "Update the Architecture section to reflect the new package ecosystem.",
            });
        }
    }

    // 3. Commit style evolution
    if (baseline.git.isConventional !== live.git.isConventional) {
        changes.push({
            signal: "commit-style-changed",
            severity: "high",
            description: `Commit style changed from ${baseline.git.isConventional ? "conventional" : "freeform"} to ${live.git.isConventional ? "conventional" : "freeform"}.`,
            suggestedAction: "Update the Commit Format section and Developer Style in all agent config files.",
        });
    }

    // 4. New ticket prefix patterns
    const oldPrefixes = new Set(baseline.git.ticketPrefixes);
    const newPrefixes = live.git.ticketPrefixes.filter(p => !oldPrefixes.has(p));
    if (newPrefixes.length > 0) {
        changes.push({
            signal: "new-ticket-prefix",
            severity: "high",
            description: `New ticket prefix pattern(s) detected: ${newPrefixes.join(", ")}`,
            suggestedAction: "Update the Commit Format section with the new ticket prefix pattern.",
        });
    }

    // 5. New commits since snapshot
    const commitDelta = live.git.commitCount - baseline.git.commitCount;
    if (commitDelta >= 30) {
        changes.push({
            signal: "many-new-commits",
            severity: "medium",
            description: `${commitDelta} new commits since snapshot.`,
            suggestedAction: "Refresh the Developer Style section — commit patterns and top verbs may have shifted.",
        });
    }

    // 6. Domain focus shift
    const oldKeywords = new Set(baseline.domains.topKeywords);
    const newKeywords = live.domains.topKeywords.filter(k => !oldKeywords.has(k));
    if (newKeywords.length >= 2) {
        changes.push({
            signal: "domain-focus-shift",
            severity: "medium",
            description: `Domain focus shifted — ${newKeywords.length} new top keywords: ${newKeywords.join(", ")}`,
            suggestedAction: "Update the Domain Focus table in your agent config files.",
        });
    }

    // 7. Agent config files added / removed
    const oldConfigs = new Set(baseline.agentConfigs.presentConfigs);
    const newConfigs = new Set(live.agentConfigs.presentConfigs);
    const addedConfigs = live.agentConfigs.presentConfigs.filter(c => !oldConfigs.has(c));
    const removedConfigs = baseline.agentConfigs.presentConfigs.filter(c => !newConfigs.has(c));
    if (addedConfigs.length > 0 || removedConfigs.length > 0) {
        const desc = [
            addedConfigs.length ? `Added: ${addedConfigs.join(", ")}` : "",
            removedConfigs.length ? `Removed: ${removedConfigs.join(", ")}` : "",
        ].filter(Boolean).join(". ");
        changes.push({
            signal: "agent-configs-changed",
            severity: "low",
            description: `Agent config files changed. ${desc}`,
            suggestedAction: "Update the AGENTS.md rules reference to reflect the current set of config files.",
        });
    }

    const highCount = changes.filter(c => c.severity === "high").length;
    const mediumCount = changes.filter(c => c.severity === "medium").length;
    const lowCount = changes.filter(c => c.severity === "low").length;
    const recommendRegeneration = highCount >= 2;

    const ageMs = Date.now() - new Date(baseline.capturedAt).getTime();
    const ageDays = Math.floor(ageMs / 86_400_000);
    const snapshotAge = ageDays === 0 ? "today" : ageDays === 1 ? "1 day ago" : `${ageDays} days ago`;

    return {
        upToDate: changes.length === 0,
        changeCount: changes.length,
        highCount,
        mediumCount,
        lowCount,
        recommendRegeneration,
        changes,
        snapshotLabel: baseline.label,
        snapshotAge,
    };
}

// ─── Formatters ────────────────────────────────────────────────────────────────

export function formatSnapshotSummary(snapshot: ProjectSnapshot): string {
    const lines = [
        `## Snapshot captured — "${snapshot.label}"`,
        `**Project:** ${snapshot.projectPath}`,
        `**Captured at:** ${snapshot.capturedAt}`,
        "",
        "### What was recorded",
        `- **Directories (${snapshot.directories.topLevelDirs.length}):** ${snapshot.directories.topLevelDirs.join(", ") || "(none)"}`,
        `- **Manifests tracked:** ${Object.keys(snapshot.dependencies.manifests).join(", ") || "(none)"}`,
        `- **Git:** ${snapshot.git.commitCount} commits, ${snapshot.git.isConventional ? "conventional" : "freeform"} style${snapshot.git.ticketPrefixes.length ? `, prefixes: ${snapshot.git.ticketPrefixes.join(", ")}` : ""}`,
        `- **Top domains:** ${snapshot.domains.topKeywords.join(", ") || "(none)"}`,
        `- **Agent configs present:** ${snapshot.agentConfigs.presentConfigs.join(", ") || "(none)"}`,
        "",
        "Call `sync_agent_config` at any time to check for drift against this baseline.",
    ];
    return lines.join("\n");
}

const SEVERITY_ICON: Record<ChangeSeverity, string> = {
    high: "🔴 High",
    medium: "🟡 Medium",
    low: "🔵 Low",
};

export function formatSyncReport(report: SyncReport): string {
    if (report.changes.length === 1 && report.changes[0].signal === "no-snapshot") {
        return [
            "## sync_agent_config — No baseline found",
            "",
            report.changes[0].description,
            "",
            `**Next step:** ${report.changes[0].suggestedAction}`,
        ].join("\n");
    }

    if (report.upToDate) {
        return [
            "## sync_agent_config — ✅ Up to date",
            "",
            `Baseline: "${report.snapshotLabel}" (${report.snapshotAge})`,
            "No meaningful changes detected. Your agent configs accurately reflect the current project state.",
        ].join("\n");
    }

    const lines = [
        `## sync_agent_config — ${report.changeCount} change(s) detected`,
        "",
        `Baseline: "${report.snapshotLabel}" (${report.snapshotAge})`,
        `Severity breakdown: ${report.highCount > 0 ? `🔴 ${report.highCount} high` : ""} ${report.mediumCount > 0 ? `🟡 ${report.mediumCount} medium` : ""} ${report.lowCount > 0 ? `🔵 ${report.lowCount} low` : ""}`.trim(),
        "",
    ];

    if (report.recommendRegeneration) {
        lines.push("⚡ **Regeneration recommended** — 2+ high-severity changes detected. It's faster to re-run `generate_full_agent_context` and regenerate your configs.");
        lines.push("");
    }

    lines.push("### Changes");
    for (const change of report.changes) {
        lines.push(`#### ${SEVERITY_ICON[change.severity]} — ${change.signal}`);
        lines.push(change.description);
        lines.push(`**Fix:** ${change.suggestedAction}`);
        lines.push("");
    }

    lines.push("---");
    lines.push("After applying patches, run `snapshot_config` again to advance the baseline.");

    return lines.join("\n");
}
