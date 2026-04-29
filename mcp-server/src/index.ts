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
import { learnFromCodebase, formatBehavioralDNA, loadDNA, generateManifesto } from "./behavioral-dna.js";
import { decisionJournal, formatDecision, formatDecisionList } from "./decision-journal.js";
import { correctionMap, formatCorrectionPatterns, formatCorrectionStats, type CorrectionCategory } from "./correction-map.js";
import {
    takeSnapshot,
    syncAgentConfig,
    formatSyncReport,
    formatSnapshotConfirmation,
} from "./config-watcher.js";

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
        "  - 'mistake': An anti-pattern or bug the developer wants to stop repeating.",
        "",
        "Memories can be scoped to a project or kept global. Tags help with filtering.",
        "Before saving, checks for contradictions with existing memories on the same topic."
    ].join("\n"),
    {
        type: z.enum(["preference", "solution", "mistake"]).describe("The category of the memory."),
        topic: z.string().min(1).describe("A short summary or tag (e.g., 'PHP strict typing', 'N+1 Eloquent')."),
        content: z.string().min(1).describe("The detailed instruction, snippet, or rule."),
        tags: z.array(z.string()).optional().describe("Optional tags for filtering (e.g., ['typescript', 'react', 'testing'])."),
        projectScope: z.string().optional().describe("Optional project name/path to scope this memory. Omit for global memories."),
        confidence: z.enum(["low", "medium", "high"]).optional().describe("How confident this observation is. Default: 'medium'."),
    },
    async ({ type, topic, content, tags = [], projectScope, confidence = "medium" }) => {
        // Check for contradictions first
        const contradictions = twinMemory.findContradictions(type as MemoryType, topic, content);
        let warning = "";
        if (contradictions.length > 0) {
            warning = `\n\n⚠️ CONTRADICTION DETECTED — existing memories on the same topic:\n` +
                contradictions.map(c => `  [${c.id}] ${c.content}`).join("\n") +
                `\nConsider using update_memory to revise the existing entry, or forget_memory to remove it.`;
        }

        const entry = twinMemory.memorize(type as MemoryType, topic, content, tags, projectScope ?? null, confidence);
        return { content: [{ type: "text", text: `Memory saved successfully.\nID: ${entry.id}\nTopic: ${entry.topic}\nConfidence: ${entry.confidence}\nTags: ${entry.tags.length > 0 ? entry.tags.join(", ") : "(none)"}${warning}` }] };
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
    "Search the developer's Digital Twin memory for a keyword or topic. Optionally filter by project scope.",
    {
        query: z.string().describe("Search query. Leave empty to list all memories."),
        projectScope: z.string().optional().describe("Optional project name to filter memories (includes global + project-scoped)."),
    },
    async ({ query, projectScope }) => {
        const results = query.trim() ? twinMemory.search(query, projectScope) : twinMemory.getAll(projectScope);
        if (results.length === 0) {
            return { content: [{ type: "text", text: "No matching memories found in the Digital Twin." }] };
        }
        const text = results.map(r => {
            const meta = [
                `[${r.id}] ${r.type.toUpperCase()}: ${r.topic}`,
                r.tags.length > 0 ? `Tags: ${r.tags.join(", ")}` : null,
                r.projectScope ? `Project: ${r.projectScope}` : "Scope: global",
                `Confidence: ${r.confidence} · Used: ${r.useCount}×`,
            ].filter(Boolean).join(" | ");
            return `${meta}\n${r.content}`;
        }).join("\n\n---\n\n");
        return { content: [{ type: "text", text }] };
    }
);

// ─── update_memory ────────────────────────────────────────────────────────────

server.tool(
    "update_memory",
    [
        "Update an existing memory in the Digital Twin.",
        "Use this to refine a memory's content, tags, or confidence without deleting and re-creating it.",
        "Preserves the original creation date and use-count history.",
    ].join("\n"),
    {
        id: z.string().min(1).describe("The unique ID of the memory to update."),
        topic: z.string().optional().describe("New topic (leave out to keep current)."),
        content: z.string().optional().describe("New content (leave out to keep current)."),
        tags: z.array(z.string()).optional().describe("New tags (replaces existing tags)."),
        confidence: z.enum(["low", "medium", "high"]).optional().describe("New confidence level."),
    },
    async ({ id, topic, content, tags, confidence }) => {
        const updated = twinMemory.updateMemory(id, { topic, content, tags, confidence });
        if (!updated) {
            return { content: [{ type: "text", text: `Memory ${id} not found.` }] };
        }
        return { content: [{ type: "text", text: `Memory ${id} updated.\nTopic: ${updated.topic}\nConfidence: ${updated.confidence}\nUpdated at: ${updated.updatedAt}` }] };
    }
);

