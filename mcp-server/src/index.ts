#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { TOOLS, getPromptContent, getToolByName } from "./tools.js";
import { searchPrompts, formatSearchResults } from "./search.js";
import {
    buildManifest,
    MANIFEST_URI,
    MANIFEST_NAME,
    MANIFEST_DESCRIPTION,
} from "./resources.js";
import { analyzeGitStyle, formatGitStyleReport } from "./git-analyzer.js";
import {
    getDomainContext,
    formatDomainContext,
    validateApiResponse,
    formatApiResponseReport,
    checkCacheUsage,
    formatCacheReport,
} from "./code-validators.js";
import {
    buildFullAgentContext,
    formatFullAgentContext,
} from "./combined-context.js";
import { twinMemory, MemoryType } from "./twin-memory.js";

// ─── Server setup ─────────────────────────────────────────────────────────────

const server = new McpServer({
    name: "gyo-agents",
    version: "1.0.0",
});

// ─── Resources ────────────────────────────────────────────────────────────────

server.resource(MANIFEST_NAME, MANIFEST_URI, {
    description: MANIFEST_DESCRIPTION,
    mimeType: "application/json",
}, async () => ({
    contents: [
        {
            uri: MANIFEST_URI,
            mimeType: "application/json",
            text: JSON.stringify(buildManifest(), null, 2),
        },
    ],
}));

// ─── get_prompt_* tools (one per supported AI tool) ───────────────────────────

for (const tool of TOOLS) {
    server.tool(
        tool.name,
        tool.description,
        {
            includeUsageHints: z
                .boolean()
                .optional()
                .describe(
                    "If true, prepend a short usage note explaining how to run the prompt inside the target tool. Default: true."
                ),
        },
        async ({ includeUsageHints = true }) => {
            const content = getPromptContent(tool);

            const usageHint = includeUsageHints
                ? [
                    `<!-- GYO-AGENTS: ${tool.displayName} prompt -->`,
                    `<!-- Copy everything below this line and paste it into ${tool.displayName} while inside your project workspace. -->`,
                    `<!-- Output files: ${tool.outputFiles.join(", ")} -->`,
                    `<!-- Format: ${tool.outputFormat} -->`,
                    "",
                ].join("\n")
                : "";

            return {
                content: [
                    {
                        type: "text",
                        text: usageHint + content,
                    },
                ],
            };
        }
    );
}

// ─── search_prompts (RAG search across all prompts) ───────────────────────────

server.tool(
    "search_prompts",
    "Search across all 11 GYO-AGENTS prompts for a topic, concept, or keyword. Returns the most relevant sections from each matching prompt. Useful for finding how a specific concept (e.g. 'error handling', 'alwaysApply', 'guardrails') is handled across different tools.",
    {
        query: z
            .string()
            .min(1)
            .describe("Search query — e.g. 'error handling', 'commit format', 'alwaysApply', 'hooks'"),
        maxResultsPerTool: z
            .number()
            .int()
            .min(1)
            .max(10)
            .optional()
            .describe("Maximum sections to return per tool. Default: 3."),
    },
    async ({ query, maxResultsPerTool = 3 }) => {
        const results = searchPrompts(query, maxResultsPerTool);
        const formatted = formatSearchResults(results, query);

        return {
            content: [
                {
                    type: "text",
                    text: formatted,
                },
            ],
        };
    }
);

// ─── analyze_git_style_on_the_fly ─────────────────────────────────────────────

server.tool(
    "analyze_git_style_on_the_fly",
    [
        "Analyze the git commit history of any local project to extract its coding style.",
        "Runs git commands directly against the specified project path and returns:",
        "- Developer identity (name, email)",
        "- Total commit count and date range",
        "- Commit format detection (conventional commits, ticket prefixes, avg message length)",
        "- Top action verbs with frequency counts",
        "- Domain keyword frequency table (which parts of the codebase are touched most)",
        "- Style evolution: oldest vs. newest commits compared",
        "- Suggested commit format snippet ready to paste into AGENTS.md / CLAUDE.md / GEMINI.md",
        "",
        "This mirrors Step 2 ('Analyze Git History for Style') from all GYO-AGENTS prompts, but runs live instead of requiring the agent to run git commands manually.",
        "Requires: git must be installed and the projectPath must be a valid git repository.",
    ].join("\n"),
    {
        projectPath: z
            .string()
            .min(1)
            .describe(
                "Absolute path to the root of the git repository to analyze. Example: '/Users/you/Development/my-project'"
            ),
        outputFormat: z
            .enum(["markdown", "json"])
            .optional()
            .describe("Output format. 'markdown' (default) returns a human-readable report. 'json' returns the raw structured data."),
    },
    async ({ projectPath, outputFormat = "markdown" }) => {
        const report = analyzeGitStyle(projectPath);

        const text =
            outputFormat === "json"
                ? JSON.stringify(report, null, 2)
                : formatGitStyleReport(report);

        return {
            content: [
                {
                    type: "text",
                    text,
                },
            ],
        };
    }
);


