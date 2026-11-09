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

Use a patch that includes every change you want checked. For a local check that also includes non-ignored untracked files, run `gyo-agents-mcp guardrail check --working-tree`. The checker takes standard Git text patches with `a/` and `b/` prefixes up to 2 MiB. It skips binary files and matches literal text on a single line. The CLI exits with `0` for a clean check, `1` for violations, and `2` for invalid input or configuration.

#### Team Guardrails

Run `gyo-agents-mcp guardrail export` from the checkout where you approved the rules. To create the team policy, put the reviewed JSON in `.gyo/guardrails.json` and submit it in a PR. For an existing policy, merge the selected entries into its `rules` array. The export includes approved local definitions and their lesson text, so review both before sharing.

The MCP tools, CLI, and Stop hook load the policy from the checkout's committed `HEAD`. They combine it with approved local rules. If a rule ID appears in both places, the team definition wins. Pending local proposals and edits to the policy file in the working tree take effect after approval or commit, respectively. Use `guardrail list` to see team rules alongside local rules and drafts.

In CI, check the PR against rules from its trusted base commit. Set `BASE_SHA` to the base commit and fetch it before running the check.

```bash
set -o pipefail
gyo_rules_file=$(mktemp)
trap 'rm -f "$gyo_rules_file"' EXIT
git show "${BASE_SHA}:.gyo/guardrails.json" > "$gyo_rules_file"
git -c core.quotePath=false diff --no-color --no-ext-diff --no-textconv \
  --src-prefix=a/ --dst-prefix=b/ "$BASE_SHA" HEAD |
  gyo-agents-mcp guardrail check --rules "$gyo_rules_file"
```

`--rules` uses the supplied policy for that check. This example assumes the base commit already includes the team policy.

#### Automatic checks in Claude Code and Codex

Merge the [Stop hook example](../examples/guardrails-hooks/stop-hook.json) into your project's `.claude/settings.local.json` for Claude Code, or `.codex/hooks.json` for Codex. Keep existing hooks and settings. If the binary is not on the client's PATH, replace the command with `node "/absolute/path/to/GYO-AGENTS/mcp-server/dist/index.js" guardrail hook`. Start the client with the same `GYO_AGENTS_DATA_DIR` used for approval if you use a custom profile.

Review and trust the project and hook in the client. In Codex, use `/hooks` to review and trust the exact definition. The hook runs when the agent tries to finish a turn. It checks staged and unstaged changes against `HEAD` and includes matching, non-ignored untracked files. It sends findings back to the agent once, then rechecks and reports any remaining findings. The check reads the working tree without staging files. It skips untracked symlinks and applies the 2 MiB limit to the patch and matching untracked text together.

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
npm run build      # Compile to dist/ and bundle the 11 prompts
npm run test:package # Install a freshly packed tarball and run MCP checks
npm run inspect    # Open MCP Inspector UI
```
