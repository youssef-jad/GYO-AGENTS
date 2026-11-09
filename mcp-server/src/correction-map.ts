import { inScope, JsonStore, scopeKey } from "./json-store.js";

// ═══════════════════════════════════════════════════════════════════════════════
// Correction Map — Pair Programming Memory
//
// Every time a developer corrects an agent's output, that's a learning signal.
// This module captures: "I suggested X, the developer changed it to Y."
// Over time, it builds a personal correction map so the agent stops making
// the same mistakes with THIS specific developer.
//
// This is the difference between a profile and a relationship.
// ═══════════════════════════════════════════════════════════════════════════════

export type CorrectionCategory =
    | "naming"        // renamed a variable/function/class
    | "style"         // reformatted, reordered, restructured
    | "logic"         // changed the actual behavior
    | "pattern"       // used a different design pattern
    | "removal"       // deleted code the agent added
    | "addition"      // added code the agent missed
    | "simplification"// simplified what the agent over-engineered
    | "hardening"     // added error handling, validation, edge cases
    | "other";

export interface Correction {
    id: string;
    date: string;
    category: CorrectionCategory;
    context: string;           // What was the agent trying to do
    agentSuggested: string;    // What the agent produced
    developerChose: string;    // What the developer changed it to
    lesson: string;            // The inferred rule (auto-generated or manual)
    language: string;          // e.g. "typescript", "python", "php"
    projectScope: string | null;
    occurrences: number;       // How many times this same correction pattern appeared
    lastOccurrence: string;
}

export interface CorrectionPattern {
    id: string;
    category: CorrectionCategory;
    rule: string;              // The generalized rule derived from multiple corrections
    examples: Array<{ suggested: string; corrected: string }>;
    confidence: number;        // 0-1, increases with more corrections of same type
    correctionIds: string[];   // Which corrections contributed to this pattern
    createdAt: string;
    updatedAt: string;
}

export interface CorrectionMapData {
    version: number;
    corrections: Correction[];
    patterns: CorrectionPattern[];
}

function generateId(): string {
    return "cor-" + Math.random().toString(36).substring(2, 10);
}

function patternId(): string {
    return "pat-" + Math.random().toString(36).substring(2, 10);
}

export class CorrectionMap {
    private readonly store = new JsonStore<CorrectionMapData>("correction-map.json", () => ({
        version: 1, corrections: [], patterns: [],
    }));

    /**
     * Record a correction — the developer changed what the agent suggested.
     * Automatically checks for similar past corrections and strengthens patterns.
     */
    public recordCorrection(input: {
        category: CorrectionCategory;
        context: string;
        agentSuggested: string;
        developerChose: string;
        lesson: string;
        language?: string;
        projectScope?: string | null;
    }): { correction: Correction; patternMatch: CorrectionPattern | null } {
        return this.store.update(data => {
            const now = new Date().toISOString();

            const scope = scopeKey(input.projectScope);
            const language = input.language ?? "unknown";
            const sameContext = data.corrections.filter(c =>
                c.category === input.category && c.language === language && scopeKey(c.projectScope) === scope
            );
            const similar = this.findSimilarCorrection(sameContext, input.lesson);
            if (similar) {
                similar.occurrences++;
                similar.lastOccurrence = now;
                const pattern = this.reinforcePattern(data, sameContext, similar);
                return { correction: similar, patternMatch: pattern };
            }

            const correction: Correction = {
                id: generateId(),
                date: now,
                category: input.category,
                context: input.context,
                agentSuggested: input.agentSuggested,
                developerChose: input.developerChose,
                lesson: input.lesson,
                language,
                projectScope: scope,
                occurrences: 1,
                lastOccurrence: now,
            };

            data.corrections.push(correction);

            // Try to match or create a pattern
            const pattern = this.reinforcePattern(data, [...sameContext, correction], correction);

            return { correction, patternMatch: pattern };
        });
    }

    /**
     * Find a correction with the same category and similar lesson text.
     */
    private findSimilarCorrection(corrections: Correction[], lesson: string): Correction | null {
        const lessonTerms = lesson.toLowerCase().split(/\s+/).filter(t => t.length > 3);
        if (lessonTerms.length === 0) return null;

        for (const c of corrections) {
            const cTerms = c.lesson.toLowerCase();
            const overlap = lessonTerms.filter(t => cTerms.includes(t)).length;
            if (overlap / lessonTerms.length > 0.6) return c;
        }
        return null;
    }