// ─── get_domain_context ───────────────────────────────────────────────────────

server.tool(
    "get_domain_context",
    [
        "Scan a project's module/directory structure and return everything related to a given domain (e.g. 'POS', 'payment', 'inventory').",
        "Identifies matching modules with confidence levels (high/medium/low), related namespaces, route files, and other domain-related files.",
        "Mirrors the domain-focus section from developer-style.md steering files.",
        "Useful when an agent needs to know which modules, namespaces, and files to read/edit for a given business domain.",
    ].join("\n"),
    {
        projectPath: z.string().min(1).describe("Absolute path to the project root."),
        domain: z.string().min(1).describe("Domain keyword — e.g. 'POS', 'payment', 'inventory', 'auth'."),
        outputFormat: z.enum(["markdown", "json"]).optional().describe("Output format. Default: 'markdown'."),
    },
    async ({ projectPath, domain, outputFormat = "markdown" }) => {
        const result = getDomainContext(projectPath, domain);
        const text = outputFormat === "json" ? JSON.stringify(result, null, 2) : formatDomainContext(result);
        return { content: [{ type: "text", text }] };
    }
);

// ─── validate_api_response ────────────────────────────────────────────────────

server.tool(
    "validate_api_response",
    [
        "Scan PHP files and flag any use of response()->json() or new JsonResponse() that should instead use the project's Json facade (Json::item() / Json::collection()).",
        "Enforces the convention from api-development.md: all API responses MUST go through Json::item() or Json::collection().",
        "Returns a per-file, per-line violation report with fix suggestions.",
    ].join("\n"),
    {
        projectPath: z.string().min(1).describe("Absolute path to the project root."),
        scope: z.string().optional().describe("Optional subdirectory to limit the scan (e.g. 'app/Http/Controllers'). Defaults to full project."),
        outputFormat: z.enum(["markdown", "json"]).optional().describe("Output format. Default: 'markdown'."),
    },
    async ({ projectPath, scope, outputFormat = "markdown" }) => {
        const result = validateApiResponse(projectPath, scope);
        const text = outputFormat === "json" ? JSON.stringify(result, null, 2) : formatApiResponseReport(result);
        return { content: [{ type: "text", text }] };
    }
);

// ─── check_cache_usage ────────────────────────────────────────────────────────

server.tool(
    "check_cache_usage",
    [
        "Scan PHP files and flag any use of Cache:: facade or cache() helper that should instead use cache_store('read') or cache_store('write').",
        "Enforces the project's read/write cache split convention from guardrails.md.",
        "Returns a per-file, per-line violation report plus a count of correct cache_store() usages and a quick-fix snippet.",
    ].join("\n"),
    {
        projectPath: z.string().min(1).describe("Absolute path to the project root."),
        scope: z.string().optional().describe("Optional subdirectory to limit the scan (e.g. 'app/Services'). Defaults to full project."),
        outputFormat: z.enum(["markdown", "json"]).optional().describe("Output format. Default: 'markdown'."),
    },
    async ({ projectPath, scope, outputFormat = "markdown" }) => {
        const result = checkCacheUsage(projectPath, scope);
        const text = outputFormat === "json" ? JSON.stringify(result, null, 2) : formatCacheReport(result);
        return { content: [{ type: "text", text }] };
    }
);

// ─── generate_full_agent_context ──────────────────────────────────────────────

server.tool(
    "generate_full_agent_context",
    [
        "One-shot orchestration tool — runs git style analysis, domain module scanning, and tool recommendation in a single call.",
        "Returns a unified markdown (or JSON) report that gives an AI agent everything it needs to know before calling get_prompt_<tool>.",
        "Optionally auto-detects the top domains from git commit keywords if none are specified.",
        "Use this as the FIRST step before generating any config files.",
    ].join("\n"),
    {
        projectPath: z.string().min(1).describe("Absolute path to the git repository root."),
        domains: z
            .array(z.string())
            .optional()
            .describe("Business domains to scan for (e.g. ['POS', 'inventory']). If omitted, top domains are inferred from git history."),
        targetTools: z
            .array(z.string())
            .optional()
            .describe("Filter which AI tools to recommend (e.g. ['cursor', 'claudecode']). Omit to include all 11 tools."),
        outputFormat: z.enum(["markdown", "json"]).optional().describe("Output format. Default: 'markdown'."),
    },
    async ({ projectPath, domains = [], targetTools = [], outputFormat = "markdown" }) => {
        const ctx = buildFullAgentContext(projectPath, domains, targetTools);
        const text = outputFormat === "json"
            ? JSON.stringify(ctx, null, 2)
            : formatFullAgentContext(ctx);
        return { content: [{ type: "text", text }] };
    }
);

