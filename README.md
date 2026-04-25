## 🚀 MCP Server: The Developer Digital Twin

Instead of copy-pasting prompts, connect the **GYO-AGENTS MCP Server** to any AI tool (Cursor, Claude Code, Cline, Kiro, Windsurf) to instantly transform it into your **Digital Twin**. 

The server provides a global, persistent memory (`~/.gyo-agents/twin-memory.json`) that lives outside of any single repository. AI agents can learn your preferences, save your recurring solutions, and avoid mistakes across all of your projects.

```bash
cd mcp-server && npm install && npm run build
```

Add to your tool's MCP config (replace `/ABSOLUTE/PATH/TO/GYO-AGENTS`):

```json
{
  "mcpServers": {
    "gyo-agents": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/GYO-AGENTS/mcp-server/dist/index.js"]
    }
  }
}
```

**22 Tools Exposed:** 
* **Prompt Tools (11):** Native prompt generators for every major AI coding agent.
* **Digital Twin Memory (4):** `get_digital_twin_profile`, `memorize`, `forget_memory`, `search_memory` — Teach AI your global preferences.
* **Intelligence & Validation (7):** `generate_full_agent_context`, `search_prompts`, `analyze_git_style_on_the_fly`, `get_domain_context`, `validate_api_response`, `check_cache_usage`.

📖 Full setup guide & tool details → [`mcp-server/README.md`](mcp-server/README.md) · Config snippets → [`examples/mcp-configs/`](examples/mcp-configs/)

---

## Prompt: Generate Your Own AGENTS.md

Copy this entire prompt into any AI coding agent (Kiro, Claude Code, Cursor, Copilot, Codex, etc.) while inside your project workspace. It will analyze your codebase and git history to generate a powerful, project-specific AGENTS.md file.

(Note: If the agent truncates its response, run Steps 1-2 first, then ask it to complete Steps 3-4 in a follow-up).

