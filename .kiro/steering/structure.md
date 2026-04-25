# Project Structure

```
GYO-AGENTS/
├── README.md                  # Main README with usage instructions and the universal GENERATE_AGENT prompt
├── Aider/GENERATE_AGENT.md    # Prompt template for Aider
├── ClaudeCode/GENERATE_AGENT.md
├── Cline/GENERATE_AGENT.md
├── CodexCLI/GENERATE_AGENT.md
├── Continue/GENERATE_AGENT.md
├── Cursor/GENERATE_AGENT.md
├── GeminiCLI/GENERATE_AGENT.md
├── GitHubCopilot/GENERATE_AGENT.md
├── Kiro/GENERATE_AGENT.md
├── RooCode/GENERATE_AGENT.md
├── Windsurf/GENERATE_AGENT.md
├── examples/mcp-configs/      # Sample MCP config snippets for each tool
└── mcp-server/                # The MCP server (TypeScript, Node.js)
    ├── src/
    │   ├── index.ts           # Server entrypoint — registers all tools, resources, starts stdio transport
    │   ├── tools.ts           # Tool registry — defines all 11 GENERATE_AGENT tool definitions, reads prompt files
    │   ├── search.ts          # RAG keyword search across all prompt templates
    │   ├── resources.ts       # MCP resource: JSON manifest of all tools
    │   ├── git-analyzer.ts    # Live git history analysis (commit style, verbs, domains, evolution)
    │   ├── code-validators.ts # Convention enforcers (API response validation, cache usage checks, domain context)
    │   ├── combined-context.ts# One-shot orchestration combining git + domain + twin + tool recommendations
    │   └── twin-memory.ts     # Digital Twin persistent memory (reads/writes ~/.gyo-agents/twin-memory.json)
    ├── dist/                  # Compiled output (gitignored)
    ├── package.json
    └── tsconfig.json
```

## Key Patterns

- Each AI tool gets its own top-level folder containing a single `GENERATE_AGENT.md` prompt template
- The MCP server reads these templates at runtime via `tools.ts` — the `TOOLS` array maps tool IDs to folder names
- Adding a new AI tool means: create a new folder with `GENERATE_AGENT.md`, add an entry to the `TOOLS` array in `tools.ts`
- The server uses `child_process.execSync` for git commands and filesystem scanning (no async git library)
- Twin memory is a singleton class persisting to the user's home directory, not the project
- All MCP tool handlers are registered in `index.ts` using `server.tool()` from the MCP SDK
