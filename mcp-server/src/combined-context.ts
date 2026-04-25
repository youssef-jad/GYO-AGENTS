import { analyzeGitStyle, GitStyleReport } from "./git-analyzer.js";
import { getDomainContext, DomainContextResult } from "./code-validators.js";
import { TOOLS } from "./tools.js";
import { twinMemory, MemoryEntry } from "./twin-memory.js";

export interface FullAgentContext {
    projectPath: string;
    generatedAt: string;
    gitStyle: GitStyleReport | null;
    domainContexts: Record<string, DomainContextResult>;
    detectedDomains: string[];
    recommendedTools: RecommendedTool[];
    twinMemories: MemoryEntry[];
    readyToUse: boolean;
}

export interface RecommendedTool {
    toolId: string;
    toolName: string;
    mcpToolName: string;
    reason: string;
}

/**
 * Combines git analysis + domain scanning + tool recommendation into a single
 * rich context object — the "one-shot" input an agent needs before calling
 * get_prompt_* to generate config files.
 */
export function buildFullAgentContext(
    projectPath: string,
    domains: string[] = [],
    targetTools: string[] = []
): FullAgentContext {
    // Git analysis
    let gitStyle: GitStyleReport | null = null;
    try {
        gitStyle = analyzeGitStyle(projectPath);
    } catch {
        gitStyle = null;
    }

    // Auto-detect domains from git commit keywords if none provided
    const detectedDomains: string[] = [...domains];
    if (domains.length === 0 && gitStyle && !gitStyle.insufficientHistory) {
        const topKeywords = gitStyle.domainKeywords.slice(0, 5).map((d) => d.keyword);
        detectedDomains.push(...topKeywords);
    }

    // Domain context
    const domainContexts: Record<string, DomainContextResult> = {};
    for (const domain of detectedDomains) {
        try {
            domainContexts[domain] = getDomainContext(projectPath, domain);
        } catch {
            // skip
        }
    }

    // Tool recommendations
    const recommendedTools: RecommendedTool[] = [];
    const requestedToolIds = targetTools.map((t) => t.toLowerCase());

    for (const tool of TOOLS) {
        const isRequested =
            requestedToolIds.length === 0 ||
            requestedToolIds.includes(tool.id) ||
            requestedToolIds.includes(tool.displayName.toLowerCase());

        if (isRequested) {
            recommendedTools.push({
                toolId: tool.id,
                toolName: tool.displayName,
                mcpToolName: tool.name,
                reason:
                    requestedToolIds.length === 0
                        ? "All tools included — filter with targetTools parameter"
                        : `Explicitly requested`,
            });
        }
    }

    return {
        projectPath,
        generatedAt: new Date().toISOString(),
        gitStyle,
        domainContexts,
        detectedDomains,
        recommendedTools,
        twinMemories: twinMemory.getAll(),
        readyToUse: gitStyle !== null,
    };
}

export function formatFullAgentContext(ctx: FullAgentContext): string {
    const lines: string[] = [
        "# Full Agent Context",
        `**Project:** \`${ctx.projectPath}\``,
        `**Generated:** ${ctx.generatedAt}`,
        `**Status:** ${ctx.readyToUse ? "✅ Ready" : "⚠️ Git analysis failed — check path"}`,
        "",
    ];

    // ── Digital Twin Memories ──
    if (ctx.twinMemories.length > 0) {
        lines.push("## Digital Twin Persistent Memories");
        const prefs = ctx.twinMemories.filter(m => m.type === "preference");
        const sols = ctx.twinMemories.filter(m => m.type === "solution");
        const errs = ctx.twinMemories.filter(m => m.type === "mistake");

        if (prefs.length) {
            lines.push("### Preferences");
            prefs.forEach(p => lines.push(`- **${p.topic}**: ${p.content}`));
        }
        if (sols.length) {
            lines.push("### Standard Solutions");
            sols.forEach(s => lines.push(`- **${s.topic}**: ${s.content}`));
        }
        if (errs.length) {
            lines.push("### Mistakes to Avoid");
            errs.forEach(e => lines.push(`- **${e.topic}**: ${e.content}`));
        }
        lines.push("");
    }

    // ── Git Style Summary ──
    if (ctx.gitStyle && !ctx.gitStyle.insufficientHistory) {
        const g = ctx.gitStyle;
        lines.push("## Developer & Commit Style");
        lines.push(`- **Developer:** ${g.developer.name} <${g.developer.email}>`);
        lines.push(`- **Commits:** ${g.totalCommits} (${g.dateRange.earliest} → ${g.dateRange.latest})`);
        lines.push(`- **Conventional Commits:** ${g.commitFormat.conventionalCommits ? "Yes" : "No"}`);
        if (g.commitFormat.ticketPrefixes.length > 0) {
            lines.push(`- **Ticket Prefixes:** ${g.commitFormat.ticketPrefixes.join(", ")}`);
        }
        lines.push(`- **Style evolution:** ${g.styleEvolution.note}`);
        lines.push("");

        lines.push("### Sample Commits");
        g.commitFormat.examples.slice(0, 5).forEach((e) => lines.push(`- \`${e}\``));
        lines.push("");

        if (g.topVerbs.length > 0) {
            lines.push("### Top Verbs");
            lines.push(g.topVerbs.slice(0, 6).map((v) => `\`${v.verb}\` ×${v.count}`).join("  ·  "));
            lines.push("");
        }
    } else if (ctx.gitStyle?.insufficientHistory) {
        lines.push(`> ⚠️ ${ctx.gitStyle.warning}`, "");
    }

    // ── Domain Contexts ──
    if (Object.keys(ctx.domainContexts).length > 0) {
        lines.push("## Detected Domains");
        for (const [domain, result] of Object.entries(ctx.domainContexts)) {
            const mods = result.matchedModules;
            if (mods.length === 0) continue;
            lines.push(`### ${domain}`);
            mods.forEach((m) => {
                const badge = m.confidence === "high" ? "🟢" : m.confidence === "medium" ? "🟡" : "🔵";
                lines.push(`- ${badge} \`${m.path}\` — ${m.reason}`);
            });
            lines.push("");
        }
    }

    // ── Recommended Tools ──
    lines.push("## Recommended Next Steps");
    lines.push("Call one of the following tools to generate native config files:");
    lines.push("");
    lines.push("| Tool | MCP Call | Output |");
    lines.push("|------|----------|--------|");
    for (const t of ctx.recommendedTools) {
        const tool = TOOLS.find((x) => x.id === t.toolId);
        lines.push(`| **${t.toolName}** | \`${t.mcpToolName}()\` | ${tool?.outputFormat ?? "—"} |`);
    }
    lines.push("");
    lines.push("> Tip: Paste the prompt from `get_prompt_<tool>` directly into your AI tool while inside the project workspace.");

    return lines.join("\n");
}
