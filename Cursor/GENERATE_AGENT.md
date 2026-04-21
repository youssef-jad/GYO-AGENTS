I need you to generate a comprehensive set of Cursor-native guidance files for this project. Instead of a single monolithic AGENTS.md, you will produce **rule files** (`.cursor/rules/*.mdc`) and an optimized **AGENTS.md** that references them. This approach leverages Cursor's conditional rule system, glob-based auto-attachment, and agent-requested rules.

## Why Cursor-Native?

Cursor has one primary guidance mechanism that replaces a monolithic AGENTS.md:

1. **Rule files** (`.cursor/rules/*.mdc`) — Always-on or conditional context injected into agent interactions. Use YAML front-matter to control when each rule is included:
   - `alwaysApply: true` — injected into every conversation
   - `globs: "pattern"` — auto-attached when matching files are open or referenced
   - Neither (description only) — agent-requested or manual rules

The AGENTS.md still exists as a lightweight entrypoint for non-Cursor agents, but the heavy lifting moves to rule files where Cursor can selectively load context.

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

## Step 4: Generate Cursor-Native Guidance

### Output 1: AGENTS.md (Lightweight Entrypoint — ~50 lines max)

This file is the entrypoint for non-Cursor agents (Codex, Claude). Keep it minimal — it should reference the rule files for details.

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

