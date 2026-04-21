I need you to generate a comprehensive set of Windsurf-native guidance files for this project. Instead of a single monolithic AGENTS.md, you will produce **rule files** (`.windsurf/rules/*.md`) and an optimized **AGENTS.md** that references them. This approach leverages Windsurf's glob-based conditional rule system and Cascade AI flows.

## Why Windsurf-Native?

Windsurf has two primary guidance mechanisms:

1. **Rule files** (`.windsurf/rules/*.md`) — Always-on or conditional context injected into Cascade conversations. Use YAML front-matter to control inclusion:
   - `trigger: always_on` — injected into every Cascade conversation
   - `trigger: glob` + `globs: ["pattern"]` — auto-attached when matching files are in context
   - `trigger: model_decision` — Cascade decides when to include based on the description
   - `trigger: manual` — only included when explicitly referenced
2. **Global Rules** (Windsurf Settings › Global Rules) — User-level rules that apply across all workspaces. Out of scope for project-level setup, but note their existence.

The AGENTS.md still exists as a lightweight entrypoint for non-Windsurf agents, but the heavy lifting moves to rule files.

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

## Step 4: Generate Windsurf-Native Guidance

### Output 1: AGENTS.md (Lightweight Entrypoint — ~50 lines max)

This file is the entrypoint for non-Windsurf agents (Codex, Claude). Keep it minimal.

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

Detailed guidance lives in `.windsurf/rules/`:
- .windsurf/rules/architecture.md
- .windsurf/rules/module-development.md
- .windsurf/rules/testing.md
- .windsurf/rules/code-quality.md
- .windsurf/rules/database.md
- .windsurf/rules/api-development.md
- .windsurf/rules/guardrails.md
- .windsurf/rules/developer-style.md
```

---

### Output 2: Rule Files (`.windsurf/rules/*.md`)

Create these rule files. Each must begin with YAML front-matter followed immediately by content.

The `.windsurf/rules/` front-matter schema:

```yaml
---
trigger: always_on | glob | model_decision | manual
globs: ["pattern"]         # required when trigger is glob
description: "..."         # required when trigger is model_decision
---
```

#### 2a. `architecture.md` (Always on)
```yaml
---
trigger: always_on
---
```
Target: 40–60 lines.
- ASCII tree of top-level directories with purpose annotations
- Note generated code directories that must not be manually edited
- Anatomy of a typical module (include counts of how many modules have each subdirectory)
- Dominant patterns table (pattern, adoption count, notes)

#### 2b. `module-development.md` (Always on)
```yaml
---
trigger: always_on
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

#### 2c. `testing.md` (Glob-triggered on test files)
```yaml
---
trigger: glob
globs: ["tests/**", "*Test.php", "*test*.php"]
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

#### 2d. `code-quality.md` (Glob-triggered on source files)
```yaml
---
trigger: glob
globs: ["**/*.php"]
---
```
Target: 20–30 lines.
- PHPCS config and limits
- PHPStan level and scope
- IDE helpers (what they are, how to regenerate)
- PHP 8.1+ features in use

#### 2e. `database.md` (Glob-triggered on migration/model files)
```yaml
---
trigger: glob
globs: ["**/Migrations/**", "**/Models/**", "**/Database/**"]
---
```
Target: 20–30 lines.
- Connections table
- Migration locations (core vs module)
- Factory locations
- Repository pattern and BaseRepository

#### 2f. `api-development.md` (Glob-triggered on controller/route files)
```yaml
---
trigger: glob
globs: ["**/Controllers/**", "**/routes/**", "**/Requests/**"]
---
```
Target: 20–30 lines.
- Controller conventions
- Validation via FormRequest
- Response serialization
- Route organization
- Authentication

#### 2g. `guardrails.md` (Always on — highest impact)
```yaml
---
trigger: always_on
---
```
Target: 50–70 lines.

**ALWAYS** — Things Cascade must do on every change.
*Before writing an ALWAYS rule, verify the dominant pattern is actually good practice.*

**NEVER** — Things that will break the build or violate conventions. Be specific and actionable.

**WATCH OUT** — Gotchas and edge cases unique to this project (inconsistent naming, feature flags, database splits, non-standard modules).

**Decision Trees** — Write 2 decision trees as indented code blocks:
- "Where does this code go?" — routing new code to the right directory
- "How do I add a new endpoint/feature?" — step-by-step checklist

#### 2h. `developer-style.md` (Always on)
```yaml
---
trigger: always_on
---
```
Target: 30–50 lines.
- **Commit Format**: Exact format with 3 real examples from git history.
- **Code Style**: Specific patterns (null safety, typing, naming, import organization) from recent commits.
- **Domain Focus**: Table of areas worked on most, based on commit keyword frequency.
- **Key Features**: Top 5 tickets/PRs by commit count with one-line descriptions.

#### 2i. `integrations.md` (Glob-triggered on integration files)
```yaml
---
trigger: glob
globs: ["**/Kafka/**", "**/gRPC/**", "**/Redis/**", "**/AWS/**", "**/Payment*/**"]
---
```
Target: 20–30 lines.
- Redis, Kafka, gRPC, AWS, payment gateways, SMS, monitoring
- Feature flags that gate functionality

#### 2j. `performance.md` (Glob-triggered on service/repository files)
```yaml
---
trigger: glob
globs: ["**/Services/**", "**/Repositories/**", "**/Presenters/**"]
---
```
Target: 20–30 lines.
- N+1 prevention rules with specific examples from the project
- Caching strategy with real TTL values and key formats
- Batch operation conventions (chunk sizes, cursor vs chunk)
- If no performance patterns detected, write "No established performance patterns detected"

#### 2k. `error-handling.md` (Glob-triggered on exception files)
```yaml
---
trigger: glob
globs: ["**/Exceptions/**", "**/Exception*"]
---
```
Target: 15–25 lines.
- How errors are thrown and handled
- Sentry vs ELK usage standards
- What gets logged and at what level

#### 2l. `cascade-workflow.md` (Model decision — Cascade-specific)
```yaml
---
trigger: model_decision
description: "How to use Windsurf Cascade flows, multi-file edits, and terminal commands effectively in this project"
---
```
Target: 20–30 lines.
- How to structure multi-step Cascade tasks for this codebase
- Which directories are safe for Cascade to auto-edit vs requiring confirmation
- Terminal commands Cascade should prefer (make targets, artisan, etc.)
- How to use Cascade's `@file` references to pull in context from key files
- Checkpoints to suggest before destructive operations (migrations, seed resets)

---

## Formatting & Verification Rules

- Use tables for structured data (services, commands, domain expertise)
- Use code blocks for decision trees and directory structures
- Use bullet points for rules and guidelines
- Keep each rule file scannable — Cascade should find any answer in under 5 seconds
- **NO HALLUCINATED NUMBERS**: When stating counts or values, cite the exact command or file that produced the number, or write "[verify: X]". Never estimate.
- Every rule must be grounded in actual codebase evidence. If you didn't see it, don't write it.
- If a section lacks data, write "No [X] detected" — do not fill space with generic advice.
- Content starts immediately after the closing `---` of the front-matter — no blank lines between front-matter and content.
