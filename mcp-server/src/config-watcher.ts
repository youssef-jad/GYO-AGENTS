import { execSync } from "child_process";
import {
    existsSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
    readdirSync,
    statSync,
} from "fs";
import { join } from "path";
import { homedir } from "os";
import { createHash } from "crypto";

// ═══════════════════════════════════════════════════════════════════════════════
// Config Watcher — Living Config Auto-Updater
//
// Tracks a snapshot of the project state at the moment agent config files were
// generated. On subsequent calls it diffs the current state against that
// snapshot and emits a targeted patch report — only the sections that actually
// changed — so developers never have to regenerate everything from scratch.
//
// Snapshot store: ~/.gyo-agents/snapshots/{projectHash}.json
// One file per project, keyed by a hash of the absolute project path.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Constants ────────────────────────────────────────────────────────────────

const SNAPSHOTS_DIR = join(homedir(), ".gyo-agents", "snapshots");

/** Top-level directories we always ignore when capturing structure. */
const IGNORED_DIRS = new Set([
    "node_modules", "vendor", "dist", "build", ".git", ".next",
    "__pycache__", ".venv", "venv", "coverage", ".cache", "tmp", "temp",
]);

/** Agent config files we look for to detect which tools are in use. */
const KNOWN_CONFIG_FILES = [
    "AGENTS.md",
    "CLAUDE.md",
    ".clinerules",
    ".windsurfrules",
    ".cursorrules",
    "GEMINI.md",
    "CONVENTIONS.md",
    ".aider.conf.yml",
    ".cursor/rules",
    ".claude/settings.json",
    ".roo/rules",
    ".kiro/steering",
    ".github/copilot-instructions.md",
    ".continue/config.yaml",
];

/** Dependency manifest files we hash to detect dep changes. */
const DEP_MANIFESTS = [
    "package.json",
    "composer.json",
    "go.mod",
    "requirements.txt",
    "Gemfile",
    "Cargo.toml",
    "pyproject.toml",
    "pom.xml",
    "build.gradle",
];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DirectoryState {
    topLevelDirs: string[];
    topLevelFiles: string[];
    totalTopLevel: number;
}

export interface DependencyState {
    presentManifests: string[];
    /** SHA-256 hash of each manifest's content, keyed by filename */
    manifestHashes: Record<string, string>;
    /** Parsed dep names from package.json / composer.json if present */
    packageNames: string[];
}

export interface GitSnapshotState {
    headCommitHash: string;
    totalCommits: number;
    conventionalCommits: boolean;
    ticketPrefixes: string[];
    topVerbs: Array<{ verb: string; count: number }>;
    topDomains: Array<{ keyword: string; count: number }>;
    recentExamples: string[];
    averageMessageLength: number;
}

export interface ConfigSnapshot {
    version: number;
    projectPath: string;
    projectHash: string;
    capturedAt: string;
    directories: DirectoryState;
    dependencies: DependencyState;
    git: GitSnapshotState | null;
    detectedConfigFiles: string[];
    /** Human-readable label set by the caller, e.g. "after initial generation" */
    label?: string;
}

// ─── Change & Patch types ─────────────────────────────────────────────────────

export type ChangeSeverity = "high" | "medium" | "low";
export type ChangeKind =
    | "new_directories"
    | "removed_directories"
    | "dependency_changes"
    | "commit_style_evolved"
    | "domain_shift"
    | "significant_commit_growth"
    | "config_files_changed";

export interface ConfigChange {
    kind: ChangeKind;
    severity: ChangeSeverity;
    summary: string;
    details: string[];
}

export interface SuggestedPatch {
    section: string;
    affectedFiles: string[];
    instruction: string;
    suggestedContent?: string;
}

