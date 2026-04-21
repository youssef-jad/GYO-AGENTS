I need you to generate a comprehensive set of RooCode-native guidance files for this project. Instead of a single monolithic AGENTS.md, you will produce **mode-scoped rule files** (`.roo/rules*/`) and a **custom modes definition** (`.roomodes`). This approach leverages RooCode's powerful mode system, where different AI personas (Architect, Code, Debug, Test) each get tailored context.

## Why RooCode-Native?

RooCode has two primary guidance mechanisms:

1. **Rule files** — Context files loaded per mode:
   - `.roo/rules/` — Rules loaded for **all** modes (global project rules)
   - `.roo/rules-{mode}/` — Rules loaded only when that specific mode is active (e.g., `.roo/rules-code/`, `.roo/rules-architect/`, `.roo/rules-test/`, `.roo/rules-debug/`)
   - Files inside these directories are loaded in alphabetical order — name them with numeric prefixes (`01-`, `02-`) to control order
2. **Custom Modes** (`.roomodes`) — JSON file defining custom AI personas with specific tool permissions, file restrictions, and base instructions. You can create project-specific modes beyond the defaults.

Default modes: `architect`, `code`, `test`, `debug`, `ask`
Custom modes can restrict: which tools are available, which files can be read/written, and what the base system prompt says.

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

## Step 4: Generate RooCode-Native Guidance

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

Detailed guidance lives in `.roo/rules*/`:
- `.roo/rules/` — global rules (all modes)
- `.roo/rules-architect/` — architecture & design rules
- `.roo/rules-code/` — implementation rules
- `.roo/rules-test/` — testing rules
- `.roo/rules-debug/` — debugging rules
```

---

### Output 2: Global Rule Files (`.roo/rules/`)

These are loaded in every mode. Name with numeric prefixes for order control.

#### `01-architecture.md`
Target: 40–60 lines.
- ASCII tree of top-level directories with purpose annotations
- Note generated code directories that must not be manually edited
- Anatomy of a typical module
- Dominant patterns table

#### `02-guardrails.md`
Target: 50–70 lines.

**ALWAYS** — Things the agent must do on every change.
**NEVER** — Things that will break the build or violate conventions.
**WATCH OUT** — Gotchas and edge cases unique to this project.

**Decision Trees**:
- "Where does this code go?"
- "How do I add a new endpoint/feature?"

#### `03-developer-style.md`
Target: 30–50 lines.
- Commit format with 3 real examples
- Code style patterns from recent commits
- Domain focus table
- Key features by commit count

---

### Output 3: Architect Mode Rules (`.roo/rules-architect/`)

Loaded only when the `architect` mode is active — focus on design, planning, and structure decisions.

#### `01-architecture-deep.md`
Target: 30–40 lines.
- Full module inventory with purpose and dependency notes
- Inter-module communication patterns
- Patterns to follow vs patterns to avoid (with evidence)
- How to structure a new module from scratch

#### `02-module-development.md`
Target: 30–40 lines.
- Controller organization
- Constructor injection
- DTO conventions
- Events & Listeners
- Module registration and namespace conventions

---

### Output 4: Code Mode Rules (`.roo/rules-code/`)

Loaded when the `code` mode is active — focus on implementation conventions.

#### `01-code-quality.md`
Target: 20–30 lines.
- PHPCS config and limits
- PHPStan level and scope
- IDE helpers
- PHP 8.1+ features in use

#### `02-api-development.md`
Target: 20–30 lines.
- Controller conventions
- Validation via FormRequest
- Response serialization
- Route organization
- Authentication

#### `03-database.md`
Target: 20–30 lines.
- Connections table
- Migration locations
- Factory locations
- Repository pattern

#### `04-performance.md`
Target: 20–30 lines.
- N+1 prevention rules
- Caching strategy
- Batch operation conventions

#### `05-integrations.md`
Target: 20–30 lines.
- Redis, Kafka, gRPC, AWS, payment gateways, SMS
- Feature flags

---

### Output 5: Test Mode Rules (`.roo/rules-test/`)

Loaded when the `test` mode is active.

#### `01-testing.md`
Target: 30–40 lines.
- Running tests (all, specific suite, parallel, CI)
- Base classes and when to use each
- Key traits & helpers
- Test environment config
- Naming conventions
- Factory locations
- Decision tree: "How do I write a test?"

---

### Output 6: Debug Mode Rules (`.roo/rules-debug/`)

Loaded when the `debug` mode is active.

#### `01-error-handling.md`
Target: 15–25 lines.
- How errors are thrown and handled
- Sentry vs ELK usage standards
- What gets logged and at what level
- Common failure patterns in this codebase

#### `02-debug-checklist.md`
Target: 15–20 lines.
- Step-by-step debugging checklist for this project's tech stack
- Key log file locations
- How to reproduce issues in the local Docker environment
- Database query logging setup

---

### Output 7: `.roomodes` (Custom Modes Definition)

Create a `.roomodes` JSON file defining at minimum one custom mode tailored to this project. Example schema:

```json
{
  "customModes": [
    {
      "slug": "module-builder",
      "name": "Module Builder",
      "roleDefinition": "You are an expert in this project's module architecture. You create new modules following established patterns exactly.",
      "customInstructions": "Always check .roo/rules-architect/ before creating any new module. Follow the module anatomy exactly as documented.",
      "groups": ["read", "edit", "command"],
      "source": "project"
    }
  ]
}
```

Create a custom mode relevant to this project's most common development task (e.g., module creation, API endpoint building, migration authoring). Base it on actual patterns found in Step 1.

---

## Formatting & Verification Rules

- Use tables for structured data (services, commands, domain expertise)
- Use code blocks for decision trees and directory structures
- Use bullet points for rules and guidelines
- Keep each file scannable — an agent should find any answer in under 5 seconds
- **NO HALLUCINATED NUMBERS**: Cite the exact command or file that produced the number, or write "[verify: X]". Never estimate.
- Every rule must be grounded in actual codebase evidence. If you didn't see it, don't write it.
- If a section lacks data, write "No [X] detected" — do not fill space with generic advice.
