import { execSync } from "child_process";
import { existsSync } from "fs";

export interface GitStyleReport {
    projectPath: string;
    developer: { name: string; email: string };
    totalCommits: number;
    analyzedCommits: number;
    dateRange: { earliest: string; latest: string };
    commitFormat: {
        conventionalCommits: boolean;
        ticketPrefixes: string[];
        averageMessageLength: number;
        examples: string[];
    };
    topVerbs: Array<{ verb: string; count: number }>;
    domainKeywords: Array<{ keyword: string; count: number }>;
    styleEvolution: {
        early: string[];
        recent: string[];
        changed: boolean;
        note: string;
    };
    mergeCommits: number;
    uniqueAuthors: string[];
    insufficientHistory: boolean;
    warning?: string;
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

function isGitRepo(path: string): boolean {
    return existsSync(path) && git(path, "rev-parse --is-inside-work-tree") === "true";
}

type KV = { key: string; count: number };

function topN(map: Map<string, number>, n: number): KV[] {
    return [...map.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([key, count]) => ({ key, count }));
}

const BOT_AUTHORS_RE = /dependabot|renovate|github-actions|ci\b|automation|bot\b/i;

const CONVENTIONAL_TYPES = [
    "feat", "fix", "chore", "docs", "style", "refactor",
    "test", "perf", "build", "ci", "revert", "wip",
];

const DOMAIN_SEEDS = [
    "auth", "user", "order", "payment", "product", "cart", "api",
    "db", "database", "cache", "redis", "queue", "event", "email",
    "notification", "admin", "report", "search", "upload", "file",
    "module", "config", "deploy", "migration", "model", "test",
    "service", "controller", "route", "middleware", "hook",
];

const TICKET_PREFIX_RE = /^([A-Z]+-\d+|#\d+)[\s:]/;

export function analyzeGitStyle(projectPath: string): GitStyleReport {
    if (!isGitRepo(projectPath)) {
        throw new Error(
            `"${projectPath}" is not a valid git repository. Make sure the path exists and has been initialized with git.`
        );
    }

    // ── Developer identity ──────────────────────────────────────────────────────
    const devName = git(projectPath, "config user.name") || "Unknown";
    const devEmail = git(projectPath, "config user.email") || "unknown@unknown";

    // ── Commit count ────────────────────────────────────────────────────────────
    const totalStr = git(projectPath, "rev-list --count HEAD");
    const totalCommits = parseInt(totalStr || "0", 10);

    if (totalCommits < 50) {
        return {
            projectPath,
            developer: { name: devName, email: devEmail },
            totalCommits,
            analyzedCommits: totalCommits,
            dateRange: { earliest: "", latest: "" },
            commitFormat: {
                conventionalCommits: false,
                ticketPrefixes: [],
                averageMessageLength: 0,
                examples: [],
            },
            topVerbs: [],
            domainKeywords: [],
            styleEvolution: { early: [], recent: [], changed: false, note: "" },
            mergeCommits: 0,
            uniqueAuthors: [],
            insufficientHistory: true,
            warning: `Only ${totalCommits} commits found — less than 50. Insufficient commit history for style analysis.`,
        };
    }

    // ── Fetch commit messages (up to 1 000, no merges, no bots) ────────────────
    const rawLog = git(
        projectPath,
        `log --no-merges --format=%an|||%ae|||%s|||%ai --max-count=1000`
    );

    const mergeCount = parseInt(
        git(projectPath, "log --merges --oneline --max-count=10000 | wc -l") || "0",
        10
    );

    const entries = rawLog
        .split("\n")
        .filter(Boolean)
        .map((line) => {
            const [author, email, subject, date] = line.split("|||");
            return { author, email, subject: subject ?? "", date: date ?? "" };
        })
        .filter((e) => !BOT_AUTHORS_RE.test(e.author ?? ""));

    // ── Date range ──────────────────────────────────────────────────────────────
    const earliest =
        git(projectPath, "log --no-merges --format=%ai --reverse --max-count=1")
            .split(" ")[0] ?? "";
    const latest =
        git(projectPath, "log --no-merges --format=%ai --max-count=1")
            .split(" ")[0] ?? "";

    // ── Unique authors ──────────────────────────────────────────────────────────
    const authorSet = new Set(entries.map((e) => e.author).filter(Boolean));
    const uniqueAuthors = [...authorSet];

    // ── Conventional commits detection ──────────────────────────────────────────
    const conventionalRe = new RegExp(
        `^(${CONVENTIONAL_TYPES.join("|")})(\\(.+?\\))?!?:\\s`,
        "i"
    );
    const conventionalCount = entries.filter((e) =>
        conventionalRe.test(e.subject)
    ).length;
    const conventionalCommits = conventionalCount / entries.length > 0.4;

    // ── Ticket prefixes ──────────────────────────────────────────────────────────
    const ticketMap = new Map<string, number>();
    for (const e of entries) {
        const m = e.subject.match(TICKET_PREFIX_RE);
        if (m) {
            const prefix = m[1].replace(/\d+/, "NNN");
            ticketMap.set(prefix, (ticketMap.get(prefix) ?? 0) + 1);
        }
    }
    const ticketPrefixes = topN(ticketMap, 5).map((x) => x.key);

    // ── Avg message length ───────────────────────────────────────────────────────
    const avgLen =
        entries.length > 0
            ? Math.round(
                entries.reduce((s, e) => s + e.subject.length, 0) / entries.length
            )
            : 0;

    // ── Examples (last 5 clean messages) ────────────────────────────────────────
    const examples = entries.slice(0, 5).map((e) => e.subject);

    // ── Top action verbs ─────────────────────────────────────────────────────────
    const verbMap = new Map<string, number>();
    for (const e of entries) {
        const words = e.subject
            .replace(/^(feat|fix|chore|docs|style|refactor|test|perf|build|ci|revert)(\(.+?\))?!?:\s*/i, "")
            .toLowerCase()
            .split(/[\s\-_:()]+/);
        const first = words[0];
        if (first && first.length > 2 && /^[a-z]+$/.test(first)) {
            verbMap.set(first, (verbMap.get(first) ?? 0) + 1);
        }
    }
    const topVerbs = topN(verbMap, 10).map(({ key, count }) => ({
        verb: key,
        count,
    }));

    // ── Domain keyword frequency ─────────────────────────────────────────────────
    const domainMap = new Map<string, number>();
    const allMessages = entries.map((e) => e.subject.toLowerCase()).join(" ");
    for (const seed of DOMAIN_SEEDS) {
        const re = new RegExp(`\\b${seed}s?\\b`, "gi");
        const matches = allMessages.match(re);
        if (matches && matches.length > 0) domainMap.set(seed, matches.length);
    }
    const domainKeywords = topN(domainMap, 12).map(({ key, count }) => ({
        keyword: key,
        count,
    }));

    // ── Style evolution (compare oldest 20% vs newest 20%) ──────────────────────
    const slice = Math.max(5, Math.floor(entries.length * 0.2));
    const earlyMsgs = entries.slice(-slice).map((e) => e.subject);
    const recentMsgs = entries.slice(0, slice).map((e) => e.subject);

    const earlyConventional =
        earlyMsgs.filter((m) => conventionalRe.test(m)).length / earlyMsgs.length;
    const recentConventional =
        recentMsgs.filter((m) => conventionalRe.test(m)).length / recentMsgs.length;

    const styleChanged =
        Math.abs(recentConventional - earlyConventional) > 0.3;
    const evolutionNote = styleChanged
        ? recentConventional > earlyConventional
            ? "Style evolved toward conventional commits over time."
            : "Style moved away from conventional commits in recent history."
        : "Commit style has been consistent throughout the project history.";

    return {
        projectPath,
        developer: { name: devName, email: devEmail },
        totalCommits,
        analyzedCommits: entries.length,
        dateRange: { earliest, latest },
        commitFormat: {
            conventionalCommits,
            ticketPrefixes,
            averageMessageLength: avgLen,
            examples,
        },
        topVerbs,
        domainKeywords,
        styleEvolution: {
            early: earlyMsgs.slice(0, 5),
            recent: recentMsgs.slice(0, 5),
            changed: styleChanged,
            note: evolutionNote,
        },
        mergeCommits: mergeCount,
        uniqueAuthors,
        insufficientHistory: false,
    };
}

export function formatGitStyleReport(report: GitStyleReport): string {
    if (report.insufficientHistory) {
        return [
            `# Git Style Analysis: ${report.projectPath}`,
            "",
            `> ⚠️  ${report.warning}`,
            "",
            `**Developer:** ${report.developer.name} <${report.developer.email}>`,
            `**Total Commits:** ${report.totalCommits}`,
        ].join("\n");
    }

    const lines: string[] = [
        `# Git Style Analysis`,
        `**Project:** \`${report.projectPath}\``,
        `**Developer:** ${report.developer.name} <${report.developer.email}>`,
        `**Date Range:** ${report.dateRange.earliest} → ${report.dateRange.latest}`,
        `**Total Commits:** ${report.totalCommits} (analyzed: ${report.analyzedCommits}, merges excluded)`,
        `**Unique Authors:** ${report.uniqueAuthors.length}`,
        `**Merge Commits:** ${report.mergeCommits}`,
        "",
        "---",
        "",
        "## Commit Format",
        `- **Conventional Commits:** ${report.commitFormat.conventionalCommits ? "✅ Yes (>40% adoption)" : "❌ No"}`,
        `- **Ticket Prefixes:** ${report.commitFormat.ticketPrefixes.length > 0 ? report.commitFormat.ticketPrefixes.join(", ") : "None detected"}`,
        `- **Average Message Length:** ${report.commitFormat.averageMessageLength} characters`,
        "",
        "### Recent Examples",
        ...report.commitFormat.examples.map((e) => `- \`${e}\``),
        "",
        "---",
        "",
        "## Top Action Verbs",
        "| Verb | Count |",
        "|------|-------|",
        ...report.topVerbs.map((v) => `| ${v.verb} | ${v.count} |`),
        "",
        "---",
        "",
        "## Domain Focus (Keyword Frequency)",
        "| Domain | Mentions |",
        "|--------|----------|",
        ...report.domainKeywords.map((d) => `| ${d.keyword} | ${d.count} |`),
        "",
        "---",
        "",
        "## Style Evolution",
        `**Changed:** ${report.styleEvolution.changed ? "Yes" : "No"}`,
        `**Note:** ${report.styleEvolution.note}`,
        "",
        "**Oldest commits (sample):**",
        ...report.styleEvolution.early.map((m) => `- \`${m}\``),
        "",
        "**Newest commits (sample):**",
        ...report.styleEvolution.recent.map((m) => `- \`${m}\``),
        "",
        "---",
        "",
        "## Suggested Commit Format for AGENTS.md",
        "",
        generateSuggestedFormat(report),
    ];

    return lines.join("\n");
}

function generateSuggestedFormat(report: GitStyleReport): string {
    if (report.commitFormat.conventionalCommits) {
        const prefix =
            report.commitFormat.ticketPrefixes.length > 0
                ? `${report.commitFormat.ticketPrefixes[0]}: `
                : "";
        return [
            "Based on your commit history, use this format:",
            "```",
            `${prefix}<type>(<scope>): <description>`,
            "",
            "Types: feat | fix | chore | docs | style | refactor | test | perf",
            "```",
            "",
            "Examples from your history:",
            ...report.commitFormat.examples.slice(0, 3).map((e) => `- \`${e}\``),
        ].join("\n");
    }

    return [
        "Based on your commit history, use this format:",
        "```",
        report.commitFormat.ticketPrefixes.length > 0
            ? `${report.commitFormat.ticketPrefixes[0]} <short description>`
            : "<short imperative description>",
        "```",
        "",
        "Examples from your history:",
        ...report.commitFormat.examples.slice(0, 3).map((e) => `- \`${e}\``),
    ].join("\n");
}
