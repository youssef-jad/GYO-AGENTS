import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { readFileSync, existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Root of GYO-AGENTS repo (one level up from mcp-server/)
const REPO_ROOT = resolve(__dirname, "../../");

export interface ToolDefinition {
    id: string;
    name: string;
    displayName: string;
    folder: string;
    outputFormat: string;
    outputFiles: string[];
    description: string;
}

export const TOOLS: ToolDefinition[] = [
    {
        id: "cursor",
        name: "get_prompt_cursor",
        displayName: "Cursor",
        folder: "Cursor",
        outputFormat: ".cursor/rules/*.mdc + AGENTS.md",
        outputFiles: [
            ".cursor/rules/architecture.mdc",
            ".cursor/rules/guardrails.mdc",
            ".cursor/rules/developer-style.mdc",
            ".cursor/rules/testing.mdc",
            "AGENTS.md",
        ],
        description:
            "Generate Cursor-native rule files (.cursor/rules/*.mdc) and a lightweight AGENTS.md for this project.",
    },
    {
        id: "claudecode",
        name: "get_prompt_claudecode",
        displayName: "Claude Code",
        folder: "ClaudeCode",
        outputFormat: "CLAUDE.md hierarchy + .claude/settings.json + .claude/commands/",
        outputFiles: [
            "CLAUDE.md",
            "tests/CLAUDE.md",
            ".claude/settings.json",
            ".claude/commands/new-module.md",
        ],
        description:
            "Generate a hierarchical CLAUDE.md system, .claude/settings.json permissions, and custom slash commands for Claude Code.",
    },
    {
        id: "cline",
        name: "get_prompt_cline",
        displayName: "Cline",
        folder: "Cline",
        outputFormat: ".clinerules + AGENTS.md",
        outputFiles: [".clinerules", "AGENTS.md"],
        description:
            "Generate a .clinerules file optimized for Cline's memory bank and mode system.",
    },
    {
        id: "kiro",
        name: "get_prompt_kiro",
        displayName: "Kiro",
        folder: "Kiro",
        outputFormat: ".kiro/steering/*.md + .kiro/hooks/*.json + AGENTS.md",
        outputFiles: [
            ".kiro/steering/architecture.md",
            ".kiro/steering/guardrails.md",
            ".kiro/hooks/lint-on-save.json",
            "AGENTS.md",
        ],
        description:
            "Generate Kiro steering files, automated hooks, and an AGENTS.md entrypoint.",
    },
    {
        id: "geminicli",
        name: "get_prompt_geminicli",
        displayName: "Gemini CLI",
        folder: "GeminiCLI",
        outputFormat: "GEMINI.md + AGENTS.md",
        outputFiles: ["GEMINI.md", "AGENTS.md"],
        description:
            "Generate a comprehensive GEMINI.md (auto-loaded by Gemini CLI) and a lightweight AGENTS.md.",
    },
    {
        id: "aider",
        name: "get_prompt_aider",
        displayName: "Aider",
        folder: "Aider",
        outputFormat: ".aider.conf.yml + CONVENTIONS.md + AGENTS.md",
        outputFiles: [".aider.conf.yml", "CONVENTIONS.md", "AGENTS.md"],
        description:
            "Generate Aider configuration and a CONVENTIONS.md file for consistent Aider sessions.",
    },
    {
        id: "roocode",
        name: "get_prompt_roocode",
        displayName: "RooCode",
        folder: "RooCode",
        outputFormat: ".roo/rules/*.md + AGENTS.md",
        outputFiles: [".roo/rules/architecture.md", ".roo/rules/guardrails.md", "AGENTS.md"],
        description:
            "Generate RooCode-native rule files and an AGENTS.md entrypoint.",
    },
    {
        id: "windsurf",
        name: "get_prompt_windsurf",
        displayName: "Windsurf",
        folder: "Windsurf",
        outputFormat: ".windsurfrules + AGENTS.md",
        outputFiles: [".windsurfrules", "AGENTS.md"],
        description:
            "Generate a .windsurfrules file tailored for Windsurf's Cascade agent.",
    },
    {
        id: "codexcli",
        name: "get_prompt_codexcli",
        displayName: "Codex CLI",
        folder: "CodexCLI",
        outputFormat: "AGENTS.md",
        outputFiles: ["AGENTS.md"],
        description:
            "Generate a comprehensive AGENTS.md for OpenAI Codex CLI (codex command).",
    },
    {
        id: "continue",
        name: "get_prompt_continue",
        displayName: "Continue",
        folder: "Continue",
        outputFormat: ".continue/config.yaml + AGENTS.md",
        outputFiles: [".continue/config.yaml", "AGENTS.md"],
        description:
            "Generate Continue IDE extension configuration and an AGENTS.md.",
    },
    {
        id: "githubcopilot",
        name: "get_prompt_githubcopilot",
        displayName: "GitHub Copilot",
        folder: "GitHubCopilot",
        outputFormat: ".github/copilot-instructions.md + AGENTS.md",
        outputFiles: [".github/copilot-instructions.md", "AGENTS.md"],
        description:
            "Generate a .github/copilot-instructions.md and an AGENTS.md for GitHub Copilot.",
    },
];

export function getPromptContent(tool: ToolDefinition): string {
    const promptPath = join(REPO_ROOT, tool.folder, "GENERATE_AGENT.md");
    if (!existsSync(promptPath)) {
        throw new Error(
            `GENERATE_AGENT.md not found for tool "${tool.displayName}" at ${promptPath}`
        );
    }
    return readFileSync(promptPath, "utf-8");
}

export function getToolById(id: string): ToolDefinition | undefined {
    return TOOLS.find((t) => t.id === id);
}

export function getToolByName(name: string): ToolDefinition | undefined {
    return TOOLS.find((t) => t.name === name);
}