export interface ConfigSyncReport {
    projectPath: string;
    snapshotAge: string;
    capturedAt: string;
    changesDetected: boolean;
    changes: ConfigChange[];
    suggestedPatches: SuggestedPatch[];
    affectedFiles: string[];
    regenerateRecommended: boolean;
    summary: string;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

function ensureSnapshotsDir(): void {
    if (!existsSync(SNAPSHOTS_DIR)) {
        mkdirSync(SNAPSHOTS_DIR, { recursive: true });
    }
}

function projectHash(projectPath: string): string {
    return createHash("sha256").update(projectPath).digest("hex").slice(0, 12);
}

function snapshotPath(projectPath: string): string {
    ensureSnapshotsDir();
    return join(SNAPSHOTS_DIR, `${projectHash(projectPath)}.json`);
}

export function loadSnapshot(projectPath: string): ConfigSnapshot | null {
    const p = snapshotPath(projectPath);
    if (!existsSync(p)) return null;
    try {
        return JSON.parse(readFileSync(p, "utf-8")) as ConfigSnapshot;
    } catch {
        return null;
    }
}

export function saveSnapshot(snapshot: ConfigSnapshot): void {
    ensureSnapshotsDir();
    writeFileSync(snapshotPath(snapshot.projectPath), JSON.stringify(snapshot, null, 2), "utf-8");
}

// ─── State capture ────────────────────────────────────────────────────────────

function captureDirectories(projectPath: string): DirectoryState {
    let entries: string[] = [];
    try {
        entries = readdirSync(projectPath);
    } catch {
        return { topLevelDirs: [], topLevelFiles: [], totalTopLevel: 0 };
    }

    const topLevelDirs: string[] = [];
    const topLevelFiles: string[] = [];

    for (const entry of entries) {
        if (entry.startsWith(".") && entry !== ".cursor" && entry !== ".claude" &&
            entry !== ".roo" && entry !== ".kiro" && entry !== ".github") continue;
        const full = join(projectPath, entry);
        try {
            const st = statSync(full);
            if (st.isDirectory()) {
                if (!IGNORED_DIRS.has(entry)) topLevelDirs.push(entry);
            } else {
                topLevelFiles.push(entry);
            }
        } catch {
            // skip unreadable entries
        }
    }

    return {
        topLevelDirs: topLevelDirs.sort(),
        topLevelFiles: topLevelFiles.sort(),
        totalTopLevel: topLevelDirs.length + topLevelFiles.length,
    };
}

function hashFileContent(filePath: string): string {
    try {
        const content = readFileSync(filePath, "utf-8");
        return createHash("sha256").update(content).digest("hex").slice(0, 16);
    } catch {
        return "";
    }
}

function parsePackageNames(projectPath: string): string[] {
    const pkgPath = join(projectPath, "package.json");
    if (existsSync(pkgPath)) {
        try {
            const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
            const deps = Object.keys(pkg.dependencies ?? {});
            const devDeps = Object.keys(pkg.devDependencies ?? {});
            return [...deps, ...devDeps].slice(0, 50); // cap to avoid noise
        } catch {
            return [];
        }
    }

    const composerPath = join(projectPath, "composer.json");
    if (existsSync(composerPath)) {
        try {
            const composer = JSON.parse(readFileSync(composerPath, "utf-8"));
            const reqs = Object.keys(composer.require ?? {});
            const devReqs = Object.keys(composer["require-dev"] ?? {});
            return [...reqs, ...devReqs].slice(0, 50);
        } catch {
            return [];
        }
    }

    return [];
}

function captureDependencies(projectPath: string): DependencyState {
    const presentManifests: string[] = [];
    const manifestHashes: Record<string, string> = {};

    for (const manifest of DEP_MANIFESTS) {
        const full = join(projectPath, manifest);
        if (existsSync(full)) {
            presentManifests.push(manifest);
            manifestHashes[manifest] = hashFileContent(full);
        }
    }

    return {
        presentManifests,
        manifestHashes,
        packageNames: parsePackageNames(projectPath),
    };
}

function git(cwd: string, args: string): string {
    try {
        return execSync(`git ${args}`, {
            cwd,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
            timeout: 15_000,
        }).trim();
    } catch {
        return "";
    }
}

function captureGitState(projectPath: string): GitSnapshotState | null {
    const headHash = git(projectPath, "rev-parse HEAD");
    if (!headHash) return null;

    const totalStr = git(projectPath, "rev-list --count HEAD");
    const totalCommits = parseInt(totalStr || "0", 10);

    // Sample up to 200 recent commits for style
    const rawLog = git(projectPath, "log --no-merges --format=%s --max-count=200");
    const messages = rawLog.split("\n").filter(Boolean);

    const CONVENTIONAL_RE = /^(feat|fix|chore|docs|style|refactor|test|perf|build|ci|revert)(\(.+?\))?!?:\s/i;
    const TICKET_RE = /^([A-Z]+-\d+|#\d+)[\s:]/;

    const conventionalCount = messages.filter(m => CONVENTIONAL_RE.test(m)).length;
    const conventionalCommits = messages.length > 0
        ? conventionalCount / messages.length > 0.4
        : false;

    const ticketMap = new Map<string, number>();
    for (const m of messages) {
        const match = m.match(TICKET_RE);
        if (match) {
            const prefix = match[1].replace(/\d+/, "NNN");
            ticketMap.set(prefix, (ticketMap.get(prefix) ?? 0) + 1);
        }
    }
    const ticketPrefixes = [...ticketMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k]) => k);

