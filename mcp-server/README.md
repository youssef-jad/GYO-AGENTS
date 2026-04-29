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

### Living Config Auto-Updater
| Tool | Description |
|------|-------------|
| `snapshot_config` | Capture a baseline snapshot of the project right after generating agent configs |
| `sync_agent_config` | Diff the live project against the snapshot — get targeted patch suggestions for only what changed |

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
4. snapshot_config(projectPath)          ← lock in the baseline
        ↓
5. [Optional] validate_api_response(projectPath) + check_cache_usage(projectPath)
```

---

## Keeping Configs Fresh

Agent config files go stale as the codebase evolves — new modules, dependency upgrades, shifting commit style. The **Living Config Auto-Updater** solves this without a full regeneration.

### Initial setup (run once after generating configs)

```
snapshot_config("/path/to/your/project", label: "initial generation")
```

This records a baseline across five dimensions: directory structure, dependency manifests, git HEAD and commit style, domain keyword distribution, and which agent config files exist.

### Staying in sync (run whenever configs might be stale)

```
sync_agent_config("/path/to/your/project")
```

Returns one of:
- **✅ Up to date** — nothing meaningful has changed, no action needed
- **Targeted patches** — a list of exactly which sections to update in which files, with precise instructions
- **Regeneration recommended** — too many high-impact changes; re-running the full prompt will be faster

### What it detects

| Signal | Severity | Action |
|--------|----------|--------|
| New top-level directories | 🔴 High | Update Project Structure / Architecture section |
| Removed directories | 🟡 Medium | Update Project Structure section |
| Dependency manifest changed | 🟡 Medium | Update Architecture / Essential Commands |
| Commit style evolved (conventional ↔ freeform) | 🔴 High | Update Commit Format + Developer Style |
| 30+ new commits since snapshot | 🟡 Medium | Refresh Developer Style section |
| Domain focus shift (new top keywords) | 🟡 Medium | Update Domain Focus table |
| Agent config files added/removed | 🔵 Low | Update AGENTS.md rules reference |

### After patching

Re-run `snapshot_config` to advance the baseline to the new state.

---

## Development

```bash
npm run dev        # Run with tsx (no build needed)
npm run build      # Compile to dist/
npm run inspect    # Open MCP Inspector UI
```
