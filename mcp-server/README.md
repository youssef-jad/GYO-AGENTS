# GYO-AGENTS MCP Server

An **MCP (Model Context Protocol) server** that exposes the entire [GYO-AGENTS](../) prompt library as callable tools — no copy-pasting required.

Any MCP-compatible AI tool (Cursor, Claude Code, Cline, Kiro, Windsurf, Continue, etc.) can connect once and get instant access to all prompts, live git analysis, domain scanning, and convention enforcement.

---

## Tools Exposed

### Prompt Tools (11)
| Tool | Description |
|------|-------------|
| `get_prompt_cursor` | Cursor `.cursor/rules/*.mdc` + `AGENTS.md` |
| `get_prompt_claudecode` | Claude Code `CLAUDE.md` hierarchy + `.claude/` |
| `get_prompt_cline` | Cline `.clinerules` |
| `get_prompt_kiro` | Kiro `.kiro/steering/` + hooks |
| `get_prompt_geminicli` | Gemini CLI `GEMINI.md` |
| `get_prompt_aider` | Aider `.aider.conf.yml` + `CONVENTIONS.md` |
| `get_prompt_roocode` | RooCode `.roo/rules/` |
| `get_prompt_windsurf` | Windsurf `.windsurfrules` |
| `get_prompt_codexcli` | Codex CLI `AGENTS.md` |
| `get_prompt_continue` | Continue `.continue/config.yaml` |
| `get_prompt_githubcopilot` | GitHub Copilot `.github/copilot-instructions.md` |

### Intelligence Tools
| Tool | Description |
|------|-------------|
| `generate_full_agent_context` | **Start here** — one-shot: git analysis + domain scan + twin memory + tool recommendations |
| `analyze_git_style_on_the_fly` | Live git commit history analysis → commit format, verbs, domains, style evolution |
| `get_domain_context` | Find all modules/files related to a business domain (e.g. "POS", "payment") |
| `search_prompts` | RAG search across all 11 prompts by keyword |

### Digital Twin Memory (Global Persona)
| Tool | Description |
|------|-------------|
| `get_digital_twin_profile` | Generates a master persona prompt combining global memories and local git style |
| `memorize` | Save a personal preference, solution snippet, or mistake to global memory |
| `forget_memory` | Delete a saved memory by ID |
| `search_memory` | Query saved global memories |

### Convention Enforcement (Laravel / PHP)
| Tool | Enforces |
|------|----------|
| `validate_api_response` | `Json::item()` over `response()->json()` — *api-development.md* |
| `check_cache_usage` | `cache_store('read/write')` over `Cache::` — *guardrails.md* |

### Resources
| URI | Description |
|-----|-------------|
| `gyo-agents://tools` | JSON manifest of all tools with metadata |

---

## Quick Start

### 1. Build
```bash
cd mcp-server
npm install
npm run build
```

### 2. Test with MCP Inspector
```bash
npm run inspect
# Opens http://localhost:5173 — try calling get_prompt_cursor or generate_full_agent_context
```

### 3. Connect Your Tool

#### Cursor (`~/.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "gyo-agents": {
      "command": "node",
      "args": ["/absolute/path/to/GYO-AGENTS/mcp-server/dist/index.js"]
    }
  }
}
```

#### Claude Code
```bash
claude mcp add gyo-agents -- node /absolute/path/to/GYO-AGENTS/mcp-server/dist/index.js
```

#### Cline / RooCode (VS Code settings)
```json
{
  "cline.mcpServers": {
    "gyo-agents": {
      "command": "node",
      "args": ["/absolute/path/to/GYO-AGENTS/mcp-server/dist/index.js"]
    }
  }
}
```

#### Kiro
```json
{
  "mcpServers": {
    "gyo-agents": {
      "command": "node",
      "args": ["/absolute/path/to/GYO-AGENTS/mcp-server/dist/index.js"]
    }
  }
}
```

#### Windsurf (`~/.codeium/windsurf/mcp_config.json`)
```json
{
  "mcpServers": {
    "gyo-agents": {
      "command": "node",
      "args": ["/absolute/path/to/GYO-AGENTS/mcp-server/dist/index.js"]
    }
  }
}
```

---

## Recommended Workflow

```
1. generate_full_agent_context(projectPath, domains?, targetTools?)
        ↓ (git style + domain map + tool list)
2. get_prompt_<your_tool>()
        ↓ (full prompt text)
3. Paste prompt into your AI tool → it generates native config files
        ↓
4. [Optional] validate_api_response(projectPath) + check_cache_usage(projectPath)
```

---

## Development

```bash
npm run dev        # Run with tsx (no build needed)
npm run build      # Compile to dist/
npm run inspect    # Open MCP Inspector UI
```
