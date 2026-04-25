# Digital Twin — Cross-IDE Proactive Integration

The Digital Twin works with ANY MCP-compatible AI tool. Here's how to make it proactive in each IDE.

## Universal: The System Prompt Approach

The simplest way to make any agent Twin-aware. Works everywhere.

### Option A: Call the tool at session start
Tell your agent (in its rules/instructions):
```
At the start of every session, call `get_twin_system_prompt()` from the gyo-agents MCP server
and follow all rules in the response for the entire session.
```

### Option B: Load the resource
MCP clients that support resources can auto-load:
```
gyo-agents://twin-system-prompt
```
This returns a compact markdown document with all behavioral rules.

---

## Cursor (.cursor/rules/)

Create `.cursor/rules/digital-twin.mdc`:
```yaml
---
description: Digital Twin proactive behavior — loads developer preferences and self-reviews code
alwaysApply: true
---
```
Then add this content after the front-matter:

```markdown
## Digital Twin Integration

At the START of every conversation:
- Call `get_twin_system_prompt()` and follow all rules in the response.

BEFORE writing or modifying code:
- Check if the task involves an architectural choice. If so, call `search_decisions` first.

AFTER writing code:
- Call `review_as_developer` with the code you wrote, the language, and context.
- If issues are found, fix them before presenting the code.

When the user EDITS your output:
- Call `record_correction` with what you wrote vs what they changed.

At the END of a conversation:
- Call `memorize` for any new preferences you noticed.
- Call `record_decision` for any architectural choices made.
```

## Claude Code (CLAUDE.md)

Add to your root `CLAUDE.md`:

```markdown
## Digital Twin

This project uses the GYO-AGENTS Digital Twin. Follow these rules:

1. At session start, call `get_twin_system_prompt()` and follow all returned rules.
2. Before writing code, call `search_decisions` if the task involves choosing between approaches.
3. After writing code, call `review_as_developer` to self-check against developer preferences.
4. If the developer edits your output, call `record_correction` to learn from it.
5. At session end, call `memorize` for new preferences and `record_decision` for choices made.
```

## Cline / RooCode

Add to `.clinerules` or `.roo/rules/digital-twin.md`:

```markdown
# Digital Twin Rules

Always call `get_twin_system_prompt()` at the start of each task and follow the returned rules.

After every code write:
- Call `review_as_developer(code, language, context)` to self-check.
- Fix any flagged issues before showing the result.

When the user modifies your code:
- Call `record_correction(category, context, agentSuggested, developerChose, lesson)`.

Before architectural choices:
- Call `search_decisions(query)` to check for existing decisions.
```

## Windsurf (.windsurfrules)

Add to `.windsurfrules`:

```markdown
## Digital Twin

Call `get_twin_system_prompt()` at session start. Follow all returned rules.
After writing code, call `review_as_developer` to self-check.
When the user edits your output, call `record_correction` to learn.
Before architectural choices, call `search_decisions` to check for prior decisions.
```

## GitHub Copilot (.github/copilot-instructions.md)

Add to `.github/copilot-instructions.md`:

```markdown
## Digital Twin Integration

If the gyo-agents MCP server is connected:
1. Call `get_twin_system_prompt()` at session start and follow all rules.
2. Call `review_as_developer` after writing code to self-check.
3. Call `record_correction` when the developer edits your output.
4. Call `search_decisions` before making architectural choices.
```

---

## How It Gets Smarter Over Time

```
Session 1: Twin is empty. Agent writes code normally.
           Developer edits output → agent records corrections.
           Session ends → agent records preferences.

Session 2: Twin has a few corrections and preferences.
           get_twin_system_prompt() returns basic rules.
           Agent avoids the mistakes from Session 1.

Session 10: Twin has dozens of corrections, patterns emerge.
            Agent self-reviews code and catches issues before showing them.
            Developer barely needs to edit anything.

Session 50: Twin has a rich behavioral DNA, decision journal, correction map.
            Agent writes code that feels like the developer wrote it themselves.
```