// ─── prune_stale_memories ─────────────────────────────────────────────────────

server.tool(
    "prune_stale_memories",
    [
        "Remove memories that haven't been used in a long time.",
        "Memories with useCount > 5 are protected from pruning regardless of age.",
        "Use this to keep the Digital Twin focused and relevant.",
    ].join("\n"),
    {
        days: z.number().int().min(1).describe("Remove memories unused for more than this many days."),
    },
    async ({ days }) => {
        const pruned = twinMemory.pruneStale(days);
        return { content: [{ type: "text", text: pruned > 0 ? `Pruned ${pruned} stale memories (unused for >${days} days).` : `No stale memories found. All memories were used within the last ${days} days or have high use counts.` }] };
    }
);

// ─── learn_from_codebase (Behavioral DNA) ─────────────────────────────────────

server.tool(
    "learn_from_codebase",
    [
        "Scan a codebase to build the developer's Behavioral DNA — the 'soul' of the Digital Twin.",
        "Unlike memorize (which stores explicit facts), this tool OBSERVES actual code and infers:",
        "",
        "  Layer 1 — Instincts: How you reflexively code (early returns vs nesting, functional vs imperative,",
        "    naming verbosity, function size, comment density, type strictness).",
        "",
        "  Layer 2 — Values: What you optimize for (error handling discipline, abstraction vs pragmatism,",
        "    input validation, tech debt acknowledgment).",
        "",
        "  Layer 3 — Growth: How you're changing over time. Each scan is a snapshot — the DNA tracks",
        "    which traits appear, strengthen, or fade across multiple scans.",
        "",
        "Run this on each project you work on. The DNA evolves with every scan — confidence increases",
        "for patterns seen repeatedly, and decays for patterns that disappear.",
        "Persists to ~/.gyo-agents/behavioral-dna.json alongside twin-memory.json.",
    ].join("\n"),
    {
        projectPath: z.string().min(1).describe("Absolute path to the project root to scan."),
        outputFormat: z.enum(["markdown", "json"]).optional().describe("Output format. Default: 'markdown'."),
    },
    async ({ projectPath, outputFormat = "markdown" }) => {
        const result = learnFromCodebase(projectPath);
        const summary = [
            `Scan complete. Analyzed ${projectPath}`,
            `  New traits discovered: ${result.newTraitsCount}`,
            `  Existing traits reinforced: ${result.reinforcedCount}`,
            `  Traits decayed: ${result.decayedCount}`,
            `  Total scans: ${result.dna.scanCount}`,
            "",
        ].join("\n");

        const text = outputFormat === "json"
            ? JSON.stringify(result.dna, null, 2)
            : summary + formatBehavioralDNA(result.dna);

        return { content: [{ type: "text", text }] };
    }
);

// ─── Decision Journal ─────────────────────────────────────────────────────────

server.tool(
    "record_decision",
    [
        "Record an architectural or technical decision in the Decision Journal.",
        "Captures: the context, options considered (with pros/cons), what was chosen, and WHY.",
        "When an agent faces a similar decision later, it can check if you already have a stance.",
        "Also checks for related past decisions and surfaces them.",
    ].join("\n"),
    {
        context: z.string().min(1).describe("What situation triggered this decision (e.g., 'Choosing a state management library for the new React app')."),
        domain: z.string().min(1).describe("Domain area (e.g., 'database', 'auth', 'state-management', 'testing', 'deployment')."),
        options: z.array(z.object({
            name: z.string().describe("Option name (e.g., 'Redux', 'Zustand', 'Context API')."),
            prosConsidered: z.array(z.string()).describe("Pros of this option."),
            consConsidered: z.array(z.string()).describe("Cons of this option."),
        })).min(1).describe("Options that were considered."),
        chosen: z.string().min(1).describe("Which option was chosen."),
        reasoning: z.string().min(1).describe("WHY this option was chosen — the most important field."),
        consequences: z.array(z.string()).optional().describe("Known tradeoffs accepted with this decision."),
        projectScope: z.string().optional().describe("Project this applies to. Omit for universal decisions."),
        tags: z.array(z.string()).optional().describe("Tags for searchability."),
    },
    async ({ context, domain, options, chosen, reasoning, consequences, projectScope, tags }) => {
        // Check for related past decisions
        const related = decisionJournal.findRelated(context, domain);
        let relatedText = "";
        if (related.length > 0) {
            relatedText = "\n\n📎 Related past decisions:\n" +
                related.map(d => `  [${d.id}] ${d.chosen} (${d.domain}) — ${d.reasoning.slice(0, 100)}...`).join("\n");
        }

        const decision = decisionJournal.record({
            context, domain, options, chosen, reasoning,
            consequences, projectScope, tags,
        });

        return { content: [{ type: "text", text: `Decision recorded.\nID: ${decision.id}\nChosen: ${decision.chosen}\nDomain: ${decision.domain}${relatedText}` }] };
    }
);

