import { TOOLS, getPromptContent } from "./tools.js";

export interface SearchResult {
    tool: string;
    toolId: string;
    matchCount: number;
    sections: MatchedSection[];
}

export interface MatchedSection {
    heading: string;
    content: string;
    lineStart: number;
}

/**
 * Lightweight RAG: searches across all GENERATE_AGENT.md files for a query.
 * Splits content by markdown headings and returns sections containing the query.
 * No embeddings needed — keyword/substring matching with scoring.
 */
export function searchPrompts(query: string, maxResultsPerTool = 3): SearchResult[] {
    const terms = query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 2);

    if (terms.length === 0) {
        return [];
    }

    const results: SearchResult[] = [];

    for (const tool of TOOLS) {
        let content: string;
        try {
            content = getPromptContent(tool);
        } catch {
            continue;
        }

        const sections = splitIntoSections(content);
        const matched: MatchedSection[] = [];

        for (const section of sections) {
            const sectionText = (section.heading + "\n" + section.content).toLowerCase();
            const matchCount = terms.filter((term) => sectionText.includes(term)).length;

            if (matchCount > 0) {
                matched.push({
                    ...section,
                    content: truncate(section.content, 600),
                });
            }

            if (matched.length >= maxResultsPerTool) break;
        }

        if (matched.length > 0) {
            const totalMatches = matched.reduce((sum, s) => {
                const text = (s.heading + " " + s.content).toLowerCase();
                return sum + terms.filter((t) => text.includes(t)).length;
            }, 0);

            results.push({
                tool: tool.displayName,
                toolId: tool.id,
                matchCount: totalMatches,
                sections: matched,
            });
        }
    }

    // Sort by relevance (most matches first)
    results.sort((a, b) => b.matchCount - a.matchCount);

    return results;
}

function splitIntoSections(content: string): MatchedSection[] {
    const lines = content.split("\n");
    const sections: MatchedSection[] = [];

    let currentHeading = "(Introduction)";
    let currentLines: string[] = [];
    let currentStart = 1;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const headingMatch = line.match(/^#{1,4}\s+(.+)/);

        if (headingMatch) {
            if (currentLines.length > 0) {
                sections.push({
                    heading: currentHeading,
                    content: currentLines.join("\n").trim(),
                    lineStart: currentStart,
                });
            }
            currentHeading = headingMatch[1];
            currentLines = [];
            currentStart = i + 1;
        } else {
            currentLines.push(line);
        }
    }

    if (currentLines.length > 0) {
        sections.push({
            heading: currentHeading,
            content: currentLines.join("\n").trim(),
            lineStart: currentStart,
        });
    }

    return sections;
}

function truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "\n\n...(truncated, call get_prompt_<tool> for full content)";
}

export function formatSearchResults(results: SearchResult[], query: string): string {
    if (results.length === 0) {
        return `No results found for query: "${query}"\n\nAvailable tools: cursor, claudecode, cline, kiro, geminicli, aider, roocode, windsurf, codexcli, continue, githubcopilot\n\nTry a broader query or call get_prompt_<tool_id> directly to see the full prompt.`;
    }

    const lines: string[] = [
        `## Search Results for: "${query}"`,
        `Found matches in ${results.length} tool prompt(s)\n`,
    ];

    for (const result of results) {
        lines.push(`### ${result.tool} (${result.matchCount} match${result.matchCount !== 1 ? "es" : ""})`);
        lines.push(`> Call \`get_prompt_${result.toolId}\` for the complete prompt\n`);

        for (const section of result.sections) {
            lines.push(`#### Section: ${section.heading} (line ${section.lineStart})`);
            lines.push("```");
            lines.push(section.content);
            lines.push("```\n");
        }
    }

    return lines.join("\n");
}
