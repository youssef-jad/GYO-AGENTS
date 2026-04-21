I need you to generate a comprehensive set of GitHub Copilot-native guidance files for this project. Instead of a single monolithic AGENTS.md, you will produce **instruction files** (`.github/copilot-instructions.md` and `.instructions.md` files) that leverage Copilot's `applyTo` glob system for conditional context injection.

## Why GitHub Copilot-Native?

GitHub Copilot supports two levels of instruction files:

1. **Repository-wide instructions** (`.github/copilot-instructions.md`) — Always included in every Copilot Chat conversation for this repository. No front-matter needed. Keep it focused and high-signal.
2. **Scoped instruction files** (`.instructions.md` or `path/to/*.instructions.md`) — Files with YAML front-matter that are auto-attached based on `applyTo` glob patterns. Placed anywhere in the repository; Copilot auto-discovers them.

Front-matter schema for scoped instruction files:
```yaml
---
applyTo: "glob/pattern/**"
---
```
- `applyTo: "**"` — applies to all files (use sparingly, prefer the repo-wide file instead)
- `applyTo: "src/**/*.ts"` — applies only when TypeScript files under `src/` are in context
- Multiple patterns: `applyTo: "tests/**,*Test.php"`

The AGENTS.md still exists as a lightweight entrypoint for non-Copilot agents.

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

## Step 4: Generate GitHub Copilot-Native Guidance

### Output 1: `.github/copilot-instructions.md` (Repository-wide — always included)

Target: 60–80 lines. This is the most important file — it's injected into every Copilot Chat conversation.
No front-matter needed.

Structure:
```markdown
# {Project Name} — Copilot Instructions

{One-line description with language, framework, version, module count}

## Project Structure
{Compact ASCII tree of top directories with annotations}

## Essential Commands
| Task | Command |
|---|---|
| ... | ... |

## Architecture
{3–5 bullet points on dominant patterns, directly observed}

## ALWAYS
{5–8 critical rules the agent must follow on every change}

## NEVER
{5–8 things that will break the build or violate conventions}

## Commit Format
{Exact format + 2 real examples from git history}
```

---

### Output 2: Scoped Instruction Files

Place these at the repository root or in relevant directories. Each file name should be descriptive: `testing.instructions.md`, `database.instructions.md`, etc.

#### `testing.instructions.md`
```yaml
---
applyTo: "tests/**,*Test.php,*test*.php,*spec*"
---
```
Target: 30–40 lines.
- Running tests (all, specific suite, parallel, CI)
- Base classes and when to use each
- Key traits & helpers
- Test environment config
- Naming conventions (prefer snake_case for new code)
- Factory locations
- Decision tree: "How do I write a test?"

#### `code-quality.instructions.md`
```yaml
---
applyTo: "**/*.php"
---
```
Target: 20–30 lines.
- PHPCS config and limits
- PHPStan level and scope
- IDE helpers (what they are, how to regenerate)
- PHP 8.1+ features in use

#### `database.instructions.md`
```yaml
---
applyTo: "**/Migrations/**,**/Models/**,**/Database/**"
---
```
Target: 20–30 lines.
- Connections table
- Migration locations (core vs module)
- Factory locations
- Repository pattern and BaseRepository

#### `api.instructions.md`
```yaml
---
applyTo: "**/Controllers/**,**/routes/**,**/Requests/**"
---
```
Target: 20–30 lines.
- Controller conventions
- Validation via FormRequest
- Response serialization
- Route organization
- Authentication

#### `performance.instructions.md`
```yaml
---
applyTo: "**/Services/**,**/Repositories/**,**/Presenters/**"
---
```
Target: 20–30 lines.
- N+1 prevention rules with specific examples from the project
- Caching strategy with real TTL values and key formats
- Batch operation conventions

#### `error-handling.instructions.md`
```yaml
---
applyTo: "**/Exceptions/**,**/Exception*"
---
```
Target: 15–25 lines.
- How errors are thrown and handled
- Sentry vs ELK usage standards
- What gets logged and at what level

#### `integrations.instructions.md`
```yaml
---
applyTo: "**/Kafka/**,**/gRPC/**,**/Redis/**,**/AWS/**,**/Payment*/**"
---
```
Target: 20–30 lines.
- Redis, Kafka, gRPC, AWS, payment gateways, SMS, monitoring
- Feature flags that gate functionality

---

### Output 3: AGENTS.md (Lightweight Entrypoint — ~50 lines max)

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

Detailed guidance for GitHub Copilot:
- Always-on: `.github/copilot-instructions.md`
- Scoped instructions: `*.instructions.md` files throughout the repo
```

---

## Formatting & Verification Rules

- Use tables for structured data (services, commands, domain expertise)
- Use code blocks for decision trees and directory structures
- Use bullet points for rules and guidelines
- Keep files scannable — Copilot should find any answer in under 5 seconds
- **NO HALLUCINATED NUMBERS**: Cite the exact command or file that produced the number, or write "[verify: X]". Never estimate.
- Every rule must be grounded in actual codebase evidence. If you didn't see it, don't write it.
- If a section lacks data, write "No [X] detected" — do not fill space with generic advice.
- The `.github/copilot-instructions.md` file has no front-matter — start directly with content.
- Scoped instruction files start content immediately after the closing `---` of the front-matter.