server.tool(
    "search_decisions",
    "Search the Decision Journal for past architectural and technical decisions.",
    {
        query: z.string().describe("Search query. Leave empty to list all active decisions."),
        domain: z.string().optional().describe("Filter by domain (e.g., 'database', 'auth')."),
        projectScope: z.string().optional().describe("Filter by project."),
    },
    async ({ query, domain, projectScope }) => {
        const results = decisionJournal.search(query, domain, projectScope);
        if (results.length === 0) {
            return { content: [{ type: "text", text: "No matching decisions found." }] };
        }
        return { content: [{ type: "text", text: formatDecisionList(results) }] };
    }
);

server.tool(
    "supersede_decision",
    "Mark a decision as superseded by a newer one. The old decision stays in the journal for history but won't appear in active searches.",
    {
        oldDecisionId: z.string().min(1).describe("ID of the decision being superseded."),
        newDecisionId: z.string().min(1).describe("ID of the decision that replaces it."),
    },
    async ({ oldDecisionId, newDecisionId }) => {
        const success = decisionJournal.supersede(oldDecisionId, newDecisionId);
        return { content: [{ type: "text", text: success ? `Decision ${oldDecisionId} marked as superseded by ${newDecisionId}.` : `Decision ${oldDecisionId} not found.` }] };
    }
);

// ─── Correction Map (Pair Programming Memory) ────────────────────────────────

server.tool(
    "record_correction",
    [
        "Record when you correct an agent's output — the pair programming memory.",
        "Every correction is a learning signal. Over time, the twin builds patterns from repeated corrections",
        "so the agent stops making the same mistakes with YOU specifically.",
        "",
        "Categories: naming, style, logic, pattern, removal, addition, simplification, hardening, other.",
    ].join("\n"),
    {
        category: z.enum(["naming", "style", "logic", "pattern", "removal", "addition", "simplification", "hardening", "other"])
            .describe("What kind of correction this is."),
        context: z.string().min(1).describe("What was the agent trying to do."),
        agentSuggested: z.string().min(1).describe("What the agent produced (code snippet or description)."),
        developerChose: z.string().min(1).describe("What you changed it to."),
        lesson: z.string().min(1).describe("The rule to learn (e.g., 'Always use descriptive names for boolean variables', 'Prefer early returns over nested if/else')."),
        language: z.string().optional().describe("Programming language (e.g., 'typescript', 'python')."),
        projectScope: z.string().optional().describe("Project this applies to. Omit for universal corrections."),
    },
    async ({ category, context, agentSuggested, developerChose, lesson, language, projectScope }) => {
        const result = correctionMap.recordCorrection({
            category: category as CorrectionCategory,
            context, agentSuggested, developerChose, lesson, language, projectScope,
        });

        let text = `Correction recorded.\nID: ${result.correction.id}\nCategory: ${result.correction.category}\nOccurrences: ${result.correction.occurrences}`;
        if (result.patternMatch) {
            text += `\n\n🧠 Pattern reinforced: "${result.patternMatch.rule}" (confidence: ${Math.round(result.patternMatch.confidence * 100)}%)`;
        }
        return { content: [{ type: "text", text }] };
    }
);

server.tool(
    "get_correction_patterns",
    [
        "Get all learned correction patterns — the generalized rules derived from your corrections.",
        "These are the things the agent should check before showing you code.",
        "Patterns gain confidence as more corrections reinforce them.",
    ].join("\n"),
    {
        outputFormat: z.enum(["markdown", "json"]).optional().describe("Output format. Default: 'markdown'."),
    },
    async ({ outputFormat = "markdown" }) => {
        const patterns = correctionMap.getPatterns();
        const stats = correctionMap.getStats();

        if (outputFormat === "json") {
            return { content: [{ type: "text", text: JSON.stringify({ stats, patterns }, null, 2) }] };
        }

        const text = [
            "# Correction Patterns — Pair Programming Memory",
            "",
            formatCorrectionStats(stats),
            "",
            "---",
            "",
            formatCorrectionPatterns(patterns),
        ].join("\n");

        return { content: [{ type: "text", text }] };
    }
);

// ─── Developer Manifesto ──────────────────────────────────────────────────────

