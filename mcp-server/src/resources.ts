import { TOOLS } from "./tools.js";

export interface ToolManifest {
    version: string;
    totalTools: number;
    tools: ToolEntry[];
}

export interface ToolEntry {
    id: string;
    mcpToolName: string;
    displayName: string;
    outputFormat: string;
    outputFiles: string[];
    description: string;
}

export function buildManifest(): ToolManifest {
    return {
        version: "1.0.0",
        totalTools: TOOLS.length,
        tools: TOOLS.map((t) => ({
            id: t.id,
            mcpToolName: t.name,
            displayName: t.displayName,
            outputFormat: t.outputFormat,
            outputFiles: t.outputFiles,
            description: t.description,
        })),
    };
}

export const MANIFEST_URI = "gyo-agents://tools";
export const MANIFEST_NAME = "GYO-AGENTS Tool Manifest";
export const MANIFEST_DESCRIPTION =
    "JSON manifest listing all 11 supported AI coding tools, their MCP tool names, and the output files each prompt generates.";
