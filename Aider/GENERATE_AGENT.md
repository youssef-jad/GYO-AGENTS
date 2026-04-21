I need you to generate a comprehensive set of Aider-native guidance files for this project. Aider uses a combination of a **chat file** (`CONVENTIONS.md` or any file passed via `--read`), a **configuration file** (`.aider.conf.yml`), and a **`.aiderignore`** file to control its behavior.

## Why Aider's Approach Is Different

Aider is a CLI-first AI coding tool. Its guidance system:

1. **`CONVENTIONS.md`** (or any name) — A conventions file that Aider reads at startup when passed via `--read CONVENTIONS.md` or set in `.aider.conf.yml`. This is the primary instruction file. Aider injects its contents as read-only context.
2. **`.aider.conf.yml`** — YAML configuration file at the repo root. Controls models, auto-read files, auto-commit behavior, linting commands, test commands, and more.
3. **`.aiderignore`** — Like `.gitignore` — tells Aider which files to never read or modify. Prevents accidental editing of generated code, secrets, or large binary files.
4. **In-chat `/add` and `/read`** — Users can add files to context at runtime. The CONVENTIONS.md should tell users which files to `/add` for specific tasks.

There is no conditional loading or front-matter — everything in CONVENTIONS.md is always read.

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
   - Domain keywords frequency
   - Style evolution over time (compare oldest 50 vs newest 50 commits)
   - Ticket/issue prefix patterns
   - How many unique tickets worked on
   - How many PRs merged
   - Date range of contributions
6. If a GitHub/GitLab profile URL is provided, fetch and extract: title/role, technical skills, notable achievements.

---

## Step 3: Analyze Performance Patterns

Search the codebase for:
- Eager loading patterns (e.g., `->with()`, `include`, `preload`, joins)
- Pagination patterns
- Caching usage
- Batch processing
- Query optimization
- Response shaping
- **Potential N+1 indicators**: Only flag cases where you can see the full call chain.

---

## Step 4: Generate Aider-Native Guidance

### Output 1: `CONVENTIONS.md`

This is the primary instruction file for Aider. Target: **150–200 lines** — comprehensive but efficient.
It will be passed to Aider via `--read CONVENTIONS.md` (configured in `.aider.conf.yml`).

Structure:
```markdown
# {Project Name} — Conventions

{One-line description with language, framework, version, module count}

## Essential Commands
| Task | Command |
|---|---|
| ... | ... |

## Docker
{Container commands}

## Project Structure
{ASCII tree of top-level directories with annotations}
{Generated directories: NEVER edit manually}

## Module Anatomy
{Typical module structure}

## ALWAYS
{8–10 critical rules, grounded in codebase evidence}

## NEVER
{8–10 hard prohibitions, specific and actionable}

## WATCH OUT
{5–7 project-specific gotchas}

## Where Does This Code Go?
{Decision tree as indented code block}

## How Do I Add a New Endpoint/Feature?
{Numbered checklist}

## Testing
{Test runner commands, base classes, naming, factories}

## Code Quality
{Lint/static analysis commands and standards}

## Database
{Connections, migration locations, repository pattern}

## Performance Rules
{N+1, caching, batch operations — project-specific}

## Error Handling
{Exception patterns, logging levels, monitoring}

## Integrations
{Redis, Kafka, gRPC, AWS, payments, feature flags}
{Write "No [X] detected" if not present}

## Commit Format
{Exact format + 3 real examples from git history}

## Files to /add for Common Tasks

When working on X, use `/add` to include these files for context:
- **Adding an endpoint**: `/add routes/{relevant}.php`, `/add app/Http/Controllers/{relevant}.php`
- **Writing a test**: `/add tests/Unit/BaseTest.php`, `/add tests/Feature/BaseTest.php`
- **Adding a migration**: `/add database/migrations/{latest}.php`
- **Working in a module**: `/add modules/{ModuleName}/Module.php`

{Adapt this section to actual files and task types found in the codebase}
```

---

### Output 2: `.aider.conf.yml`

Create a `.aider.conf.yml` that configures Aider for this project:

```yaml
# Aider configuration for {Project Name}

# Always read conventions file
read:
  - CONVENTIONS.md

# Auto-linting on edit (runs after every file change)
lint-cmd: "./vendor/bin/phpcs --standard=phpcs.xml {file}"

# Auto-test command (run with --auto-test flag)
test-cmd: "./vendor/bin/phpunit --stop-on-failure"

# Auto-commit aider's changes with conventional format
auto-commits: true
commit-prompt: |
  Write a commit message following this project's format:
  {exact format from git history analysis}
  Examples: {2 real examples from git history}

# Git settings
dirty-commits: false
attribute-author: false

# Editor
editor: none
```

Populate `lint-cmd` and `test-cmd` based on actual scripts found in `composer.json`, `Makefile`, or CI configuration. If multiple options exist, prefer the fastest one.

---

### Output 3: `.aiderignore`

Create a `.aiderignore` that prevents Aider from reading or modifying:
- Generated IDE helper files
- Compiled/generated proto stubs
- Vendor directory
- Node modules
- Build artifacts and cache directories
- Log files
- Secrets and credentials
- Any large binary or media files

Base the list on directories and files actually found in this project.

---

### Output 4: AGENTS.md (Lightweight Entrypoint — ~50 lines max)

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

Detailed guidance for Aider:
- `CONVENTIONS.md` — all project conventions (always read via `.aider.conf.yml`)
- `.aider.conf.yml` — Aider configuration (lint, test, commit format)
- `.aiderignore` — files Aider should not read or modify

Start Aider with: `aider` (conventions auto-loaded from `.aider.conf.yml`)
```

---

## Formatting & Verification Rules

- Keep CONVENTIONS.md dense and high-signal — token efficiency matters in Aider's context window
- **NO HALLUCINATED NUMBERS**: Cite the exact command or file that produced the number, or write "[verify: X]". Never estimate.
- Every rule must be grounded in actual codebase evidence. If you didn't see it, don't write it.
- If a section lacks data, write "No [X] detected" — do not fill with generic advice.
- No front-matter in any Aider file — start directly with content.
