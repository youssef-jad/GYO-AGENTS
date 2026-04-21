I need you to generate a comprehensive set of Claude Code-native guidance files for this project. Instead of a single monolithic AGENTS.md, you will produce a **hierarchical CLAUDE.md system** where context is loaded based on which directory Claude Code is operating in. Claude Code supports nested CLAUDE.md files — each directory can have its own, and they are all loaded and merged.

## Why Claude Code-Native?

Claude Code uses a hierarchical file loading system:

1. **`~/CLAUDE.md`** — User-level instructions (personal preferences, cross-project conventions). Out of scope for project setup.
2. **`CLAUDE.md`** (repository root) — Project-wide instructions always loaded when Claude Code runs in this repo.
3. **`{subdirectory}/CLAUDE.md`** — Directory-scoped instructions loaded only when Claude Code operates in that subdirectory (e.g., `tests/CLAUDE.md`, `modules/CLAUDE.md`).

All applicable CLAUDE.md files are loaded and concatenated — root first, then subdirectory. There is no front-matter or conditional logic; inclusion is purely path-based.

Additionally, Claude Code supports:
- **`#[[import:path/to/file]]`** — Inline file imports within any CLAUDE.md
- **`.claude/settings.json`** — Permissions, allowed/denied tools, environment variables
- **`.claude/commands/`** — Custom slash commands (Markdown files that become `/project:command-name`)

---

## Step 1: Analyze the Project

Explore the codebase and gather:
- Language, framework, and major dependency versions (from composer.json, package.json, go.mod, etc.)
- Directory structure and code organization patterns (models, controllers, services, tests)
- **Architectural Observations**: Describe what you directly observe (directory names, file names, import patterns). Do NOT guess architectural labels (like "CQRS" or "DDD") unless there is explicit evidence. If uncertain, describe the structure instead of labeling it.
- Module/package count and naming conventions
- Test organization, base classes/traits, test runner, and testing philosophy
- Error handling patterns (custom exception classes, error middleware, global handlers)
- Security patterns (auth middleware, permission checks, input sanitization)
- Logging setup (library, what gets logged, standard log levels)
- Environment/Config loading (.env patterns, per-environment overrides)
- Type system strictness (strict types? generics? type narrowing?)
- Dependency injection patterns (container, manual wiring, constructor injection?)
- Generated code (migrations, proto stubs, IDE helpers) — note what should NEVER be edited manually
- CI/CD configuration (what checks run on PR? what blocks merge?)
- Docker/container setup (compose files, Makefiles, scripts)
- Linting/formatting tools and their configs
- Database setup (connections, migrations location, ORM patterns, read/write split)
- API response patterns (serialization, presenters, transformers, resources)
- Caching patterns (driver, TTL conventions, key naming, invalidation strategy)
- Event/messaging patterns (event bus, queues, Kafka, pub/sub)

*Important: If a data source for any of the above doesn't exist, note "No [X] detected" and skip. Do not guess or fill with generic advice.*

---

## Step 2: Analyze Git History for Style

Run these git commands to study the coding style:

1. `git config user.name` and `git config user.email` — identify the developer
2. `git log --oneline | wc -l` — check total commit count. If < 50, skip and write "Insufficient commit history for style analysis."
3. Filter out bot authors (dependabot, renovate, github-actions, ci, automation) and use `--no-merges`. If forked, use `--first-parent`.
4. Fetch up to 1000 valid commit messages. *(If output exceeds context window, sample 500 most recent + 500 oldest, note the gap.)*
5. Analyze:
   - Commit message format (conventional commits? ticket prefixes? terse vs descriptive?)
   - Most common action verbs with counts
   - Domain keywords frequency — what parts of the codebase are touched most?
   - Style evolution over time (compare oldest 50 vs newest 50 commits)
   - Ticket/issue prefix patterns (Jira, Linear, GitHub issues?)
   - How many unique tickets worked on
   - How many PRs merged (grep for "Merge pull request")
   - Date range of contributions
6. If a GitHub/GitLab profile URL is provided, fetch and extract: title/role, technical skills, notable achievements.

---

## Step 3: Analyze Performance Patterns

Search the codebase for:
- Eager loading patterns (e.g., `->with()`, `include`, `preload`, joins)
- Pagination patterns
- Caching usage (e.g., `Cache::remember`, Redis patterns, memoization)
- Batch processing (e.g., `chunk`, `cursor`, `batch`, streaming)
- Query optimization (select specific columns, `exists` checks, indexed queries)
- Response shaping (presenters, serializers, transformers, DTOs)
- **Potential N+1 indicators**: Search for relationship access in loops or serializers without eager loading. ONLY flag cases where you can see the full call chain. If you cannot verify eager-loading upstream, omit it.

---

## Step 4: Generate Claude Code-Native Guidance

### Output 1: `CLAUDE.md` (Repository Root — always loaded)