    const verbMap = new Map<string, number>();
    const DOMAIN_SEEDS = [
        "auth", "user", "order", "payment", "product", "cart", "api",
        "db", "database", "cache", "redis", "queue", "event", "email",
        "notification", "admin", "report", "search", "upload", "file",
        "module", "config", "deploy", "migration", "model", "test",
        "service", "controller", "route", "middleware", "hook",
    ];
    const domainMap = new Map<string, number>();
    const allMessages = messages.join(" ").toLowerCase();

    for (const m of messages) {
        const cleaned = m
            .replace(/^(feat|fix|chore|docs|style|refactor|test|perf|build|ci|revert)(\(.+?\))?!?:\s*/i, "")
            .toLowerCase();
        const words = cleaned.split(/[\s\-_:()[\]]+/);
        const first = words[0];
        if (first && first.length > 2 && /^[a-z]+$/.test(first)) {
            verbMap.set(first, (verbMap.get(first) ?? 0) + 1);
        }
    }
    for (const seed of DOMAIN_SEEDS) {
        const re = new RegExp(`\\b${seed}s?\\b`, "gi");
        const matches = allMessages.match(re);
        if (matches && matches.length > 0) domainMap.set(seed, matches.length);
    }

    const topVerbs = [...verbMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([verb, count]) => ({ verb, count }));

    const topDomains = [...domainMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([keyword, count]) => ({ keyword, count }));

    const avgLen = messages.length > 0
        ? Math.round(messages.reduce((s, m) => s + m.length, 0) / messages.length)
        : 0;

    return {
        headCommitHash: headHash,
        totalCommits,
        conventionalCommits,
        ticketPrefixes,
        topVerbs,
        topDomains,
        recentExamples: messages.slice(0, 5),
        averageMessageLength: avgLen,
    };
}

function detectConfigFiles(projectPath: string): string[] {
    const found: string[] = [];
    for (const cfg of KNOWN_CONFIG_FILES) {
        if (existsSync(join(projectPath, cfg))) {
            found.push(cfg);
        }
    }
    return found;
}

// ─── Public: takeSnapshot ─────────────────────────────────────────────────────

/**
 * Capture the current state of a project and persist it as a snapshot.
 * Call this immediately after generating agent config files so the baseline
 * reflects what was actually written.
 */
export function takeSnapshot(projectPath: string, label?: string): ConfigSnapshot {
    const snapshot: ConfigSnapshot = {
        version: 1,
        projectPath,
        projectHash: projectHash(projectPath),
        capturedAt: new Date().toISOString(),
        directories: captureDirectories(projectPath),
        dependencies: captureDependencies(projectPath),
        git: captureGitState(projectPath),
        detectedConfigFiles: detectConfigFiles(projectPath),
        label,
    };
    saveSnapshot(snapshot);
    return snapshot;
}

// ─── Diffing ──────────────────────────────────────────────────────────────────

