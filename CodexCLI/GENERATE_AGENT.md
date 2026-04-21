I need you to generate a comprehensive `AGENTS.md` file for this project optimized for OpenAI Codex CLI. Codex CLI uses a single `AGENTS.md` file at the repository root (and optionally in subdirectories) as its project-level instruction context.

## Why Codex CLI's Approach Is Different

OpenAI Codex CLI uses:

1. **`AGENTS.md`** (repository root) — The primary project instructions file, automatically discovered and loaded when Codex CLI runs within the repository. Always injected as context.
2. **Subdirectory `AGENTS.md` files** — Codex CLI also loads `AGENTS.md` files from subdirectories when operating in those directories, merging them with the root file. This enables directory-scoped context.
3. No front-matter, no glob patterns, no conditional loading at the file level.

Codex CLI is a powerful agentic coding tool with shell access — it can run commands, edit files, and interact with the file system. The `AGENTS.md` should emphasize:
- Which commands are safe to run automatically
- Which operations require human confirmation
- How to navigate the codebase efficiently

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
- **Potential N+1 indicators**: Only flag cases where you can see the full call chain.

---

## Step 4: Generate Codex CLI-Native Guidance

### Output 1: `AGENTS.md` (Repository Root — always loaded)

Target: **150–200 lines**. This is the only file Codex CLI auto-loads.
No front-matter. Start with `#` heading.

Structure:

```markdown
# {Project Name}

{One-line description with language, framework, version, module count}

## Essential Commands

| Task | Command |
|---|---|
| Run all tests | ... |
| Run specific suite | ... |
| Lint | ... |
| Static analysis | ... |
| Start dev environment | ... |

## Docker
{Commands to run inside container, if applicable}

## Project Structure
{ASCII tree of top-level directories with annotations}
{Generated directories: NEVER edit manually}

## Module Anatomy
{Typical module structure, based on observed counts}

## Architecture
{Dominant patterns table: pattern, adoption evidence, notes}

## ALWAYS
{8–10 critical rules for every change}

## NEVER
{8–10 hard prohibitions — specific and actionable}

## WATCH OUT
{5–7 project-specific gotchas}

## Safe Commands (Codex CLI may run automatically)
{List of commands safe to run without asking:
  - Read operations: grep, find, git log, git diff
  - Test execution: specific test commands
  - Linting: lint checks (read-only)
  - Build checks: compile/type-check only}

## Requires Confirmation Before Running
{Commands that Codex CLI should ALWAYS ask before executing:
  - Database migrations (php artisan migrate)
  - Seeding/resetting database (migrate:fresh, db:seed)
  - Writing to .env files
  - git push, git reset --hard
  - rm -rf, large file deletions
  - Docker compose down with --volumes}

## Where Does This Code Go?
{Decision tree as indented code block}

## How Do I Add a New Endpoint/Feature?
{Numbered checklist}

## Testing
{Runners, base classes, key traits, naming, factories}

## Code Quality
{Lint and static analysis commands + standards}

## Database
{Connections, migration locations, repository pattern}

## Performance Rules
{N+1 prevention, caching, batch operations — project-specific}

## Error Handling
{Exception patterns, logging levels, monitoring}

## Integrations
{Redis, Kafka, gRPC, AWS, payments — observed only}

## Commit Format
{Exact format + 3 real examples from git history}

## Developer Domain Focus
{Table: area → commit frequency (from git history)}
```

---

### Output 2: Subdirectory `AGENTS.md` Files

Create focused `AGENTS.md` files in high-traffic subdirectories. These are merged with the root file when Codex CLI operates in that directory.

#### `tests/AGENTS.md`
Target: 20–30 lines.
Focus only on testing:
- Test runner commands and options
- Base classes, key traits
- How to locate and use factories
- Naming conventions
- Common pitfalls when writing tests in this codebase

#### `modules/AGENTS.md` (or equivalent module root)
Target: 20–30 lines.
Focus only on module development:
- Module creation checklist with exact namespace format
- Constructor injection pattern
- File placement rules per file type
- How to register a new module

---

## Formatting & Verification Rules

- Use tables for structured data (services, commands, domain expertise)
- Use code blocks for decision trees and directory structures
- Use bullet points for rules and guidelines
- The "Safe Commands" and "Requires Confirmation" sections are **Codex CLI-specific** — keep them accurate and based on real commands found in the project
- **NO HALLUCINATED NUMBERS**: Cite the exact command or file that produced the number, or write "[verify: X]". Never estimate.
- Every rule must be grounded in actual codebase evidence. If you didn't see it, don't write it.
- If a section lacks data, write "No [X] detected" — do not fill space with generic advice.
- No front-matter in any file — start directly with content.
