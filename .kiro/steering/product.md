# GYO-AGENTS — Generate Your Own AGENTS

GYO-AGENTS is an MCP server and prompt library that generates AI coding agent configuration files for any project. It supports 11 AI tools (Cursor, Claude Code, Cline, Kiro, Windsurf, Gemini CLI, Aider, RooCode, Codex CLI, Continue, GitHub Copilot).

Each tool has a `GENERATE_AGENT.md` prompt template in its own folder at the repo root. The MCP server reads these templates and exposes them as callable tools so any MCP-compatible AI agent can generate native config files without copy-pasting.

Key capabilities:
- Prompt generation for 11 AI coding tools via `get_prompt_*` MCP tools
- Live git history analysis to extract developer coding style
- Domain context scanning to find modules/files by business domain
- Digital Twin memory — persistent cross-project developer preferences stored at `~/.gyo-agents/twin-memory.json`
- Convention enforcement validators (API response format, cache usage patterns)
- RAG-style keyword search across all prompt templates
- One-shot orchestration via `generate_full_agent_context` that combines git analysis, domain scanning, and tool recommendations