    /**
     * Look for patterns: if multiple corrections share a category and similar lessons,
     * create or strengthen a generalized pattern.
     */
    private reinforcePattern(data: CorrectionMapData, sameContext: Correction[], correction: Correction): CorrectionPattern | null {
        const correctionIds = new Set(sameContext.map(c => c.id));

        // Check if an existing pattern covers this correction
        for (const pattern of data.patterns) {
            if (!pattern.correctionIds.length || !pattern.correctionIds.every(id => correctionIds.has(id))) continue;
            const patternTerms = pattern.rule.toLowerCase().split(/\s+/).filter(t => t.length > 3);
            const lessonTerms = correction.lesson.toLowerCase();
            const overlap = patternTerms.filter(t => lessonTerms.includes(t)).length;

            if (overlap / Math.max(patternTerms.length, 1) > 0.4) {
                // Reinforce existing pattern
                if (!pattern.correctionIds.includes(correction.id)) {
                    pattern.correctionIds.push(correction.id);
                }
                pattern.confidence = Math.min(1, pattern.confidence + 0.15);
                pattern.updatedAt = new Date().toISOString();
                // Add example if we have room
                if (pattern.examples.length < 5) {
                    pattern.examples.push({
                        suggested: correction.agentSuggested.slice(0, 200),
                        corrected: correction.developerChose.slice(0, 200),
                    });
                }
                return pattern;
            }
        }

        // A repeated lesson is evidence for a pattern in this context.
        if (correction.occurrences >= 2) {
            const newPattern: CorrectionPattern = {
                id: patternId(),
                category: correction.category,
                rule: correction.lesson,
                examples: [{
                    suggested: correction.agentSuggested.slice(0, 200),
                    corrected: correction.developerChose.slice(0, 200),
                }],
                confidence: 0.3,
                correctionIds: [correction.id],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            data.patterns.push(newPattern);
            return newPattern;
        }

        return null;
    }

    /** Get all active patterns, sorted by confidence. */
    public getPatterns(projectScope?: string, language?: string): CorrectionPattern[] {
        return this.getAll(projectScope, language).patterns.sort((a, b) => b.confidence - a.confidence);
    }

    /** Get corrections for a specific category. */
    public getByCategory(category: CorrectionCategory, projectScope?: string): Correction[] {
        return this.getAll(projectScope).corrections.filter(c => c.category === category);
    }

    /** Search corrections and patterns. */
    public search(query: string, projectScope?: string): { corrections: Correction[]; patterns: CorrectionPattern[] } {
        const data = this.getAll(projectScope);
        const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
        if (terms.length === 0) {
            return { corrections: data.corrections, patterns: data.patterns };
        }

        const corrections = data.corrections.filter(c => {
            const text = `${c.category} ${c.context} ${c.lesson} ${c.agentSuggested} ${c.developerChose}`.toLowerCase();
            return terms.some(t => text.includes(t));
        });

        const patterns = data.patterns.filter(p => {
            const text = `${p.category} ${p.rule}`.toLowerCase();
            return terms.some(t => text.includes(t));
        });

        return { corrections, patterns };
    }

    /** Remove a correction by ID. */
    public remove(id: string): boolean {
        return this.store.update(data => {
            const before = data.corrections.length;
            data.corrections = data.corrections.filter(c => c.id !== id);
            // A pattern can still contain text from a removed correction.
            data.patterns = data.patterns.filter(p => !p.correctionIds.includes(id));
            return data.corrections.length < before;
        });
    }

    public getAll(projectScope?: string, language?: string): CorrectionMapData {
        const data = this.store.read();
        const scope = scopeKey(projectScope);
        const corrections = data.corrections.filter(c =>
            inScope(c.projectScope, scope) && (!language || c.language === "unknown" || c.language === language)
        );
        const visible = new Set(corrections.map(c => c.id));
        const patterns = data.patterns.filter(p => p.correctionIds.length > 0 && p.correctionIds.every(id => visible.has(id)));
        return { version: data.version, corrections, patterns };
    }

    public getStats(projectScope?: string): { totalCorrections: number; totalPatterns: number; topCategories: Array<{ category: string; count: number }> } {
        const data = this.getAll(projectScope);
        const catMap = new Map<string, number>();
        for (const c of data.corrections) {
            catMap.set(c.category, (catMap.get(c.category) ?? 0) + c.occurrences);
        }
        const topCategories = [...catMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([category, count]) => ({ category, count }));

        return {
            totalCorrections: data.corrections.length,
            totalPatterns: data.patterns.length,
            topCategories,
        };
    }
}

// Singleton
export const correctionMap = new CorrectionMap();


// ─── Formatting ───────────────────────────────────────────────────────────────

export function formatCorrectionPatterns(patterns: CorrectionPattern[]): string {
    if (patterns.length === 0) return "_No correction patterns learned yet. Record corrections to build your pair programming memory._";

    return patterns.map(p => {
        const bar = "█".repeat(Math.round(p.confidence * 10)) + "░".repeat(10 - Math.round(p.confidence * 10));
        const lines = [
            `### \`${p.category}\` [${bar}] ${Math.round(p.confidence * 100)}%`,
            `**Rule:** ${p.rule}`,
            `**Based on:** ${p.correctionIds.length} correction(s)`,
        ];
        if (p.examples.length > 0) {
            lines.push("", "**Examples:**");
            for (const ex of p.examples.slice(0, 3)) {
                lines.push(`- ❌ Agent: \`${ex.suggested}\``);
                lines.push(`  ✅ Developer: \`${ex.corrected}\``);
            }
        }
        return lines.join("\n");
    }).join("\n\n---\n\n");
}

export function formatCorrectionStats(stats: ReturnType<CorrectionMap["getStats"]>): string {
    const lines = [
        `**Total corrections recorded:** ${stats.totalCorrections}`,
        `**Patterns learned:** ${stats.totalPatterns}`,
    ];
    if (stats.topCategories.length > 0) {
        lines.push("", "**Most corrected areas:**");
        for (const cat of stats.topCategories) {
            lines.push(`- ${cat.category}: ${cat.count} correction(s)`);
        }
    }
    return lines.join("\n");
}
