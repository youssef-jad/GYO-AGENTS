I need you to generate a comprehensive `GEMINI.md` file for this project. Gemini CLI uses a single `GEMINI.md` file at the repository root as its project-level instruction context. There is no conditional loading, front-matter, or sub-files — everything goes into one well-organized file.

## Why Gemini CLI's Approach Is Different

Gemini CLI (`gemini` command line tool by Google) uses:

1. **`GEMINI.md`** (repository root) — The primary project instructions file, automatically loaded when Gemini CLI is run within the repository directory. Injected as system context before every conversation.
2. **`~/.gemini/GEMINI.md`** (user-level) — Personal/global instructions. Out of scope for project setup.
3. No conditional loading, no front-matter, no glob patterns — all content is always included.

Because everything is always included, the file must be:
- **Dense and high-signal** — every line earns its place
- **Well-structured** with clear headings so Gemini can locate any rule quickly
- **Concise** — Gemini CLI has a generous context window, but bloat reduces signal quality

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

## Step 4: Generate the `GEMINI.md` File

Target total length: **150–200 lines** — comprehensive but not bloated.
No front-matter. Start directly with a `#` heading.

### Required Sections (in this order):

#### 1. Project Overview
- One-line description with language, framework, version, and module count
- Essential commands table (test, lint, static analysis, local dev start)
- Docker/container commands if applicable

#### 2. Project Structure
- Compact ASCII tree of top-level directories with purpose annotations
- Highlight generated directories that must NOT be manually edited
- Module anatomy: typical subdirectories per module with actual counts

#### 3. Architecture
- Dominant patterns table: pattern name, adoption evidence, notes
- Inter-module communication patterns (if observed)

#### 4. ALWAYS
8–10 critical rules the agent must follow on every change.
*Before writing an ALWAYS rule, verify the dominant pattern is actually good practice. If not, put it in WATCH OUT instead.*

#### 5. NEVER
8–10 hard prohibitions that will break the build or violate conventions. Be specific and actionable.

#### 6. WATCH OUT
5–7 project-specific gotchas: inconsistent naming, feature flags, database read/write splits, known tech debt, non-standard patterns in specific modules.

#### 7. Decision Trees
Two decision trees as indented code blocks:
- "Where does this code go?"
- "How do I add a new endpoint/feature?"

#### 8. Testing
- How to run tests (all, specific suite, parallel, CI command)
- Base classes and key traits, with when to use each
- Naming conventions
- Factory locations

#### 9. Code Quality
- Linting and static analysis commands
- Standards configured (levels, rule sets)
- IDE helpers (what they are, do NOT edit manually)

#### 10. Database
- Connection names and their purpose
- Migration locations (core vs module if applicable)
- Repository pattern summary

#### 11. API Development
- Controller conventions
- Validation approach
- Response format conventions
- Authentication/authorization middleware

#### 12. Performance Rules
- N+1 prevention (specific patterns observed in this codebase)
- Caching rules (driver, TTL conventions if found, key format)
- Batch operation conventions
- Write "No established performance patterns detected" if none found

#### 13. Error Handling & Logging
- Exception class conventions
- Log levels and what context to include
- Monitoring: Sentry / ELK / other (with actual evidence)

#### 14. Integrations
- List each integration found with a one-line description
- Feature flags that gate functionality
- Write "No [X] detected" for integrations not found

#### 15. Developer Style
- Commit format with 3 real examples from git history
- Code style patterns observed in recent commits
- Domain focus table: area → commit frequency
- Top 5 key features by commit count

---

## Output 2: AGENTS.md (Lightweight Entrypoint — ~50 lines max)

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

Detailed guidance for Gemini CLI:
- `GEMINI.md` — all project conventions (auto-loaded by Gemini CLI)
```

---

## Formatting & Verification Rules

- Use tables for structured data (services, commands, domain expertise)
- Use code blocks for decision trees and directory structures
- Use bullet points for rules and guidelines
- **NO HALLUCINATED NUMBERS**: Cite the exact command or file that produced the number, or write "[verify: X]". Never estimate.
- Every rule must be grounded in actual codebase evidence. If you didn't see it, don't write it.
- If a section lacks data, write "No [X] detected" — do not fill space with generic advice.
- `GEMINI.md` has no front-matter — start directly with `# {Project Name}`.
