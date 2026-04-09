# Prompt: Generate Your Own AGENTS.md

Copy this entire prompt into any AI coding agent (Kiro, Claude Code, Cursor, Copilot, Codex, etc.) while inside your project workspace. It will analyze your codebase and git history to generate a powerful, project-specific AGENTS.md file.

---

## The Prompt

```
I need you to generate a comprehensive AGENTS.md file for this project. This file will instruct AI coding agents on how to work in this codebase correctly. Follow these steps:

## Step 1: Analyze the Project

Explore the codebase and gather:
- Language, framework, and major dependency versions (from package.json, composer.json, Gemfile, go.mod, requirements.txt, etc.)
- Directory structure and code organization patterns (where do models, controllers, services, tests live?)
- Module/package count and naming conventions
- Design patterns in use (MVC, service layer, repository pattern, CQRS, DDD, etc.) — count how many directories use each pattern to know what's dominant vs. rare
- How tests are organized, what base classes/traits are used, what test runner and config exist
- CI/CD configuration (what checks run on PR?)
- Docker/container setup (docker-compose files, Makefiles, scripts)
- Linting/formatting tools and their configs
- Database setup (connections, migrations location, ORM patterns)
- API response patterns (how are responses serialized?)
- Caching patterns (what cache driver, what TTL conventions, key naming)
- Event/messaging patterns (event bus, queues, Kafka, etc.)

## Step 2: Analyze Git History for Persona

Run these git commands to study my coding style:

1. `git config user.name` — identify me
2. `git log --all --author="<my name>" --format="%s" -2000` — get my last 2000 commit messages
3. Filter out merge commits and automated messages
4. Analyze:
   - Commit message format (conventional commits? ticket prefixes? terse vs descriptive?)
   - Most common action verbs (add, fix, refactor, etc.) with counts
   - Domain keywords frequency — what parts of the codebase do I touch most?
   - Style evolution over time (compare oldest vs newest commits)
   - Ticket/issue prefix patterns (Jira, Linear, GitHub issues?)
   - How many unique tickets I've worked on
   - How many PRs I've merged (grep for "Merge pull request")
   - Date range of my contributions

5. If I provide a GitHub/GitLab profile URL, fetch it and extract:
   - Title/role, years of experience
   - Technical skills and specializations
   - Notable achievements or metrics

## Step 3: Analyze Performance Patterns

Search the codebase for:
- Eager loading patterns (`->with()`, `include`, `preload`, joins)
- Pagination patterns
- Caching usage (`Cache::remember`, Redis patterns, memoization)
- Batch processing (`chunk`, `cursor`, `batch`, streaming)
- Query optimization (`select` specific columns, `exists` checks, indexed queries)
- N+1 indicators (relationship access in loops/serializers without eager loading)
- Response shaping (presenters, serializers, transformers, DTOs)

## Step 4: Generate the AGENTS.md

Structure the file with these exact sections:

### 1. Header
One-line project description with language, framework, version, and scale (module/package count).

### 2. Architecture at a Glance
- ASCII tree of top-level directories with purpose annotations
- Note any super-modules or monorepo structure
- Show the anatomy of a typical module/package with which subdirectories are common vs rare (include counts)

### 3. Docker / Dev Environment
- How to run commands (container exec, Makefile shortcuts, scripts)
- Services table with ports and stack info
- Keep the Makefile shortcuts as the preferred method if one exists

### 4. Essential Commands
- Table of common tasks (test, lint, format, analyze, migrate, etc.)
- Note any flags that are important (disable debugger, memory limits, etc.)
- CI info (how many test suites, parallel groups, which branches)

### 5. Guardrails — ALWAYS / NEVER / WATCH OUT
This is the most important section. Write it as three subsections:

**ALWAYS**: Things the agent must do on every change. Derived from the dominant patterns in the codebase. Examples:
- Which test trait/setup to use
- Which DI pattern to follow
- Which response format to use
- Which validation approach to use
- Which linting tool to run

**NEVER**: Things that will break the build or violate project conventions. Be specific. Examples:
- Don't use pattern X (we use Y instead)
- Don't put logic in layer X (it belongs in layer Y)
- Don't skip the linter (CI will fail)
- Don't use library X (we use Y)

**WATCH OUT**: Gotchas and edge cases unique to this project. Examples:
- Inconsistent naming conventions that coexist
- Feature flags that gate functionality
- Database split configurations
- Modules with non-standard structure

### 6. Decision Trees
Write 3 decision trees as code blocks:
- "Where does this code go?" — routing new code to the right directory
- "How do I add a new endpoint/feature?" — step-by-step checklist
- "How do I write a test?" — which base class, traits, naming convention

### 7. Performance & Query Standards
Based on actual patterns found in the codebase:
- N+1 prevention rules with specific examples from the project
- Query optimization patterns actually in use
- Caching strategy with real TTL values and key formats from the code
- API response performance rules
- Batch operation conventions (chunk sizes, cursor vs chunk)
- Database rules (indexing, transactions, query builder vs ORM)

### 8. Rules References
Link to any existing rule files, style guides, or documentation in the repo.

### 9. Persona — Match This Developer's Style
Write in first person ("How I write commits", "How I write code"). Include:
- **How I Write Commits**: format, prefixes, granularity, with real examples from my history
- **How My Style Evolved**: compare early vs current commit style with real examples. Tell the agent to match the CURRENT style.
- **How I Write Code**: specific patterns I enforce (null safety, typing, naming, etc.)
- **What I Work On**: domain expertise table with frequency counts from commit keyword analysis
- **Biggest Features**: top 5 tickets by commit count with one-line descriptions
- **How I Review**: what I catch in code review
- **My Engineering Philosophy**: 4-6 bullet points distilled from my commit patterns

## Formatting Rules

- Use tables for structured data (services, commands, domain expertise)
- Use code blocks for decision trees and directory structures
- Use bullet points for rules and guidelines
- Keep it scannable — an agent should find any answer in under 5 seconds
- Every rule should be grounded in actual codebase evidence, not generic advice
- Include real numbers (file counts, commit counts, TTL values) — specificity builds trust
- Write the persona section in first person to maximize style matching
- Total file should be 200-350 lines — comprehensive but not bloated
```

---

## Tips for Best Results

1. Run this from inside your project root so the agent has access to the full codebase
2. If you have a GitHub/GitLab profile, add: "Also check my profile: https://github.com/yourname"
3. If you have existing rule files (.cursorrules, .claude/rules/, .editorconfig), mention them so the agent links to them
4. After generation, review the ALWAYS/NEVER section carefully — these are the highest-impact guardrails
5. Re-run every few months as your codebase and style evolve
