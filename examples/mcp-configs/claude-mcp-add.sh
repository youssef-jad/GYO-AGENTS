#!/bin/bash
# Run this from anywhere — adds gyo-agents as an MCP server to Claude Code
claude mcp add gyo-agents -- node /ABSOLUTE/PATH/TO/GYO-AGENTS/mcp-server/dist/index.js

# Verify it was added:
claude mcp list