function diffDirectories(
    old: DirectoryState,
    current: DirectoryState
): ConfigChange | null {
    const oldSet = new Set(old.topLevelDirs);
    const curSet = new Set(current.topLevelDirs);

    const added = current.topLevelDirs.filter(d => !oldSet.has(d));
    const removed = old.topLevelDirs.filter(d => !curSet.has(d));

    if (added.length === 0 && removed.length === 0) return null;

    const details: string[] = [];
    if (added.length > 0) details.push(`New directories: ${added.map(d => `\`${d}/\``).join(", ")}`);
    if (removed.length > 0) details.push(`Removed directories: ${removed.map(d => `\`${d}/\``).join(", ")}`);

    return {
        kind: added.length > 0 ? "new_directories" : "removed_directories",
        severity: added.length > 0 ? "high" : "medium",
        summary: added.length > 0
            ? `${added.length} new top-level director${added.length > 1 ? "ies" : "y"} detected`
            : `${removed.length} director${removed.length > 1 ? "ies" : "y"} removed`,
        details,
    };
}

function diffDependencies(
    old: DependencyState,
    current: DependencyState
): ConfigChange | null {
    const changedManifests: string[] = [];
    const newManifests: string[] = [];

    for (const manifest of current.presentManifests) {
        if (!old.presentManifests.includes(manifest)) {
            newManifests.push(manifest);
        } else if (old.manifestHashes[manifest] !== current.manifestHashes[manifest]) {
            changedManifests.push(manifest);
        }
    }

    if (changedManifests.length === 0 && newManifests.length === 0) return null;

    const details: string[] = [];
    if (changedManifests.length > 0) {
        details.push(`Modified manifests: ${changedManifests.join(", ")}`);
    }
    if (newManifests.length > 0) {
        details.push(`New manifests detected: ${newManifests.join(", ")}`);
    }

    // Surface newly added package names for context
    const oldNames = new Set(old.packageNames);
    const newNames = current.packageNames.filter(n => !oldNames.has(n));
    if (newNames.length > 0 && newNames.length <= 10) {
        details.push(`New packages: ${newNames.slice(0, 10).join(", ")}`);
    } else if (newNames.length > 10) {
        details.push(`${newNames.length} new packages added`);
    }

    return {
        kind: "dependency_changes",
        severity: "medium",
        summary: `Dependencies changed (${changedManifests.length} modified, ${newManifests.length} new manifest${newManifests.length !== 1 ? "s" : ""})`,
        details,
    };
}

function diffGit(
    old: GitSnapshotState | null,
    current: GitSnapshotState | null
): ConfigChange[] {
    if (!old || !current) return [];

    const changes: ConfigChange[] = [];

    // ── Significant commit growth ──
    const newCommits = current.totalCommits - old.totalCommits;
    if (newCommits >= 30) {
        changes.push({
            kind: "significant_commit_growth",
            severity: newCommits >= 100 ? "high" : "medium",
            summary: `${newCommits} new commit${newCommits !== 1 ? "s" : ""} since last snapshot`,
            details: [
                `Was: ${old.totalCommits} commits → Now: ${current.totalCommits} commits`,
                "Commit style examples and domain focus may have evolved.",
            ],
        });
    }

    // ── Commit style change ──
    const styleChanged = old.conventionalCommits !== current.conventionalCommits;
    const formatChanged = Math.abs(old.averageMessageLength - current.averageMessageLength) > 15;
    const ticketChanged =
        JSON.stringify(old.ticketPrefixes.sort()) !== JSON.stringify(current.ticketPrefixes.sort());

    if (styleChanged || ticketChanged) {
        const details: string[] = [];
        if (styleChanged) {
            details.push(
                current.conventionalCommits
                    ? "Commit style shifted TO conventional commits (feat/fix/chore)"
                    : "Commit style shifted AWAY from conventional commits"
            );
        }
        if (ticketChanged) {
            const oldPfx = old.ticketPrefixes.join(", ") || "none";
            const curPfx = current.ticketPrefixes.join(", ") || "none";
            details.push(`Ticket prefixes: ${oldPfx} → ${curPfx}`);
        }
        if (formatChanged) {
            details.push(
                `Average message length: ${old.averageMessageLength} chars → ${current.averageMessageLength} chars`
            );
        }
        details.push("Recent examples:", ...current.recentExamples.slice(0, 3).map(e => `  • ${e}`));

        changes.push({
            kind: "commit_style_evolved",
            severity: "high",
            summary: "Commit message format has changed",
            details,
        });
    }

    // ── Domain shift ──
    const oldTopDomains = new Set(old.topDomains.slice(0, 5).map(d => d.keyword));
    const newTopDomains = current.topDomains.slice(0, 5).map(d => d.keyword);
    const newDomainEntries = newTopDomains.filter(d => !oldTopDomains.has(d));

    if (newDomainEntries.length >= 2) {
        changes.push({
            kind: "domain_shift",
            severity: "medium",
            summary: `${newDomainEntries.length} new domain focus area${newDomainEntries.length > 1 ? "s" : ""} detected`,
            details: [
                `New top domains: ${newDomainEntries.join(", ")}`,
                `Previous top domains: ${[...oldTopDomains].join(", ")}`,
                "The Developer Style section's Domain Focus table may be outdated.",
            ],
        });
    }

    return changes;
}

function diffConfigFiles(
    old: string[],
    current: string[]
): ConfigChange | null {
    const oldSet = new Set(old);
    const curSet = new Set(current);

    const added = current.filter(f => !oldSet.has(f));
    const removed = old.filter(f => !curSet.has(f));

    if (added.length === 0 && removed.length === 0) return null;

    const details: string[] = [];
    if (added.length > 0) details.push(`New config files: ${added.join(", ")}`);
    if (removed.length > 0) details.push(`Removed config files: ${removed.join(", ")}`);

    return {
        kind: "config_files_changed",
        severity: "low",
        summary: `Agent config files changed (${added.length} added, ${removed.length} removed)`,
        details,
    };
}

// ─── Patch suggestion generation ─────────────────────────────────────────────

/**
 * Maps detected changes to specific patch instructions.
 * Returns a list of targeted edits the developer (or agent) should make.
 */
function buildPatches(
    changes: ConfigChange[],
    detectedConfigs: string[]
): SuggestedPatch[] {
    const patches: SuggestedPatch[] = [];

    // Determine which agent config files are in play
    const hasCursor = detectedConfigs.some(f => f.includes(".cursor"));
    const hasClaude = detectedConfigs.some(f => f.includes("CLAUDE") || f.includes(".claude"));
    const hasCline = detectedConfigs.includes(".clinerules");
    const hasWindsurf = detectedConfigs.includes(".windsurfrules");
    const hasAgentsMd = detectedConfigs.includes("AGENTS.md");

    const structureFiles: string[] = [];
    if (hasCursor) structureFiles.push(".cursor/rules/architecture.mdc");
    if (hasClaude) structureFiles.push("CLAUDE.md");
    if (hasCline) structureFiles.push(".clinerules");
    if (hasWindsurf) structureFiles.push(".windsurfrules");
    if (hasAgentsMd) structureFiles.push("AGENTS.md");

    const styleFiles: string[] = [];
    if (hasCursor) styleFiles.push(".cursor/rules/developer-style.mdc");
    if (hasClaude) styleFiles.push("CLAUDE.md");
    if (hasCline) styleFiles.push(".clinerules");
    if (hasWindsurf) styleFiles.push(".windsurfrules");

    for (const change of changes) {
        switch (change.kind) {
            case "new_directories":
            case "removed_directories":
                patches.push({
                    section: "Project Structure / Architecture",
                    affectedFiles: structureFiles,
                    instruction: [
                        `Update the 'Project Structure' or 'Architecture at a Glance' section to reflect the current top-level layout.`,
                        `${change.details.join(". ")}.`,
                        `Run the generation prompt's Step 1 (Analyze Project) again and apply only the directory tree and module anatomy sections.`,
                    ].join(" "),
                });
                break;

            case "dependency_changes":
                patches.push({
                    section: "Dependencies / Architecture",
                    affectedFiles: structureFiles,
                    instruction: [
                        `Update any references to frameworks, libraries, or tooling versions.`,
                        `${change.details.join(". ")}.`,
                        `Check 'Essential Commands', 'Code Quality', and 'Architecture' sections for stale tool names or versions.`,
                    ].join(" "),
                });
                break;

            case "commit_style_evolved":
                patches.push({
                    section: "Commit Format / Developer Style",
                    affectedFiles: styleFiles,
                    instruction: [
                        `Update the 'Commit Format' and 'Developer Style' sections with the new commit pattern.`,
                        `${change.details.slice(0, 2).join(". ")}.`,
                        `Replace the example commits with the new ones listed above.`,
                    ].join(" "),
                });
                break;

            case "domain_shift":
                patches.push({
                    section: "Domain Focus / Developer Style",
                    affectedFiles: styleFiles,
                    instruction: [
                        `Update the 'Domain Focus' table to reflect new high-frequency areas.`,
                        `${change.details[0]}.`,
                        `Run \`analyze_git_style_on_the_fly\` on this project and copy the updated domain keyword table.`,
                    ].join(" "),
                });
                break;

            case "significant_commit_growth":
                patches.push({
                    section: "Developer Style (full refresh recommended)",
                    affectedFiles: styleFiles,
                    instruction: [
                        `${change.summary}. With this many new commits, the entire Developer Style section should be refreshed.`,
                        `Run \`analyze_git_style_on_the_fly\` and apply the full updated report to the style sections.`,
                    ].join(" "),
                });
                break;

            case "config_files_changed":
                patches.push({
                    section: "Agent Config Inventory",
                    affectedFiles: ["AGENTS.md"],
                    instruction: [
                        `Update the 'Rules' section in AGENTS.md to reference the current set of config files.`,
                        `${change.details.join(". ")}.`,
                    ].join(" "),
                });
                break;
        }
    }

    // Deduplicate by section
    const seen = new Map<string, SuggestedPatch>();
    for (const p of patches) {
        if (!seen.has(p.section)) seen.set(p.section, p);
    }
    return [...seen.values()];
}

