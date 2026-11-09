import { copyFileSync, mkdirSync } from "node:fs";
import { TOOLS } from "../dist/tools.js";

for (const { folder } of TOOLS) {
    const destination = new URL(`../dist/prompts/${folder}/`, import.meta.url);
    mkdirSync(destination, { recursive: true });
    copyFileSync(
        new URL(`../../${folder}/GENERATE_AGENT.md`, import.meta.url),
        new URL("GENERATE_AGENT.md", destination),
    );
}
