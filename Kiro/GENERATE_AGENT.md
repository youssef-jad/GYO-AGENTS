I need you to generate a comprehensive set of Kiro-native guidance files for this project. Instead of a single monolithic AGENTS.md, you will produce **steering files** (`.kiro/steering/*.md`), **hooks** (`.kiro/hooks/*.json`), and an optimized **AGENTS.md** that references them. This approach leverages Kiro's spec/task workflow, conditional steering, and automated hooks.

## Why Kiro-Native?

Kiro has three guidance mechanisms that replace a monolithic AGENTS.md:

1. **Steering files** (`.kiro/steering/*.md`) — Always-on or conditional context injected into every agent interaction. Use front-matter for conditional inclusion.
2. **Hooks** (`.kiro/hooks/*.json`) — Automated agent actions triggered by IDE events (file edits, tool use, task execution).
3. **Specs** (`.kiro/specs/`) — Structured feature development: requirements.md → design.md → tasks.md.

The AGENTS.md still exists as a lightweight entrypoint, but the heavy lifting moves to steering files where Kiro can selectively load context.

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

## Step 4: Generate Kiro-Native Guidance

### Output 1: AGENTS.md (Lightweight Entrypoint — ~50 lines max)

This file is the entrypoint for non-Kiro agents (Codex, Claude). Keep it minimal — it should reference the steering files for details.

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

Detailed guidance lives in `.kiro/steering/` (Kiro) and `.claude/rules/` (Claude):
- @.kiro/steering/architecture.md
- @.kiro/steering/module-development.md
- @.kiro/steering/testing.md
- @.kiro/steering/code-quality.md
- @.kiro/steering/database.md
- @.kiro/steering/api-development.md
- @.kiro/steering/guardrails.md
- @.kiro/steering/developer-style.md
```

---

### Output 2: Steering Files (`.kiro/steering/*.md`)

Create these steering files. Each one should be focused, scannable, and grounded in actual codebase evidence.

#### 2a. `architecture.md` (Always included — no front-matter needed)
Target: 40–60 lines.
- ASCII tree of top-level directories with purpose annotations
- Note generated code directories that must not be manually edited
- Anatomy of a typical module (include counts of how many modules have each subdirectory)
- Dominant patterns table (pattern, adoption count, notes)

#### 2b. `module-development.md` (Always included)
Target: 30–40 lines.
- Controller organization by user type
- Constructor injection pattern
- DTO conventions
- Events & Listeners pattern
- Command handler pattern (note limited adoption)
- Module registration and namespace conventions
- Route organization

#### 2c. `testing.md` (Conditional — include when test files are read)
Target: 30–40 lines.
Front-matter:
```yaml
---
inclusion: fileMatch
fileMatchPattern: "tests/**,*Test.php,*test*.php"
---
```
- Running tests (all, specific suite, parallel, CI)
- Base classes and when to use each
- Key traits & helpers
- Test environment config
- Naming conventions (note coexisting styles, prefer snake_case for new code)
- Factory locations
- Decision tree: "How do I write a test?"

#### 2d. `code-quality.md` (Conditional — include when PHP files are edited)
Target: 20–30 lines.
Front-matter:
```yaml
---
inclusion: fileMatch
fileMatchPattern: "**/*.php"
---
```
- PHPCS config and limits
- PHPStan level and scope
- IDE helpers (what they are, how to regenerate)
- PHP 8.1+ features in use

#### 2e. `database.md` (Conditional — include when migration/model files are read)
Target: 20–30 lines.
Front-matter:
```yaml
---
inclusion: fileMatch
fileMatchPattern: "**/Migrations/**,**/Models/**,**/Database/**"
---
```
- Connections table
- Migration locations (core vs module)
- Factory locations
- Repository pattern and BaseRepository

#### 2f. `api-development.md` (Conditional — include when controller/route files are read)
Target: 20–30 lines.
Front-matter:
```yaml
---
inclusion: fileMatch
fileMatchPattern: "**/Controllers/**,**/routes/**,**/Requests/**"
---
```
- Controller conventions
- Validation via FormRequest
- Response serialization (Json facade)
- Route organization
- Authentication (Passport)

#### 2g. `guardrails.md` (Always included — highest impact)
Target: 50–70 lines.

This is the most critical steering file. Structure it as:

**ALWAYS** — Things the agent must do on every change. Derived from dominant patterns.
*Before writing an ALWAYS rule, verify the dominant pattern is actually good practice. If the codebase predominantly does something that contradicts the framework's recommended approach, put it in WATCH OUT instead.*

**NEVER** — Things that will break the build or violate conventions. Be specific and actionable.

**WATCH OUT** — Gotchas and edge cases unique to this project (inconsistent naming, feature flags, database splits, non-standard modules).

**Decision Trees** — Write 2 decision trees as indented code blocks:
- "Where does this code go?" — routing new code to the right directory
- "How do I add a new endpoint/feature?" — step-by-step checklist

#### 2h. `developer-style.md` (Always included)
Target: 30–50 lines.
- **Commit Format**: Exact format with 3 real examples from git history. Note style evolution if applicable.
- **Code Style**: Specific patterns (null safety, typing, naming, import organization) from recent commits.
- **Domain Focus**: Table of areas worked on most, based on commit keyword frequency.
- **Key Features**: Top 5 tickets/PRs by commit count with one-line descriptions.

#### 2i. `integrations.md` (Conditional — include when integration-related files are read)
Target: 20–30 lines.
Front-matter:
```yaml
---
inclusion: fileMatch
fileMatchPattern: "**/Kafka/**,**/gRPC/**,**/grpc/**,**/Redis/**,**/AWS/**,**/Payment*/**"
---
```
- Redis, Kafka, gRPC, AWS, payment gateways, SMS, monitoring
- Feature flags that gate functionality

#### 2j. `performance.md` (Conditional — include when query/service files are read)
Target: 20–30 lines.
Front-matter:
```yaml
---
inclusion: fileMatch
fileMatchPattern: "**/Services/**,**/Repositories/**,**/Presenters/**"
---
```
- N+1 prevention rules with specific examples from the project
- Caching strategy with real TTL values and key formats
- Batch operation conventions (chunk sizes, cursor vs chunk)
- If no performance patterns detected, write "No established performance patterns detected"

#### 2k. `error-handling.md` (Conditional — include when exception files are read)
Target: 15–25 lines.
Front-matter:
```yaml
---
inclusion: fileMatch
fileMatchPattern: "**/Exceptions/**,**/Exception*"
---
```
- How errors are thrown and handled (custom exception classes, ExceptionLogger)
- Sentry vs ELK usage standards
- What gets logged and at what level
- Auth/permissions for new endpoints

#### 2l. `spec-workflow.md` (Always included)
Target: 20–30 lines.

This is Kiro-specific guidance for the spec workflow:
- How to structure requirements.md (user stories, acceptance criteria with WHEN/SHALL format)
- How to structure design.md (architecture diagram, components, data models, correctness properties)
- How to structure tasks.md (implementation plan with checkable items, requirement traceability)
- Reference the existing spec at `.kiro/specs/pos-cancel-transaction-by-identifier/` as a template
- Note: specs support file references via `#[[file:relative_path]]` for linking to OpenAPI specs, schemas, etc.