// ─── Snapshot age helper ──────────────────────────────────────────────────────

function humanAge(capturedAt: string): string {
    const ms = Date.now() - new Date(capturedAt).getTime();
    const mins = Math.floor(ms / 60_000);
    const hours = Math.floor(ms / 3_600_000);
    const days = Math.floor(ms / 86_400_000);

    if (days >= 1) return `${days} day${days !== 1 ? "s" : ""} ago`;
    if (hours >= 1) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
    if (mins >= 1) return `${mins} minute${mins !== 1 ? "s" : ""} ago`;
    return "just now";
}

// ─── Public: syncAgentConfig ──────────────────────────────────────────────────

/**
 * Compare the current project state against the stored snapshot and return a
 * targeted patch report describing what has changed and exactly which config
 * file sections need to be updated.
 *
 * Returns an error-shaped report if no snapshot exists yet (user should call
 * snapshot_config first, typically right after generating agent configs).
 */
export function syncAgentConfig(projectPath: string): ConfigSyncReport {
    const snapshot = loadSnapshot(projectPath);

    if (!snapshot) {
        return {
            projectPath,
            snapshotAge: "never",
            capturedAt: "",
            changesDetected: false,
            changes: [],
            suggestedPatches: [],
            affectedFiles: [],
            regenerateRecommended: false,
            summary:
                `No snapshot found for this project. ` +
                `Call \`snapshot_config\` right after generating your agent config files to establish a baseline. ` +
                `Future calls to \`sync_agent_config\` will diff against that baseline.`,
        };
    }

    // Capture current state
    const currentDirs = captureDirectories(projectPath);
    const currentDeps = captureDependencies(projectPath);
    const currentGit = captureGitState(projectPath);
    const currentConfigs = detectConfigFiles(projectPath);

    // Diff each dimension
    const changes: ConfigChange[] = [];

    const dirChange = diffDirectories(snapshot.directories, currentDirs);
    if (dirChange) changes.push(dirChange);

    const depChange = diffDependencies(snapshot.dependencies, currentDeps);
    if (depChange) changes.push(depChange);

    const gitChanges = diffGit(snapshot.git, currentGit);
    changes.push(...gitChanges);

    const cfgChange = diffConfigFiles(snapshot.detectedConfigFiles, currentConfigs);
    if (cfgChange) changes.push(cfgChange);

    // Build patches
    const suggestedPatches = buildPatches(changes, currentConfigs);

    // Collect all affected files (unique, sorted)
    const affectedFilesSet = new Set<string>();
    for (const p of suggestedPatches) {
        for (const f of p.affectedFiles) affectedFilesSet.add(f);
    }
    const affectedFiles = [...affectedFilesSet].sort();

    // Decide if a full regeneration is more practical than patching
    const highSeverityCount = changes.filter(c => c.severity === "high").length;
    const regenerateRecommended = highSeverityCount >= 2;

    // Build summary
    let summary: string;
    if (changes.length === 0) {
        summary = `✅ Agent configs are up to date. No meaningful changes detected since the snapshot was taken ${humanAge(snapshot.capturedAt)}.`;
    } else {
        const highCount = changes.filter(c => c.severity === "high").length;
        const medCount = changes.filter(c => c.severity === "medium").length;
        summary = [
            `⚠️  ${changes.length} change${changes.length !== 1 ? "s" : ""} detected since snapshot (${humanAge(snapshot.capturedAt)}).`,
            highCount > 0 ? `${highCount} high-severity` : "",
            medCount > 0 ? `${medCount} medium-severity` : "",
            regenerateRecommended
                ? "Full regeneration recommended — too many high-impact changes to patch individually."
                : `${suggestedPatches.length} targeted patch${suggestedPatches.length !== 1 ? "es" : ""} suggested.`,
        ].filter(Boolean).join(" ");
    }

    return {
        projectPath,
        snapshotAge: humanAge(snapshot.capturedAt),
        capturedAt: snapshot.capturedAt,
        changesDetected: changes.length > 0,
        changes,
        suggestedPatches,
        affectedFiles,
        regenerateRecommended,
        summary,
    };
}