Target: 80–120 lines. This is the primary file — always loaded regardless of working directory.

Structure:
```markdown
# {Project Name}

{One-line description with language, framework, version, module count}

## Essential Commands

| Task | Command |
|---|---|
| ... | ... |

## Docker
{How to run commands inside the container}

## Project Structure
{Compact ASCII tree of top directories with purpose annotations}
{Note generated directories that must NOT be manually edited}

## Architecture
{Dominant patterns table: pattern, adoption, notes}

## Module Anatomy
{Typical module structure with subdirectory counts}

## ALWAYS
{8–10 critical rules the agent must follow on every change}

## NEVER
{8–10 things that will break the build or violate conventions}

## WATCH OUT
{5–7 project-specific gotchas: inconsistent naming, feature flags, database splits}

## Commit Format
{Exact format + 3 real examples from git history}

## Code Style
{Specific patterns from recent commits: null safety, typing, naming, imports}

## Where Does This Code Go?
{Decision tree as indented code block}

## How Do I Add a New Endpoint/Feature?
{Step-by-step checklist as indented code block}
```

---

### Output 2: Directory-Scoped CLAUDE.md Files

Create these subdirectory CLAUDE.md files for the most commonly edited areas.

#### `tests/CLAUDE.md`
Target: 30–40 lines.
Loaded when Claude Code operates in the `tests/` directory.
- Running tests (all, specific suite, parallel, CI)
- Base classes and when to use each
- Key traits & helpers
- Test environment config
- Naming conventions (prefer snake_case for new code)
- Factory locations
- Decision tree: "How do I write a test?"

#### `modules/CLAUDE.md` (or equivalent module root)
Target: 30–40 lines.
Loaded when operating in the modules directory.
- Module creation checklist
- Namespace conventions
- Constructor injection pattern
- DTO conventions
- Events & Listeners pattern
- Route organization

#### `database/CLAUDE.md` (or migrations directory)
Target: 20–30 lines.
- Connections table
- Migration naming and location conventions (core vs module)
- Factory locations
- Repository pattern and BaseRepository
- Safe migration practices (never drop columns without a grace period, etc.)

---

### Output 3: `.claude/settings.json` (Permissions & Tools)

Create a `.claude/settings.json` that:
- Allows shell commands needed for this project (test runner, linting, artisan, make)
- Denies destructive operations that should require confirmation
- Sets environment hints if applicable

Example schema:
```json
{
  "permissions": {
    "allow": [
      "Bash(./vendor/bin/phpunit*)",
      "Bash(./vendor/bin/phpcs*)",
      "Bash(php artisan*)",
      "Bash(make*)"
    ],
    "deny": [
      "Bash(rm -rf*)",
      "Bash(git push --force*)",
      "Bash(php artisan migrate:fresh*)"
    ]
  }
}
```

Generate the allow/deny list based on actual commands found in the Makefile, composer.json scripts, and CI configuration.

---

### Output 4: `.claude/commands/` (Custom Slash Commands)

Create at least 2 custom slash commands relevant to this project's most common tasks.

Each command is a Markdown file. The filename becomes the command name.
Use `$ARGUMENTS` as a placeholder for user input.

Examples to consider based on codebase patterns:
- `new-module.md` — scaffolds a new module following conventions
- `add-endpoint.md` — checklist for adding a new API endpoint
- `run-tests.md` — runs the appropriate test suite for the current context
- `check-quality.md` — runs linting and static analysis

Command file format:
```markdown
Run the following steps to {action} for $ARGUMENTS:

1. {Step 1}
2. {Step 2}
...
```

---

### Output 5: AGENTS.md (Lightweight Entrypoint — ~50 lines max)

```markdown
# AGENTS.md

{One-line project description with language, framework, version, module count}

## Essential Commands

| Task | Command |
|---|---|
| ... | ... |

## Docker

{How to run commands inside the container, if applicable}

## Rules

Detailed guidance for Claude Code:
- Always-on: `CLAUDE.md` (root)
- Directory-scoped: `tests/CLAUDE.md`, `modules/CLAUDE.md`, `database/CLAUDE.md`
- Permissions: `.claude/settings.json`
- Custom commands: `.claude/commands/`
```

---

## Formatting & Verification Rules

- Use tables for structured data (services, commands, domain expertise)
- Use code blocks for decision trees and directory structures
- Use bullet points for rules and guidelines
- Keep each file scannable — Claude should find any answer in under 5 seconds
- **NO HALLUCINATED NUMBERS**: Cite the exact command or file that produced the number, or write "[verify: X]". Never estimate.
- Every rule must be grounded in actual codebase evidence. If you didn't see it, don't write it.
- If a section lacks data, write "No [X] detected" — do not fill space with generic advice.
- CLAUDE.md files have no front-matter — start directly with a `#` heading.