---

### Output 3: Hooks (`.kiro/hooks/*.json`)

Create these automated hooks:

#### 3a. `lint-on-save.json`
Trigger: `fileEdited` on `*.php`
Action: `runCommand` — `./vendor/bin/phpcs --standard=phpcs.xml {file}`
Purpose: Catch code style issues immediately on save.

#### 3b. `verify-generated-files.json`
Trigger: `preToolUse` on `write` tool category
Action: `askAgent` — Prompt the agent to check if the file being written is in a generated code directory (`_ide_helper.php`, `_ide_helper_models.php`, `.phpstorm.meta.php`, `grpc/ZidGrpc/`). If so, warn that these files should not be manually edited.

#### 3c. `run-tests-after-task.json`
Trigger: `postTaskExecution`
Action: `runCommand` — `./vendor/bin/phpunit --testsuite={relevant_suite}`
Purpose: Automatically verify tests pass after completing a spec task.

#### 3d. `review-new-module-files.json`
Trigger: `fileCreated` on `modules/**/*.php`
Action: `askAgent` — Prompt the agent to verify the new file follows module conventions: correct namespace (`Zid\Modules\{ModuleName}\`), proper base class extension, constructor injection with PHP 8 property promotion.

---

## Formatting & Verification Rules

- Use tables for structured data (services, commands, domain expertise)
- Use code blocks for decision trees and directory structures
- Use bullet points for rules and guidelines
- Keep each steering file scannable — an agent should find any answer in under 5 seconds
- **NO HALLUCINATED NUMBERS**: When stating counts or values, cite the exact command or file that produced the number, or write "[verify: X]". Never estimate.
- Every rule must be grounded in actual codebase evidence. If you didn't see it, don't write it.
- If a section lacks data, write "No [X] detected" — do not fill space with generic advice.
- Steering files should be 20–70 lines each — focused and not bloated.
- AGENTS.md should be ~50 lines max — it's just an entrypoint.
- Total across all files: 300–500 lines of actual guidance content.

---

## Summary of Outputs

| Output | Path | Lines | Inclusion |
|--------|------|-------|-----------|
| AGENTS.md | `AGENTS.md` | ~50 | N/A (entrypoint for non-Kiro agents) |
| Architecture | `.kiro/steering/architecture.md` | 40–60 | Always |
| Module Development | `.kiro/steering/module-development.md` | 30–40 | Always |
| Testing | `.kiro/steering/testing.md` | 30–40 | Conditional (test files) |
| Code Quality | `.kiro/steering/code-quality.md` | 20–30 | Conditional (PHP files) |
| Database | `.kiro/steering/database.md` | 20–30 | Conditional (migration/model files) |
| API Development | `.kiro/steering/api-development.md` | 20–30 | Conditional (controller/route files) |
| Guardrails | `.kiro/steering/guardrails.md` | 50–70 | Always |
| Developer Style | `.kiro/steering/developer-style.md` | 30–50 | Always |
| Integrations | `.kiro/steering/integrations.md` | 20–30 | Conditional (integration files) |
| Performance | `.kiro/steering/performance.md` | 20–30 | Conditional (service/repo files) |
| Error Handling | `.kiro/steering/error-handling.md` | 15–25 | Conditional (exception files) |
| Spec Workflow | `.kiro/steering/spec-workflow.md` | 20–30 | Always |
| Lint Hook | `.kiro/hooks/lint-on-save.json` | ~10 | Event: fileEdited |
| Generated Files Hook | `.kiro/hooks/verify-generated-files.json` | ~10 | Event: preToolUse |
| Post-Task Tests Hook | `.kiro/hooks/run-tests-after-task.json` | ~10 | Event: postTaskExecution |
| New Module Hook | `.kiro/hooks/review-new-module-files.json` | ~10 | Event: fileCreated |