// ─── Formatting ───────────────────────────────────────────────────────────────

export function formatSyncReport(report: ConfigSyncReport): string {
    const lines: string[] = [
        "# Config Sync Report",
        `**Project:** \`${report.projectPath}\``,
        `**Snapshot age:** ${report.snapshotAge}`,
        "",
        `## Summary`,
        report.summary,
        "",
    ];

    if (!report.changesDetected) return lines.join("\n");

    // ── Changes ──
    lines.push("## Changes Detected");
    lines.push("");
    for (const change of report.changes) {
        const icon = change.severity === "high" ? "🔴" : change.severity === "medium" ? "🟡" : "🔵";
        lines.push(`### ${icon} ${change.summary}`);
        for (const detail of change.details) {
            lines.push(`- ${detail}`);
        }
        lines.push("");
    }

    // ── Patches ──
    if (report.suggestedPatches.length > 0) {
        lines.push("---");
        lines.push("");

        if (report.regenerateRecommended) {
            lines.push(
                "> 💡 **Regeneration recommended.** The changes are significant enough that re-running the full `GENERATE_AGENT.md` prompt will be faster than patching manually."
            );
            lines.push("");
        }

        lines.push("## Suggested Patches");
        lines.push("");
        lines.push("Apply these targeted edits to bring your agent configs back in sync:");
        lines.push("");

        for (let i = 0; i < report.suggestedPatches.length; i++) {
            const patch = report.suggestedPatches[i];
            lines.push(`### Patch ${i + 1}: ${patch.section}`);
            lines.push(`**Files to update:** ${patch.affectedFiles.map(f => `\`${f}\``).join(", ")}`);
            lines.push("");
            lines.push(patch.instruction);
            lines.push("");
        }
    }

    // ── Affected files summary ──
    if (report.affectedFiles.length > 0) {
        lines.push("---");
        lines.push("");
        lines.push("## Files Requiring Updates");
        for (const f of report.affectedFiles) {
            lines.push(`- \`${f}\``);
        }
        lines.push("");
        lines.push(
            "> After applying patches, run `snapshot_config` again to update the baseline."
        );
    }

    return lines.join("\n");
}