// ─── Digital Twin Memory Management ───────────────────────────────────────────

server.tool(
    "memorize",
    [
        "Store a permanent memory in the developer's Digital Twin.",
        "Use this when you learn a new preference, see a recurring solution, or notice a mistake that should be avoided across ALL projects.",
        "Types:",
        "  - 'preference': Code style, naming conventions, library choices.",
        "  - 'solution': A snippet or architectural pattern the developer likes.",
        "  - 'mistake': An anti-pattern or bug the developer wants to stop repeating."
    ].join("\n"),
    {
        type: z.enum(["preference", "solution", "mistake"]).describe("The category of the memory."),
        topic: z.string().min(1).describe("A short summary or tag (e.g., 'PHP strict typing', 'N+1 Eloquent')."),
        content: z.string().min(1).describe("The detailed instruction, snippet, or rule."),
    },
    async ({ type, topic, content }) => {
        const entry = twinMemory.memorize(type as MemoryType, topic, content);
        return { content: [{ type: "text", text: `Memory saved successfully.\nID: ${entry.id}\nTopic: ${entry.topic}` }] };
    }
);

server.tool(
    "forget_memory",
    "Delete a specific memory from the Digital Twin by its ID.",
    {
        id: z.string().min(1).describe("The unique ID of the memory to delete."),
    },
    async ({ id }) => {
        const success = twinMemory.forget(id);
        return { content: [{ type: "text", text: success ? `Memory ${id} forgotten.` : `Memory ${id} not found.` }] };
    }
);

server.tool(
    "search_memory",
    "Search the developer's Digital Twin memory for a keyword or topic.",
    {
        query: z.string().describe("Search query. Leave empty to list all memories."),
    },
    async ({ query }) => {
        const results = query.trim() ? twinMemory.search(query) : twinMemory.getAll();
        if (results.length === 0) {
            return { content: [{ type: "text", text: "No matching memories found in the Digital Twin." }] };
        }
        const text = results.map(r => `[${r.id}] ${r.type.toUpperCase()}: ${r.topic}\n${r.content}`).join("\n\n---\n\n");
        return { content: [{ type: "text", text }] };
    }
);

// ─── get_digital_twin_profile ─────────────────────────────────────────────────

server.tool(
    "get_digital_twin_profile",
    [
        "Generate the master 'Digital Twin' persona prompt for the developer.",
        "Combines live git history analysis with all saved personal preferences, solutions, and mistakes.",
        "Any agent can use this to instantly adopt the developer's exact coding philosophy and style."
    ].join("\n"),
    {
        projectPath: z.string().min(1).describe("Absolute path to the current project repository (to merge local style with global memory)."),
    },
    async ({ projectPath }) => {
        let gitText = "Git analysis failed or insufficient history.";
        try {
            const report = analyzeGitStyle(projectPath);
            if (!report.insufficientHistory) {
                gitText = formatGitStyleReport(report);
            }
        } catch (e) {
            // ignore
        }

        const memories = twinMemory.getAll();
        const preferences = memories.filter(m => m.type === "preference");
        const solutions = memories.filter(m => m.type === "solution");
        const mistakes = memories.filter(m => m.type === "mistake");

        let profileText = [
            `# Digital Twin Profile: ${twinMemory.getDeveloperName() || "Developer"}`,
            "This profile combines global cross-project memories with local project patterns.",
            "",
            "## 1. Global Preferences",
            preferences.length ? preferences.map(p => `### ${p.topic}\n${p.content}`).join("\n\n") : "No global preferences memorized yet.",
            "",
            "## 2. Standard Solutions & Patterns",
            solutions.length ? solutions.map(s => `### ${s.topic}\n${s.content}`).join("\n\n") : "No solutions memorized yet.",
            "",
            "## 3. Anti-Patterns & Mistakes to Avoid",
            mistakes.length ? mistakes.map(m => `### ${m.topic}\n${m.content}`).join("\n\n") : "No mistakes memorized yet.",
            "",
            "## 4. Local Project Style (from Git)",
            gitText
        ].join("\n");

        return { content: [{ type: "text", text: profileText }] };
    }
);

// ─── Start server ─────────────────────────────────────────────────────────────

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(
        `GYO-AGENTS MCP Server v1.0.0 started (stdio transport)\n` +
        `  ✦ ${TOOLS.length} get_prompt_* tools (one per AI coding tool)\n` +
        `  ✦ search_prompts — RAG search across all prompts\n` +
        `  ✦ analyze_git_style_on_the_fly — live git history analysis\n` +
        `  ✦ get_domain_context — module discovery by business domain\n` +
        `  ✦ validate_api_response — Json::item() convention enforcer\n` +
        `  ✦ check_cache_usage — cache_store() convention enforcer\n` +
        `  ✦ generate_full_agent_context — one-shot orchestration`
    );
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