```
I need you to generate a comprehensive AGENTS.md file for this project. This file will instruct AI coding agents on how to work in this codebase correctly. Follow these steps:

## Step 1: Analyze the Project

Explore the codebase and gather:
- Language, framework, and major dependency versions (from package.json, composer.json, Gemfile, go.mod, requirements.txt, Cargo.toml, etc.)
- Directory structure and code organization patterns (where do models, controllers, services, tests live?)
- **Architectural Observations**: Describe what you directly observe (directory names, file names, import patterns). Do NOT guess architectural labels (like "CQRS" or "DDD") unless there is explicit evidence (e.g., a file named `CommandHandler` inside a `Commands/` directory). If uncertain, describe the structure instead of labeling it.
- Module/package count and naming conventions
- How tests are organized, base classes/traits, test runner, and testing philosophy (unit vs integration ratio, what gets mocked, what uses real DB)
- Error handling patterns (custom exception classes, error middleware, global handlers)
- Security patterns (auth middleware location, permission checks, input sanitization, CSRF)
- Logging setup (library used, what gets logged, standard log levels)
- Environment/Config loading (.env patterns, per-environment overrides, secrets management)
- Type system strictness (strict types enabled? generics usage? type narrowing?)
- Dependency injection patterns (container, manual wiring, constructor injection?)
- Generated code (migrations, proto stubs, OpenAPI clients, IDE helpers) — note what should NEVER be edited manually
- CI/CD configuration (what checks run on PR? what blocks merge?)
- Docker/container setup (compose files, Makefiles, scripts)
- Linting/formatting tools and their configs
- Database setup (connections, migrations location, ORM patterns, read/write split)
- API response patterns (how are responses serialized? presenters, transformers, resources?)
- Caching patterns (driver, TTL conventions, key naming, invalidation strategy)
- Event/messaging patterns (event bus, queues, Kafka, pub/sub)

*Important: If a data source for any of the above doesn't exist (e.g., no Docker, no CI), note "No [X] detected" and skip that item. Do not guess or fill with generic advice.*

## Step 2: Analyze Git History for Style

Run these git commands to study the coding style:

1. `git config user.name` and `git config user.email` — identify the developer
2. `git log --oneline | wc -l` — check total commit count. If total commits < 50, skip this step entirely and write "Insufficient commit history for style analysis."
3. Filter out bot authors (dependabot, renovate, github-actions, ci, automation) and use `--no-merges`. If this is a forked repo, use `--first-parent` to exclude upstream history.
4. Fetch up to 1000 valid commit messages. *(If output exceeds your context window, sample the 500 most recent and 500 oldest, and note the gap.)*
5. Analyze the messages. **To get accurate counts, use shell tools (`grep`, `awk`, `sort`, `uniq`) if you have execution access. If you do not have shell execution access, parse the text but you MUST append `[verify: count]` to any numbers you derive.** Calculate:
   - Commit message format (conventional commits? ticket prefixes? terse vs descriptive?)
   - Most common action verbs with exact counts (e.g., "fix: 45, add: 30")
   - Domain keywords frequency — what parts of the codebase are touched most?
   - Style evolution over time (compare the first 20% of commits to the last 20% of commits)
   - Ticket/issue prefix patterns (Jira, Linear, GitHub issues?)
   - Date range of contributions
6. If I provide a GitHub/GitLab profile URL, fetch it and extract: title/role, technical skills, and notable achievements or metrics.

## Step 3: Analyze Performance Patterns

Search the codebase for:
- Eager loading patterns (e.g., `->with()`, `include`, `preload`, joins)
- Pagination patterns
- Caching usage (e.g., `Cache::remember`, Redis patterns, memoization, HTTP caching headers)
- Batch processing (e.g., `chunk`, `cursor`, `batch`, streaming)
- Query optimization (select specific columns, `exists` checks, indexed queries)
- Response shaping (presenters, serializers, transformers, DTOs)
- **Potential N+1 indicators**: Search for relationship access in loops or serializers without eager loading. ONLY flag cases where you can see the full call chain (query → loop → access). If you cannot verify whether it's eager-loaded upstream, omit it rather than guessing.

## Step 4: Generate the AGENTS.md

Structure the file with these exact sections. Target 250-400 total lines.

### 1. Header (2 lines)
One-line project description with language, framework, version, and scale (module/package count).

### 2. Architecture at a Glance (30–50 lines)
- ASCII tree of top-level directories with purpose annotations
- Note any generated code directories that must not be manually edited
- Describe the anatomy of a typical module/package based on direct observation. If you include subdirectory counts, append `[verify: count]` if you cannot verify via shell commands.

### 3. Docker / Dev Environment (15–25 lines)
- How to run commands (container exec, Makefile shortcuts, scripts)
- Services table with ports and stack info
- Keep Makefile shortcuts as the preferred method if one exists
- If no Docker detected, write "No Docker setup detected" and skip

### 4. Essential Commands (15–25 lines)
- Table of common tasks (test, lint, format, analyze, migrate)
- Note important flags (disable debugger, memory limits, config clearing)
- CI info (how many test suites, parallel groups, which branches trigger checks)

### 5. Guardrails — ALWAYS / NEVER / WATCH OUT (40–60 lines)
This is the highest-impact section. Give it room.

**ALWAYS**: Things the agent must do on every change. Derived from the dominant patterns in the codebase.
*Crucial: Before writing an ALWAYS rule, verify the dominant pattern is actually a good practice. If the codebase predominantly does something that contradicts the framework's recommended approach, put it in WATCH OUT instead ("Legacy code does X, but for new code prefer Y").*

**NEVER**: Things that will break the build or violate project conventions. Be specific and actionable (e.g., "Don't use pattern X — we use Y instead", "Don't manually edit files in /generated/").

**WATCH OUT**: Gotchas and edge cases unique to this project — inconsistent naming conventions that coexist, feature flags that gate functionality, database split configurations, modules with non-standard structure.

### 6. Decision Trees (30–50 lines)
Write 3 decision trees as indented code blocks:
- "Where does this code go?" — routing new code to the right directory
- "How do I add a new endpoint/feature?" — step-by-step checklist
- "How do I write a test?" — which base class, traits, naming convention

### 7. Performance & Query Standards (20–30 lines)
Based ONLY on actual patterns found in the codebase:
- N+1 prevention rules with specific examples from the project
- Caching strategy with real TTL values and key formats extracted from the code
- Batch operation conventions (chunk sizes, cursor vs chunk)
- If no performance patterns detected, write "No established performance patterns detected" and skip

### 8. Error Handling, Logging & Security (15–25 lines)
- How errors are thrown and handled (custom exception classes, middleware, response format)
- What gets logged and at what level
- How auth/permissions work for new endpoints
- If any of these are not established, note it

### 9. Rules References (5–10 lines)
Link to any existing rule files, style guides, or documentation in the repo (e.g., `.cursorrules`, `.claude/rules/`, `CONTRIBUTING.md`, `.editorconfig`). If none exist, write "No existing rule files detected."

### 10. Developer Style Guide (30–50 lines)
Write in second-person imperative ("Match this format...", "Follow this pattern..."). Include:
- **Commit Format**: The exact format to use, with 3 real examples extracted from the git history. If style evolved, show the current style and note it explicitly.
- **Code Style**: Specific patterns to follow (null safety, typing, naming, import organization) derived from the most recent commits.
- **Domain Focus**: Table of areas the developer works on most, based on commit keyword frequency.
- **Key Features**: Attempt to identify ticket prefixes and list top 5 tickets by commit count. If the ticket prefix format is too inconsistent or difficult to parse reliably, write "Ticket prefix format too varied to aggregate reliably" instead of guessing.

## Formatting & Verification Rules

- Use tables for structured data (services, commands, domain expertise)
- Use code blocks for decision trees and directory structures
- Use bullet points for rules and guidelines
- Keep it scannable — an agent should find any answer in under 5 seconds
- **NO HALLUCINATED NUMBERS**: When stating counts or values, you must either cite the exact command or file that produced the number, or write "[verify: X]". Never estimate.
- Every rule must be grounded in actual codebase evidence. If you didn't see it, don't write it.
- If a section lacks data, write "No [X] detected" — do not fill space with generic advice.
- Total file should be 250–400 lines — comprehensive but not bloated.
```
