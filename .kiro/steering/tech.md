# Tech Stack & Build

## Language & Runtime
- TypeScript (strict mode, ES2022 target)
- Node.js >= 18
- ES Modules (`"type": "module"` in package.json)

## Core Dependencies
- `@modelcontextprotocol/sdk` ^1.10.2 — MCP server framework (stdio transport)
- `zod` ^3.23.0 — Runtime schema validation for tool inputs

## Dev Dependencies
- `typescript` ^5.5.0 — Compiler
- `tsx` ^4.0.0 — TypeScript execution without build step (dev mode)
- `@types/node` ^22.0.0

## Build & Compilation
- TypeScript compiles from `mcp-server/src/` → `mcp-server/dist/`
- tsconfig: `module: Node16`, `moduleResolution: Node16`, strict mode enabled
- Outputs: `.js`, `.d.ts`, `.d.ts.map`, `.js.map` (source maps + declarations)
- `dist/` and `node_modules/` are gitignored

## Commands

All commands run from the `mcp-server/` directory:

| Task | Command |
|------|---------|
| Install deps | `npm install` |
| Build | `npm run build` (runs `tsc`) |
| Dev mode | `npm run dev` (runs `tsx src/index.ts`) |
| Start built server | `npm run start` (runs `node dist/index.js`) |
| MCP Inspector | `npm run inspect` (opens browser UI at localhost:5173) |

## No Test Framework
There is no test suite configured. No linter or formatter config files exist in the repo.

## Import Conventions
- All local imports use `.js` extension (required by Node16 module resolution)
- Example: `import { TOOLS } from "./tools.js"`
- Uses `import.meta.url` / `fileURLToPath` for `__dirname` equivalent in ESM