export function formatSnapshotConfirmation(snapshot: ConfigSnapshot): string {
    const lines: string[] = [
        "# Config Snapshot Saved",
        "",
        `**Project:** \`${snapshot.projectPath}\``,
        `**Captured at:** ${snapshot.capturedAt}`,
        snapshot.label ? `**Label:** ${snapshot.label}` : "",
        "",
        "## What was recorded",
        "",
        `- **Top-level dirs (${snapshot.directories.topLevelDirs.length}):** ${snapshot.directories.topLevelDirs.map(d => `\`${d}/\``).join(", ") || "none"}`,
        `- **Dep manifests (${snapshot.dependencies.presentManifests.length}):** ${snapshot.dependencies.presentManifests.join(", ") || "none"}`,
        `- **Packages tracked:** ${snapshot.dependencies.packageNames.length}`,
        snapshot.git
            ? `- **Git HEAD:** \`${snapshot.git.headCommitHash.slice(0, 8)}\` (${snapshot.git.totalCommits} commits)`
            : "- **Git:** not a git repo or no commits",
        `- **Agent config files (${snapshot.detectedConfigFiles.length}):** ${snapshot.detectedConfigFiles.join(", ") || "none detected"}`,
        "",
        "---",
        "",
        "Run `sync_agent_config` at any time to detect what has changed since this snapshot.",
    ].filter(line => line !== undefined);

    return lines.join("\n");
}