Detailed guidance lives in `.cursor/rules/` (Cursor) and `.claude/rules/` (Claude):
- .cursor/rules/architecture.mdc
- .cursor/rules/module-development.mdc
- .cursor/rules/testing.mdc
- .cursor/rules/code-quality.mdc
- .cursor/rules/database.mdc
- .cursor/rules/api-development.mdc
- .cursor/rules/guardrails.mdc
- .cursor/rules/developer-style.mdc
```

---

### Output 2: Rule Files (`.cursor/rules/*.mdc`)

Create these rule files. Each one should be focused, scannable, and grounded in actual codebase evidence.

The `.mdc` front-matter controls inclusion behavior:

| Front-matter | Behavior |
|---|---|
| `alwaysApply: true` | Injected into every agent conversation |
| `globs: "pattern"` | Auto-attached when matching files are open/referenced |
| `description: "..."` only | Agent-requested — Cursor decides when to include it |
| Both `globs` + `alwaysApply: true` | Always on AND highlights relevant files |

#### 2a. `architecture.mdc` (Always included)
```yaml
---
description: Project architecture, directory structure, and module layout
alwaysApply: true
---
```
Target: 40–60 lines.
- ASCII tree of top-level directories with purpose annotations
- Note generated code directories that must not be manually edited
- Anatomy of a typical module (include counts of how many modules have each subdirectory)
- Dominant patterns table (pattern, adoption count, notes)

#### 2b. `module-development.mdc` (Always included)
```yaml
---
description: How to create and extend modules, controllers, DTOs, events, and commands
alwaysApply: true
---
```
Target: 30–40 lines.
- Controller organization by user type
- Constructor injection pattern
- DTO conventions
- Events & Listeners pattern
- Command handler pattern (note limited adoption)
- Module registration and namespace conventions
- Route organization

#### 2c. `testing.mdc` (Auto-attached to test files)
```yaml
---
description: Test conventions, base classes, traits, and how to run the test suite
globs: "tests/**,*Test.php,*test*.php"
alwaysApply: false
---
```
Target: 30–40 lines.
- Running tests (all, specific suite, parallel, CI)
- Base classes and when to use each
- Key traits & helpers
- Test environment config
- Naming conventions (note coexisting styles, prefer snake_case for new code)
- Factory locations
- Decision tree: "How do I write a test?"

#### 2d. `code-quality.mdc` (Auto-attached to language source files)
```yaml
---
description: Linting, static analysis, code style standards, and IDE helpers
globs: "**/*.php"
alwaysApply: false
---
```
Target: 20–30 lines.
- PHPCS config and limits
- PHPStan level and scope
- IDE helpers (what they are, how to regenerate)
- PHP 8.1+ features in use

#### 2e. `database.mdc` (Auto-attached to migration/model files)
```yaml
---
description: Database connections, migration locations, factories, and repository pattern
globs: "**/Migrations/**,**/Models/**,**/Database/**"
alwaysApply: false
---
```
Target: 20–30 lines.
- Connections table
- Migration locations (core vs module)
- Factory locations
- Repository pattern and BaseRepository

#### 2f. `api-development.mdc` (Auto-attached to controller/route files)
```yaml
---
description: Controller conventions, request validation, response serialization, and routing
globs: "**/Controllers/**,**/routes/**,**/Requests/**"
alwaysApply: false
---
```
Target: 20–30 lines.
- Controller conventions
- Validation via FormRequest
- Response serialization (Json facade)
- Route organization
- Authentication (Passport)

#### 2g. `guardrails.mdc` (Always included — highest impact)
```yaml
---
description: Critical ALWAYS/NEVER rules, watch-outs, and decision trees for navigating the codebase
alwaysApply: true
---
```
Target: 50–70 lines.

This is the most critical rule file. Structure it as:

**ALWAYS** — Things the agent must do on every change. Derived from dominant patterns.
*Before writing an ALWAYS rule, verify the dominant pattern is actually good practice. If the codebase predominantly does something that contradicts the framework's recommended approach, put it in WATCH OUT instead.*

**NEVER** — Things that will break the build or violate conventions. Be specific and actionable.

**WATCH OUT** — Gotchas and edge cases unique to this project (inconsistent naming, feature flags, database splits, non-standard modules).

**Decision Trees** — Write 2 decision trees as indented code blocks:
- "Where does this code go?" — routing new code to the right directory
- "How do I add a new endpoint/feature?" — step-by-step checklist

#### 2h. `developer-style.mdc` (Always included)
```yaml
---
description: Commit message format, code style patterns, domain focus, and developer profile
alwaysApply: true
---
```
Target: 30–50 lines.
- **Commit Format**: Exact format with 3 real examples from git history. Note style evolution if applicable.
- **Code Style**: Specific patterns (null safety, typing, naming, import organization) from recent commits.
- **Domain Focus**: Table of areas worked on most, based on commit keyword frequency.
- **Key Features**: Top 5 tickets/PRs by commit count with one-line descriptions.

#### 2i. `integrations.mdc` (Auto-attached to integration-related files)
```yaml
---
description: Redis, Kafka, gRPC, AWS, payments, SMS, and feature flags
globs: "**/Kafka/**,**/gRPC/**,**/grpc/**,**/Redis/**,**/AWS/**,**/Payment*/**"
alwaysApply: false
---
```
Target: 20–30 lines.
- Redis, Kafka, gRPC, AWS, payment gateways, SMS, monitoring
- Feature flags that gate functionality

#### 2j. `performance.mdc` (Auto-attached to service/repository files)
```yaml
---
description: N+1 prevention, caching strategy, batch operations, and query optimization
globs: "**/Services/**,**/Repositories/**,**/Presenters/**"
alwaysApply: false
---
```
Target: 20–30 lines.
- N+1 prevention rules with specific examples from the project
- Caching strategy with real TTL values and key formats
- Batch operation conventions (chunk sizes, cursor vs chunk)
- If no performance patterns detected, write "No established performance patterns detected"

#### 2k. `error-handling.mdc` (Auto-attached to exception files)
```yaml
---
description: Exception classes, error logging, Sentry vs ELK standards, and log levels
globs: "**/Exceptions/**,**/Exception*"
alwaysApply: false
---
```
Target: 15–25 lines.
- How errors are thrown and handled (custom exception classes, ExceptionLogger)
- Sentry vs ELK usage standards
- What gets logged and at what level
- Auth/permissions for new endpoints

---

## Formatting & Verification Rules

- Use tables for structured data (services, commands, domain expertise)
- Use code blocks for decision trees and directory structures
- Use bullet points for rules and guidelines
- Keep each rule file scannable — an agent should find any answer in under 5 seconds
- **NO HALLUCINATED NUMBERS**: When stating counts or values, cite the exact command or file that produced the number, or write "[verify: X]". Never estimate.
- Every rule must be grounded in actual codebase evidence. If you didn't see it, don't write it.
- If a section lacks data, write "No [X] detected" — do not fill space with generic advice.
- Rule file content starts immediately after the closing `---` of the front-matter — no blank lines between front-matter and content.