server.tool(
    "review_as_developer",
    [
        "Pre-review code through the developer's lens BEFORE showing it to them.",
        "Loads the developer's correction patterns, behavioral DNA, and explicit preferences,",
        "then checks the provided code against all known patterns.",
        "",
        "Returns a list of issues the developer would likely flag, so the agent can fix them first.",
        "This is the code review personality — it catches the things YOU always change.",
        "",
        "Call this AFTER writing code but BEFORE presenting it to the developer.",
    ].join("\n"),
    {
        code: z.string().min(1).describe("The code to review."),
        language: z.string().optional().describe("Programming language (e.g., 'typescript'). Helps with language-specific checks."),
        context: z.string().optional().describe("What this code is for (e.g., 'new API endpoint for user registration')."),
    },
    async ({ code, language = "unknown", context = "" }) => {
        const patterns = correctionMap.getPatterns();
        const dna = loadDNA();
        const memories = twinMemory.getAll();
        const preferences = memories.filter(m => m.type === "preference");
        const mistakes = memories.filter(m => m.type === "mistake");

        const issues: string[] = [];
        const codeLower = code.toLowerCase();

        // Check against correction patterns
        for (const p of patterns) {
            if (p.confidence < 0.3) continue;
            // Check if the code contains patterns similar to what was corrected before
            for (const ex of p.examples) {
                const suggestedTerms = ex.suggested.toLowerCase().split(/\s+/).filter(t => t.length > 3);
                const matchCount = suggestedTerms.filter(t => codeLower.includes(t)).length;
                if (matchCount > suggestedTerms.length * 0.4 && suggestedTerms.length > 0) {
                    issues.push(`⚠️ **${p.category}** (${Math.round(p.confidence * 100)}% confidence): ${p.rule}\n   Pattern match: code resembles previously corrected output.`);
                    break;
                }
            }
        }

        // Check against behavioral DNA instincts
        const allTraits = [
            ...dna.instincts.controlFlow, ...dna.instincts.naming,
            ...dna.instincts.structure, ...dna.instincts.expressiveness,
        ].filter(t => t.confidence > 0.6);

        for (const trait of allTraits) {
            if (trait.signal === "early-return-preference") {
                // Check for deeply nested if/else without early returns
                const nestedElse = (code.match(/}\s*else\s*{/g) || []).length;
                const earlyReturns = (code.match(/^\s*return\b/gm) || []).length;
                if (nestedElse > 2 && earlyReturns === 0) {
                    issues.push(`🧬 **control-flow**: Developer prefers early returns / guard clauses. This code has ${nestedElse} nested else blocks and no early returns. Consider refactoring.`);
                }
            }
            if (trait.signal === "functional-iteration") {
                const forLoops = (code.match(/\bfor\s*\(/g) || []).length;
                if (forLoops > 2) {
                    issues.push(`🧬 **control-flow**: Developer prefers functional iteration (.map/.filter/.reduce). This code has ${forLoops} for-loops. Consider using functional alternatives where appropriate.`);
                }
            }
            if (trait.signal === "type-conscious") {
                const anyCount = (code.match(/:\s*any\b/g) || []).length;
                if (anyCount > 0) {
                    issues.push(`🧬 **expressiveness**: Developer is strict about types. Found ${anyCount} \`any\` type(s). Consider using specific types.`);
                }
            }
            if (trait.signal === "small-functions") {
                const functionMatches = code.match(/\b(function|async function)\s+\w+|(?:const|let)\s+\w+\s*=\s*(?:async\s*)?\(/g) || [];
                const lines = code.split("\n").length;
                if (functionMatches.length === 1 && lines > 50) {
                    issues.push(`🧬 **structure**: Developer writes small, focused functions. This appears to be a single function spanning ${lines} lines. Consider breaking it up.`);
                }
            }
            if (trait.signal === "minimal-comments" && (code.match(/\/\//g) || []).length > 10) {
                issues.push(`🧬 **expressiveness**: Developer prefers minimal comments — let code speak for itself. This code has many inline comments. Consider reducing to only essential ones.`);
            }
        }

        // Check against explicit mistake memories
        for (const m of mistakes) {
            const mistakeTerms = m.content.toLowerCase().split(/\s+/).filter(t => t.length > 4);
            const matchCount = mistakeTerms.filter(t => codeLower.includes(t)).length;
            if (matchCount > mistakeTerms.length * 0.3 && mistakeTerms.length > 2) {
                issues.push(`🚫 **known mistake**: ${m.topic} — ${m.content}`);
            }
        }

        // Check against preferences
        for (const p of preferences) {
            if (p.confidence === "low") continue;
            const prefTerms = p.topic.toLowerCase().split(/\s+/).filter(t => t.length > 3);
            if (prefTerms.some(t => codeLower.includes(t))) {
                issues.push(`💡 **preference**: ${p.topic} — ${p.content}`);
            }
        }

        if (issues.length === 0) {
            return { content: [{ type: "text", text: "✅ Code looks good — no known developer preferences or correction patterns triggered." }] };
        }

        const text = [
            `# Developer Review — ${issues.length} issue(s) found`,
            context ? `**Context:** ${context}` : "",
            `**Language:** ${language}`,
            "",
            "The following issues match this developer's known preferences, correction patterns, or behavioral DNA:",
            "",
            ...issues,
            "",
            "---",
            "_Fix these before presenting the code to the developer._",
        ].filter(Boolean).join("\n");

        return { content: [{ type: "text", text }] };
    }
);

// ─── Developer Manifesto ──────────────────────────────────────────────────────

server.tool(
    "generate_manifesto",
    [
        "Generate the Developer Manifesto — a narrative document that describes who you are as a developer.",
        "This isn't a config file. It's a soul.",
        "",
        "Combines all four data sources:",
        "  1. Behavioral DNA — coding instincts and values observed from your code",
        "  2. Explicit memories — preferences, solutions, and mistakes you've recorded",
        "  3. Correction patterns — what you consistently change when AI writes code for you",
        "  4. Decision journal — how you make architectural choices",
        "",
        "For the richest manifesto, run learn_from_codebase, record some corrections, and log a few decisions first.",
    ].join("\n"),
    {
        outputFormat: z.enum(["markdown", "json"]).optional().describe("Output format. Default: 'markdown'."),
    },
    async ({ outputFormat = "markdown" }) => {
        const dna = loadDNA();
        const memories = twinMemory.getAll();
        const patterns = correctionMap.getPatterns();
        const decisions = decisionJournal.getAll();
        const name = twinMemory.getDeveloperName();

        if (outputFormat === "json") {
            return { content: [{ type: "text", text: JSON.stringify({ dna, memories, patterns, decisions, name }, null, 2) }] };
        }

        const manifesto = generateManifesto(dna, memories, patterns, decisions, name);
        return { content: [{ type: "text", text: manifesto }] };
    }
);

// ─── get_digital_twin_profile ─────────────────────────────────────────────────

server.tool(
    "get_digital_twin_profile",
    [
        "Generate the master 'Digital Twin' persona prompt for the developer.",
        "Combines three layers:",
        "  1. Explicit memories (preferences, solutions, mistakes) — what you told the twin.",
        "  2. Behavioral DNA (instincts, values, growth) — what the twin observed from your code.",
        "  3. Local git style — commit patterns from the current project.",
        "",
        "Any agent can use this to instantly adopt the developer's exact coding philosophy and style.",
        "For the richest profile, run learn_from_codebase on your projects first."
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

        // Touch all memories being surfaced (tracks usage)
        for (const m of memories) {
            twinMemory.touch(m.id);
        }

        // Load Behavioral DNA
        const dna = loadDNA();
        const hasDNA = dna.scanCount > 0;
        const dnaText = hasDNA
            ? formatBehavioralDNA(dna)
            : "_No Behavioral DNA yet. Run `learn_from_codebase` on your projects to build your coding personality profile._";

        const profileText = [
            `# Digital Twin Profile: ${twinMemory.getDeveloperName() || "Developer"}`,
            "This profile combines explicit memories, observed behavioral patterns, correction history, decisions, and local project style.",
            "",
            "## 1. Behavioral DNA — Who You Are As a Coder",
            dnaText,
            "",
            "## 2. Correction Patterns — What You Always Change",
            (() => {
                const patterns = correctionMap.getPatterns();
                if (patterns.length === 0) return "_No corrections recorded yet. Use `record_correction` when you change agent output._";
                return formatCorrectionPatterns(patterns);
            })(),
            "",
            "## 3. Explicit Memories — What You've Told the Twin",
            "",
            "### Preferences",
            preferences.length ? preferences.map(p => `- **${p.topic}** [${p.confidence}]: ${p.content}${p.tags.length ? ` _(${p.tags.join(", ")})_` : ""}`).join("\n") : "No global preferences memorized yet.",
            "",
            "### Standard Solutions & Patterns",
            solutions.length ? solutions.map(s => `- **${s.topic}** [${s.confidence}]: ${s.content}`).join("\n") : "No solutions memorized yet.",
            "",
            "### Anti-Patterns & Mistakes to Avoid",
            mistakes.length ? mistakes.map(m => `- **${m.topic}** [${m.confidence}]: ${m.content}`).join("\n") : "No mistakes memorized yet.",
            "",
            "## 4. Key Decisions",
            (() => {
                const decisions = decisionJournal.getAll().filter(d => d.status === "active");
                if (decisions.length === 0) return "_No decisions recorded yet. Use `record_decision` to log architectural choices._";
                return decisions.slice(0, 10).map(d => `- **${d.chosen}** (${d.domain}): ${d.reasoning.slice(0, 150)}${d.reasoning.length > 150 ? "..." : ""}`).join("\n");
            })(),
            "",
            "## 5. Local Project Style (from Git)",
            gitText
        ].join("\n");

        return { content: [{ type: "text", text: profileText }] };
    }
);

// ─── Start server ─────────────────────────────────────────────────────────────

// ─── Twin System Prompt (IDE-agnostic proactive behavior) ─────────────────────

server.tool(
    "get_twin_system_prompt",
    [
        "Returns a complete system prompt that makes ANY AI agent behave proactively with the Digital Twin.",
        "This is the IDE-agnostic alternative to Kiro hooks. Call this once at the start of a session",
        "and inject the result into your agent's context. Works with Cursor, Claude Code, Cline, Windsurf, etc.",
        "",
        "The prompt includes:",
        "  - Behavioral rules derived from correction patterns (what to avoid)",
        "  - Developer preferences and known mistakes (what to follow)",
        "  - Instructions to self-review code before presenting it",
        "  - Instructions to detect and record corrections when the developer edits output",
        "  - Instructions to check the decision journal before making architectural choices",
        "  - Instructions to reflect at session end",
        "",
        "The more the twin has learned (via learn_from_codebase, record_correction, memorize, record_decision),",
        "the richer and more specific this prompt becomes.",
    ].join("\n"),
    {
        projectPath: z.string().optional().describe("Optional project path to include project-scoped memories and git style."),
    },
    async ({ projectPath }) => {
        const dna = loadDNA();
        const memories = twinMemory.getAll();
        const patterns = correctionMap.getPatterns();
        const decisions = decisionJournal.getAll().filter(d => d.status === "active");
        const preferences = memories.filter(m => m.type === "preference" && m.confidence !== "low");
        const mistakes = memories.filter(m => m.type === "mistake");
        const name = twinMemory.getDeveloperName() || "the developer";

        const sections: string[] = [
            `# Digital Twin System Prompt for ${name}`,
            "",
            "You are pair-programming with a developer whose preferences, patterns, and decisions are documented below.",
            "Follow these rules throughout the entire session. They are derived from real observations, not generic advice.",
            "",
        ];

        // ── Correction-based rules ──
        const highConfPatterns = patterns.filter(p => p.confidence >= 0.4);
        if (highConfPatterns.length > 0) {
            sections.push("## CORRECTION RULES — Things this developer ALWAYS changes");
            sections.push("These are patterns learned from past corrections. Violating them will waste the developer's time.");
            sections.push("");
            for (const p of highConfPatterns) {
                sections.push(`- **[${p.category}]** ${p.rule}`);
                if (p.examples.length > 0) {
                    const ex = p.examples[0];
                    sections.push(`  ❌ Don't: \`${ex.suggested}\``);
                    sections.push(`  ✅ Do: \`${ex.corrected}\``);
                }
            }
            sections.push("");
        }

        // ── DNA-based style rules ──
        const strongTraits = [
            ...dna.instincts.controlFlow, ...dna.instincts.naming,
            ...dna.instincts.structure, ...dna.instincts.expressiveness,
            ...dna.values.quality, ...dna.values.complexity,
        ].filter(t => t.confidence > 0.6);

        if (strongTraits.length > 0) {
            sections.push("## CODING STYLE — Observed from this developer's code");
            sections.push("Match these patterns when writing code:");
            sections.push("");
            for (const t of strongTraits) {
                sections.push(`- **${t.signal}**: ${t.observation}`);
            }
            sections.push("");
        }

        // ── Explicit preferences ──
        if (preferences.length > 0) {
            sections.push("## PREFERENCES — Explicitly stated by the developer");
            sections.push("");
            for (const p of preferences) {
                sections.push(`- **${p.topic}**: ${p.content}`);
            }
            sections.push("");
        }

        // ── Known mistakes ──
        if (mistakes.length > 0) {
            sections.push("## NEVER DO THESE — Known mistakes to avoid");
            sections.push("");
            for (const m of mistakes) {
                sections.push(`- **${m.topic}**: ${m.content}`);
            }
            sections.push("");
        }

        // ── Active decisions ──
        if (decisions.length > 0) {
            sections.push("## SETTLED DECISIONS — Don't re-litigate these");
            sections.push("The developer has already made these choices. Follow them unless explicitly asked to reconsider.");
            sections.push("");
            for (const d of decisions.slice(0, 15)) {
                sections.push(`- **${d.chosen}** (${d.domain}): ${d.reasoning}`);
            }
            sections.push("");
        }

        // ── Proactive behavior instructions ──
        sections.push("## PROACTIVE BEHAVIOR — Do these automatically");
        sections.push("");
        sections.push("### Before writing code:");
        sections.push("- Review the CORRECTION RULES above. If your code would match a corrected pattern, fix it before writing.");
        sections.push("- If the task involves an architectural choice, check SETTLED DECISIONS first.");
        sections.push("- Match the CODING STYLE patterns — don't use for-loops if the developer prefers .map(), etc.");
        sections.push("");
        sections.push("### After writing code:");
        sections.push("- Call `review_as_developer` with your code to catch issues the developer would flag.");
        sections.push("- If issues are found, fix them silently before presenting the code.");
        sections.push("");
        sections.push("### When the developer edits your output:");
        sections.push("- This is a correction. Call `record_correction` with what you wrote vs what they changed it to.");
        sections.push("- Categorize it (naming, style, logic, pattern, simplification, hardening, etc.).");
        sections.push("- Write a clear lesson so you don't repeat the mistake.");
        sections.push("");
        sections.push("### At the end of the session:");
        sections.push("- Reflect: did you learn any new preferences? Call `memorize`.");
        sections.push("- Were any architectural decisions made? Call `record_decision`.");
        sections.push("- Did you make mistakes the developer caught? Call `memorize` with type 'mistake'.");
        sections.push("");
        sections.push("---");
        sections.push("_This prompt was auto-generated by the GYO-AGENTS Digital Twin. It evolves as the twin learns._");

        return { content: [{ type: "text", text: sections.join("\n") }] };
    }
);

// ─── Twin System Prompt Resource (auto-loadable) ──────────────────────────────

server.resource("Digital Twin System Prompt", "gyo-agents://twin-system-prompt", {
    description: "Auto-injectable system prompt containing the developer's Digital Twin behavioral rules, correction patterns, preferences, and proactive instructions. Load this resource at session start to make any agent Twin-aware.",
    mimeType: "text/markdown",
}, async () => {
    const dna = loadDNA();
    const patterns = correctionMap.getPatterns();
    const memories = twinMemory.getAll();
    const decisions = decisionJournal.getAll().filter(d => d.status === "active");
    const preferences = memories.filter(m => m.type === "preference" && m.confidence !== "low");
    const mistakes = memories.filter(m => m.type === "mistake");
    const name = twinMemory.getDeveloperName() || "Developer";

    const lines: string[] = [
        `# Twin Rules for ${name}`,
        "",
    ];

    // Compact format for resource (less verbose than the tool)
    const highConf = patterns.filter(p => p.confidence >= 0.4);
    if (highConf.length > 0) {
        lines.push("## Corrections (always follow)");
        for (const p of highConf) {
            lines.push(`- [${p.category}] ${p.rule}`);
        }
        lines.push("");
    }

    if (preferences.length > 0) {
        lines.push("## Preferences");
        for (const p of preferences.slice(0, 10)) {
            lines.push(`- ${p.topic}: ${p.content}`);
        }
        lines.push("");
    }

    if (mistakes.length > 0) {
        lines.push("## Never");
        for (const m of mistakes.slice(0, 10)) {
            lines.push(`- ${m.topic}: ${m.content}`);
        }
        lines.push("");
    }

    if (decisions.length > 0) {
        lines.push("## Settled Decisions");
        for (const d of decisions.slice(0, 10)) {
            lines.push(`- ${d.chosen} (${d.domain}): ${d.reasoning.slice(0, 120)}`);
        }
        lines.push("");
    }

    const strongTraits = [
        ...dna.instincts.controlFlow, ...dna.instincts.naming,
        ...dna.instincts.structure, ...dna.instincts.expressiveness,
    ].filter(t => t.confidence > 0.6);

    if (strongTraits.length > 0) {
        lines.push("## Coding Style");
        for (const t of strongTraits) {
            lines.push(`- ${t.signal}: ${t.observation}`);
        }
        lines.push("");
    }

    lines.push("## Proactive Rules");
    lines.push("- Before writing code: check corrections and decisions above");
    lines.push("- After writing code: call review_as_developer to self-check");
    lines.push("- When developer edits your output: call record_correction");
    lines.push("- End of session: call memorize for new preferences, record_decision for choices made");

    return {
        contents: [{
            uri: "gyo-agents://twin-system-prompt",
            mimeType: "text/markdown",
            text: lines.join("\n"),
        }],
    };
});

// ─── snapshot_config ──────────────────────────────────────────────────────────

server.tool(
    "snapshot_config",
    [
        "Capture a baseline snapshot of the current project state and persist it to ~/.gyo-agents/snapshots/.",
        "",
        "Call this immediately after generating agent config files (CLAUDE.md, .clinerules, .cursor/rules/, etc.).",
        "The snapshot records five dimensions of the project at that exact moment:",
        "  1. Top-level directory structure",
        "  2. Dependency manifest hashes (package.json, composer.json, go.mod, etc.)",
        "  3. Git HEAD, commit count, commit style, and top domain keywords",
        "  4. Which agent config files exist (CLAUDE.md, .clinerules, .windsurfrules, etc.)",
        "",
        "Future calls to `sync_agent_config` will diff the live project against this baseline and",
        "return targeted patch instructions — only the sections that actually changed.",
        "",
        "One snapshot per project, keyed by a hash of the absolute path. Re-running overwrites the previous baseline.",
    ].join("\n"),
    {
        projectPath: z
            .string()
            .min(1)
            .describe(
                "Absolute path to the root of the project. Example: '/Users/you/Development/my-project'"
            ),
        label: z
            .string()
            .optional()
            .describe(
                "Optional human-readable label for this snapshot, e.g. 'after initial generation' or 'v2 rewrite'. Stored for reference."
            ),
    },
    async ({ projectPath, label }) => {
        try {
            const snapshot = takeSnapshot(projectPath, label);
            const text = formatSnapshotConfirmation(snapshot);
            return { content: [{ type: "text" as const, text }] };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
                content: [{
                    type: "text" as const,
                    text: `Failed to take snapshot: ${msg}\n\nMake sure the projectPath exists and is accessible.`,
                }],
            };
        }
    }
);

// ─── sync_agent_config ────────────────────────────────────────────────────────

server.tool(
    "sync_agent_config",
    [
        "Compare the current project state against the stored baseline snapshot and return a targeted patch report.",
        "",
        "This is the core of the Living Config Auto-Updater. It detects meaningful drift across five dimensions:",
        "  1. New or removed top-level directories → flags stale 'Project Structure' sections",
        "  2. Changed dependency manifests → flags stale 'Architecture' / 'Essential Commands' sections",
        "  3. Commit growth (30+ new commits) → flags stale 'Developer Style' section",
        "  4. Commit style evolution (conventional ↔ freeform, new ticket prefixes) → flags 'Commit Format'",
        "  5. Domain focus shift (new top commit keywords) → flags 'Domain Focus' table",
        "",
        "For each change it produces a 'Suggested Patch': which config files to edit, which section to update,",
        "and exactly what to do — without requiring a full regeneration unless the changes are too widespread.",
        "",
        "Returns '✅ up to date' if nothing meaningful has changed.",
        "Returns an error message if no snapshot exists yet (call `snapshot_config` first).",
        "",
        "Workflow:",
        "  1. Generate agent configs using any get_prompt_* tool",
        "  2. Call snapshot_config to establish baseline",
        "  3. Work on your project (days/weeks later...)",
        "  4. Call sync_agent_config — get a precise list of what to patch",
        "  5. Apply patches, then call snapshot_config again to update the baseline",
    ].join("\n"),
    {
        projectPath: z
            .string()
            .min(1)
            .describe(
                "Absolute path to the root of the project. Must match the path used when snapshot_config was called. Example: '/Users/you/Development/my-project'"
            ),
    },
    async ({ projectPath }) => {
        try {
            const report = syncAgentConfig(projectPath);
            const text = formatSyncReport(report);
            return { content: [{ type: "text" as const, text }] };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
                content: [{
                    type: "text" as const,
                    text: `Failed to sync config: ${msg}`,
                }],
            };
        }
    }
);

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
        `  ✦ generate_full_agent_context — one-shot orchestration\n` +
        `  ✦ learn_from_codebase — Behavioral DNA builder\n` +
        `  ✦ record_decision / search_decisions — Decision Journal\n` +
        `  ✦ record_correction / get_correction_patterns — Pair Programming Memory\n` +
        `  ✦ review_as_developer — proactive code review through developer's lens\n` +
        `  ✦ generate_manifesto — Developer soul narrative\n` +
        `  ✦ get_twin_system_prompt — IDE-agnostic proactive behavior injection\n` +
        `  ✦ update_memory / prune_stale_memories — enhanced memory management\n` +
        `  ✦ snapshot_config — capture project baseline after generating agent configs\n` +
        `  ✦ sync_agent_config — detect config drift and get targeted patch suggestions\n` +
        `  ✦ Resources: gyo-agents://tools, gyo-agents://twin-system-prompt`
    );
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
