I need you to generate a comprehensive `.clinerules` file for this project. Cline uses a single `.clinerules` file at the repository root — there is no conditional loading or front-matter. Everything goes into one well-organized file that Cline reads before every interaction.

## Why Cline's Approach Is Different

Cline uses a **single flat file** (`.clinerules`) with no conditional logic. This means:
- All context is always loaded — keep it dense and high-signal
- Order matters — put highest-impact rules first
- No glob patterns, no front-matter, no sub-files
- The file is read verbatim as part of every system prompt

Additionally, Cline supports a **`.clignore`** file (like `.gitignore`) to prevent Cline from reading sensitive files or large generated directories.

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

## Step 4: Generate the `.clinerules` File

Because everything lives in one file, organize it with clear `##` section headers. Cline reads this as a system-prompt prefix, so it should read like expert instructions to a senior developer.

Target total length: **150–200 lines** — comprehensive but not bloated.

### Required Sections (in this order):

#### 1. Project Overview
- One-line description with language, framework, version, and module count
- Essential commands table (test, lint, static analysis, local dev)
- Docker/container commands if applicable

#### 2. Project Structure
- Compact ASCII tree of top-level directories with purpose annotations
- Note generated directories that must NOT be manually edited
- Module anatomy: typical subdirectories per module, based on actual counts

#### 3. ALWAYS
8–10 rules the agent must follow on every change. Derived from dominant patterns.
*Before writing an ALWAYS rule, verify the pattern is actually good practice.*

#### 4. NEVER
8–10 things that will break the build or violate conventions. Be specific and actionable.
Include: never edit generated files, never skip validation, never bypass auth middleware, etc.

#### 5. WATCH OUT
5–7 project-specific gotchas: inconsistent naming across modules, feature flags, database read/write splits, non-standard patterns in specific modules, known tech debt areas.

#### 6. Where Does This Code Go?
Decision tree as an indented code block — routes new code to the right directory.

#### 7. How Do I Add a New Endpoint/Feature?
Step-by-step numbered checklist.

#### 8. Testing
- How to run tests (all, specific suite, parallel, CI)
- Base classes and key traits
- Naming conventions
- Factory locations

#### 9. Code Quality
- Linting and static analysis commands
- Standards configured (PHPCS, PHPStan level, etc.)
- IDE helpers (what NOT to edit)

#### 10. Database
- Connection names and their purpose
- Migration locations (core vs module)
- Repository pattern summary

#### 11. Performance Rules
- N+1 prevention (specific patterns from this codebase)
- Caching rules (TTL conventions, key format)
- Batch operation conventions
- If no patterns detected: "No established performance patterns detected"

#### 12. Error Handling
- How exceptions are thrown and caught
- Logging standards (what level, what context)
- Monitoring (Sentry/ELK usage)

#### 13. Commit Format
- Exact format with 3 real examples from git history
- Note any style evolution observed

#### 14. Domain Focus
- Table of most-touched areas (from commit keyword frequency)
- Key features by commit count

---

## Output 2: `.clignore`

Create a `.clignore` file that prevents Cline from reading:
- Generated IDE helper files (`_ide_helper.php`, `_ide_helper_models.php`, `.phpstorm.meta.php`)
- Compiled/generated proto stubs or gRPC files
- Vendor directory
- Node modules
- Build artifacts and cache directories
- Log files
- Any secrets or credentials files

Base the list on directories and files actually found in this project.

---

## Output 3: AGENTS.md (Lightweight Entrypoint — ~50 lines max)

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

Detailed guidance for Cline:
- `.clinerules` — all project conventions (always loaded)
- `.clignore` — files Cline should not read
```

---

## Formatting & Verification Rules

- Keep the file dense but scannable — use `##` headers, tables, and bullet points
- **NO HALLUCINATED NUMBERS**: Cite the exact command or file that produced the number, or write "[verify: X]". Never estimate.
- Every rule must be grounded in actual codebase evidence. If you didn't see it, don't write it.
- If a section lacks data, write "No [X] detected" — do not fill with generic advice.
- The `.clinerules` file has no front-matter — start directly with the first `##` section.
- Total token budget is precious — prefer concrete specifics over generic advice.
