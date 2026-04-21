I need you to generate a comprehensive set of Continue.dev-native guidance files for this project. Instead of a single monolithic AGENTS.md, you will produce **rule files** (`.continue/rules/*.md`) that leverage Continue's glob-based conditional loading system.

## Why Continue.dev-Native?

Continue.dev supports project-level context through:

1. **Rule files** (`.continue/rules/*.md`) — Markdown files with YAML front-matter that are injected into chat and autocomplete based on glob patterns:
   - `alwaysApply: true` — loaded in every chat session
   - `globs: "pattern"` — auto-attached when matching files are open in the editor
   - No front-matter / `alwaysApply: false` — available but not auto-loaded (agent can reference manually)
2. **`.continue/config.yaml`** (or `config.json`) — Main configuration for models, context providers, slash commands, and MCP servers. Project-level config in `.continue/config.yaml` overrides user-level settings.
3. **Context providers** — `@file`, `@codebase`, `@docs`, `@terminal` can be referenced in prompts. Document which ones are most valuable for this project.

The AGENTS.md still exists as a lightweight entrypoint for non-Continue agents.

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

## Step 4: Generate Continue.dev-Native Guidance

### Output 1: AGENTS.md (Lightweight Entrypoint — ~50 lines max)

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

Detailed guidance for Continue.dev lives in `.continue/rules/`:
- `.continue/rules/architecture.md` — always on
- `.continue/rules/guardrails.md` — always on
- `.continue/rules/developer-style.md` — always on
- `.continue/rules/testing.md` — auto on test files
- `.continue/rules/code-quality.md` — auto on source files
- `.continue/rules/database.md` — auto on model/migration files
- `.continue/rules/api-development.md` — auto on controller/route files
- `.continue/rules/performance.md` — auto on service/repository files
- `.continue/rules/error-handling.md` — auto on exception files
- `.continue/rules/integrations.md` — auto on integration files
```

---

### Output 2: Rule Files (`.continue/rules/*.md`)

Each rule file begins with YAML front-matter, then content immediately after `---`.

Front-matter schema:
```yaml
---
name: "Rule Name"
description: "Brief description for the agent"
globs: "pattern"       # optional: auto-attach on file match
alwaysApply: true      # optional: load in every session
---
```

#### `architecture.md` (Always on)
```yaml
---
name: "Project Architecture"
description: "Project structure, module layout, and directory conventions"
alwaysApply: true
---
```
Target: 40–60 lines.
- ASCII tree of top-level directories with purpose annotations
- Note generated code directories that must not be manually edited
- Anatomy of a typical module (include counts of how many modules have each subdirectory)
- Dominant patterns table (pattern, adoption count, notes)

#### `guardrails.md` (Always on — highest impact)
```yaml
---
name: "Project Guardrails"
description: "Critical ALWAYS/NEVER rules and decision trees"
alwaysApply: true
---
```
Target: 50–70 lines.

**ALWAYS** — Things the agent must do on every change.
**NEVER** — Things that will break the build or violate conventions.
**WATCH OUT** — Project-specific gotchas.

**Decision Trees**:
- "Where does this code go?"
- "How do I add a new endpoint/feature?"

#### `developer-style.md` (Always on)
```yaml
---
name: "Developer Style"
description: "Commit format, code style, domain expertise, and key features"
alwaysApply: true
---
```
Target: 30–50 lines.
- Commit format with 3 real examples
- Code style patterns from recent commits
- Domain focus table
- Key features by commit count

#### `testing.md` (Auto-attached to test files)
```yaml
---
name: "Testing Conventions"
description: "Test structure, base classes, runners, and naming conventions"
globs: "tests/**,*Test.php,*test*.php,*spec*"
alwaysApply: false
---
```
Target: 30–40 lines.
- Running tests, base classes, key traits
- Test environment config
- Naming conventions, factory locations
- Decision tree: "How do I write a test?"

#### `code-quality.md` (Auto-attached to source files)
```yaml
---
name: "Code Quality Standards"
description: "Linting, static analysis, IDE helpers, and language features"
globs: "**/*.php"
alwaysApply: false
---
```
Target: 20–30 lines.

#### `database.md` (Auto-attached to migration/model files)
```yaml
---
name: "Database Conventions"
description: "Connections, migration locations, factories, and repository pattern"
globs: "**/Migrations/**,**/Models/**,**/Database/**"
alwaysApply: false
---
```
Target: 20–30 lines.

#### `api-development.md` (Auto-attached to controller/route files)
```yaml
---
name: "API Development"
description: "Controller conventions, validation, response serialization, and routing"
globs: "**/Controllers/**,**/routes/**,**/Requests/**"
alwaysApply: false
---
```
Target: 20–30 lines.

#### `performance.md` (Auto-attached to service/repository files)
```yaml
---
name: "Performance Rules"
description: "N+1 prevention, caching strategy, and batch operations"
globs: "**/Services/**,**/Repositories/**,**/Presenters/**"
alwaysApply: false
---
```
Target: 20–30 lines.

#### `error-handling.md` (Auto-attached to exception files)
```yaml
---
name: "Error Handling"
description: "Exception classes, logging standards, and monitoring"
globs: "**/Exceptions/**,**/Exception*"
alwaysApply: false
---
```
Target: 15–25 lines.

#### `integrations.md` (Auto-attached to integration files)
```yaml
---
name: "Integrations"
description: "Redis, Kafka, gRPC, AWS, payments, and feature flags"
globs: "**/Kafka/**,**/gRPC/**,**/Redis/**,**/AWS/**,**/Payment*/**"
alwaysApply: false
---
```
Target: 20–30 lines.

---

### Output 3: `.continue/config.yaml` (Project Configuration)

Create a minimal `.continue/config.yaml` that configures:

```yaml
# Continue.dev project configuration
rules:
  - .continue/rules/architecture.md
  - .continue/rules/guardrails.md
  - .continue/rules/developer-style.md
  - .continue/rules/testing.md
  - .continue/rules/code-quality.md
  - .continue/rules/database.md
  - .continue/rules/api-development.md
  - .continue/rules/performance.md
  - .continue/rules/error-handling.md
  - .continue/rules/integrations.md

# Useful context providers for this project
# Reference these with @provider-name in chat
contextProviders:
  - name: codebase
    params:
      nRetrieve: 25
      nFinal: 10
  - name: terminal
  - name: file
```

Adjust `nRetrieve` and `nFinal` based on project size (larger projects benefit from higher values).

---

## Formatting & Verification Rules

- Use tables for structured data (services, commands, domain expertise)
- Use code blocks for decision trees and directory structures
- Use bullet points for rules and guidelines
- Keep each rule file scannable — the agent should find any answer in under 5 seconds
- **NO HALLUCINATED NUMBERS**: Cite the exact command or file that produced the number, or write "[verify: X]". Never estimate.
- Every rule must be grounded in actual codebase evidence. If you didn't see it, don't write it.
- If a section lacks data, write "No [X] detected" — do not fill space with generic advice.
- Content starts immediately after the closing `---` of front-matter — no blank lines between front-matter and content.
