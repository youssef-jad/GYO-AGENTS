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
| `get_digital_twin_profile` | Combines global and current-project memories with local Git style |
| `memorize` | Save a global or project-scoped preference, solution, or mistake |
| `forget_memory` | Delete a saved memory by ID |
| `search_memory` | Query global memories and optionally memories in a selected project |

Clients on the same machine share the JSON stores under `~/.gyo-agents`. To use a separate profile, set `GYO_AGENTS_DATA_DIR` to an absolute directory in the MCP server environment. Set the same value in both clients to share that profile. Restart all clients when upgrading so every server process uses the same write protocol.

Use the same absolute project path when saving and reading a scoped entry. Existing named scopes still work when passed as the exact name. Omitting the scope returns global entries. The `gyo-agents://twin-system-prompt` resource contains global entries. Call `get_twin_system_prompt` with `projectPath` to include a project's entries.

If a server is forcibly stopped while writing, it can leave a `*.json.lock` directory. Close all GYO clients before removing that lock directory and restarting. The JSON file holds the last completed write.

### GYO Guardrails

Teach a rule in one agent, approve it locally, and check it in another agent or CI. Guardrails flag a case-sensitive literal on **added lines** in matching files. Each finding includes the rule ID, file and destination line number.

1. Have your agent call `record_correction` with the absolute repository root as `projectScope`. Write the preferred approach in the lesson, for example, “Use the project cache wrapper in service files.”
2. Have it call `propose_guardrail` with that correction ID, the same root as `projectPath`, a path pattern such as `app/Services/**/*.php`, and the literal to flag, such as `use Illuminate\Support\Facades\Cache;`.
3. From the repository root, review the draft with `gyo-agents-mcp guardrail list`, then run `gyo-agents-mcp guardrail approve <id>` to activate it. Use `gyo-agents-mcp guardrail remove <id>` to retire it.

Before editing, an MCP client can call `get_task_rules` with the project root and planned repository-relative file paths. After editing, it can pass a Git patch to `check_changes`. Clients and the CLI share approvals through the same `GYO_AGENTS_DATA_DIR` or default local profile. Approvals apply to the absolute checkout path.

For a CLI check, run from the repository root. If you built GYO from a checkout, use `node /absolute/path/to/GYO-AGENTS/mcp-server/dist/index.js` in place of `gyo-agents-mcp`.

```bash
set -o pipefail
git -c core.quotePath=false diff --no-color --no-ext-diff --no-textconv --src-prefix=a/ --dst-prefix=b/ HEAD |
  gyo-agents-mcp guardrail check
```

Use a patch that includes every change you want checked. The command above covers staged and unstaged changes to tracked files. Include new files in the patch through your normal staging workflow. The checker takes standard Git text patches with `a/` and `b/` prefixes up to 2 MiB. It skips binary files and matches literal text on a single line. The CLI exits with `0` for a clean check, `1` for violations, and `2` for invalid input or configuration.

For CI or another checkout, run `gyo-agents-mcp guardrail export` and review the resulting JSON before sharing it. The export includes approved definitions and their lesson text. Pipe the PR diff into `gyo-agents-mcp guardrail check --rules <file>` using a rules file from a trusted revision.

#### Automatic checks in Claude Code and Codex

Merge the [Stop hook example](../examples/guardrails-hooks/stop-hook.json) into your project's `.claude/settings.local.json` for Claude Code, or `.codex/hooks.json` for Codex. Keep existing hooks and settings. If the binary is not on the client's PATH, replace the command with `node "/absolute/path/to/GYO-AGENTS/mcp-server/dist/index.js" guardrail hook`. Start the client with the same `GYO_AGENTS_DATA_DIR` used for approval if you use a custom profile.

Review and trust the project and hook in the client. In Codex, use `/hooks` to review and trust the exact definition. The hook runs when the agent tries to finish a turn. It checks staged and unstaged tracked changes against `HEAD` and sends findings back to the agent once. It checks again before the turn ends and reports any remaining findings. Include new files through your normal staging workflow so the hook can see them.

### Convention Enforcement (Laravel / PHP)
| Tool | Enforces |
|------|----------|
| `validate_api_response` | `Json::item()` over `response()->json()` — *api-development.md* |
| `check_cache_usage` | `cache_store('read/write')` over `Cache::` — *guardrails.md* |

### Config Freshness (Living Auto-Updater)
| Tool | Description |
|------|-------------|
| `snapshot_config` | Capture a five-dimension project baseline after generating config files |
| `sync_agent_config` | Diff live project vs baseline — returns targeted patches or regeneration recommendation |

### Resources
| URI | Description |
|-----|-------------|
| `gyo-agents://tools` | JSON manifest of the 11 prompt tools with metadata |

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
4. snapshot_config(projectPath)           ← lock in the baseline
        ↓
5. [Optional] validate_api_response(projectPath) + check_cache_usage(projectPath)
        ↓
   Work on your project for days/weeks...
        ↓
6. sync_agent_config(projectPath)         ← get targeted patch report
        ↓
   Apply patches → snapshot_config()     ← advance the baseline
```

---

## Keeping Configs Fresh

Agent config files go stale. The moment you merge a new module, adopt a new pattern, or change your commit style, your `CLAUDE.md` / `.clinerules` / `.cursor/rules/` drift silently from reality.

**`snapshot_config`** captures a five-dimension baseline of your project:

| Dimension | What's tracked |
|---|---|
| Directory structure | Top-level dirs (ignoring `node_modules`, `dist`, `vendor`, etc.) |
| Dependency manifests | SHA-256 of `package.json`, `composer.json`, `go.mod`, etc. |
| Git state | HEAD hash, commit count, commit style, ticket prefixes, top verbs |
| Domain focus | Top 8 commit keyword areas |
| Agent config inventory | Which of 13 known config files exist |

**`sync_agent_config`** diffs the live project against the baseline and returns:

| Change | Severity | Suggested fix |
|---|---|---|
| New top-level directories | 🔴 High | Update Project Structure section |
| Removed directories | 🟡 Medium | Update Project Structure section |
| Dependency manifest changed | 🟡 Medium | Update Architecture / Essential Commands |
| Commit style evolved | 🔴 High | Update Commit Format + Developer Style |
| New ticket prefix pattern | 🔴 High | Update Commit Format section |
| 30+ new commits | 🟡 Medium | Refresh Developer Style section |
| Domain focus shift (2+ new keywords) | 🟡 Medium | Update Domain Focus table |
| Agent config files added/removed | 🔵 Low | Update AGENTS.md rules reference |

When 2+ high-severity changes are detected, `sync_agent_config` recommends a full regeneration instead of patching.

---

## Development

```bash
npm run dev        # Run with tsx (no build needed)
npm run build      # Compile to dist/ and bundle the 11 prompts
npm run test:package # Install a freshly packed tarball and run MCP checks
npm run inspect    # Open MCP Inspector UI
```
