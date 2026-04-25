import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ═══════════════════════════════════════════════════════════════════════════════
// Decision Journal — Why you chose A over B
//
// Captures architectural and technical decisions with full context:
// what was considered, what was chosen, and WHY.
// When an agent faces a similar decision, it can check if the developer
// already has a stance — turning past reasoning into future guidance.
// ═══════════════════════════════════════════════════════════════════════════════

export interface DecisionOption {
    name: string;
    prosConsidered: string[];
    consConsidered: string[];
}

export interface Decision {
    id: string;
    date: string;
    updatedAt: string;
    context: string;           // What situation triggered this decision
    domain: string;            // e.g. "database", "auth", "state-management", "testing"
    options: DecisionOption[]; // What was considered
    chosen: string;            // Which option was picked
    reasoning: string;         // WHY — the most important field
    consequences: string[];    // Known tradeoffs accepted
    projectScope: string | null; // null = applies everywhere
    tags: string[];
    status: "active" | "superseded" | "revisit";
    supersededBy: string | null; // ID of the decision that replaced this one
}

export interface DecisionJournalData {
    version: number;
    decisions: Decision[];
}

const JOURNAL_FILE = "decision-journal.json";
const JOURNAL_DIR = join(homedir(), ".gyo-agents");

function getJournalPath(): string {
    if (!existsSync(JOURNAL_DIR)) {
        mkdirSync(JOURNAL_DIR, { recursive: true });
    }
    return join(JOURNAL_DIR, JOURNAL_FILE);
}

function generateId(): string {
    return "dec-" + Math.random().toString(36).substring(2, 10);
}

export class DecisionJournal {
    private data: DecisionJournalData;
    private filePath: string;

    constructor() {
        this.filePath = getJournalPath();
        this.data = this.load();
    }

    private load(): DecisionJournalData {
        if (!existsSync(this.filePath)) {
            return { version: 1, decisions: [] };
        }
        try {
            return JSON.parse(readFileSync(this.filePath, "utf-8")) as DecisionJournalData;
        } catch {
            return { version: 1, decisions: [] };
        }
    }

    private save(): void {
        writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
    }

    public record(input: {
        context: string;
        domain: string;
        options: DecisionOption[];
        chosen: string;
        reasoning: string;
        consequences?: string[];
        projectScope?: string | null;
        tags?: string[];
    }): Decision {
        const now = new Date().toISOString();
        const decision: Decision = {
            id: generateId(),
            date: now,
            updatedAt: now,
            context: input.context,
            domain: input.domain,
            options: input.options,
            chosen: input.chosen,
            reasoning: input.reasoning,
            consequences: input.consequences ?? [],
            projectScope: input.projectScope ?? null,
            tags: input.tags ?? [],
            status: "active",
            supersededBy: null,
        };
        this.data.decisions.push(decision);
        this.save();
        return decision;
    }

    public supersede(oldId: string, newId: string): boolean {
        const old = this.data.decisions.find(d => d.id === oldId);
        if (!old) return false;
        old.status = "superseded";
        old.supersededBy = newId;
        old.updatedAt = new Date().toISOString();
        this.save();
        return true;
    }

    public markRevisit(id: string): boolean {
        const d = this.data.decisions.find(d => d.id === id);
        if (!d) return false;
        d.status = "revisit";
        d.updatedAt = new Date().toISOString();
        this.save();
        return true;
    }

    public remove(id: string): boolean {
        const before = this.data.decisions.length;
        this.data.decisions = this.data.decisions.filter(d => d.id !== id);
        if (this.data.decisions.length < before) {
            this.save();
            return true;
        }
        return false;
    }

    /** Search decisions by keyword, domain, or tag. */
    public search(query: string, domain?: string, projectScope?: string): Decision[] {
        let pool = this.data.decisions.filter(d => d.status === "active");

        if (domain) {
            pool = pool.filter(d => d.domain.toLowerCase() === domain.toLowerCase());
        }
        if (projectScope) {
            pool = pool.filter(d => d.projectScope === null || d.projectScope === projectScope);
        }

        if (!query.trim()) return pool;

        const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
        return pool
            .map(d => {
                const text = `${d.context} ${d.domain} ${d.chosen} ${d.reasoning} ${d.tags.join(" ")} ${d.options.map(o => o.name).join(" ")}`.toLowerCase();
                const score = terms.filter(t => text.includes(t)).length;
                return { decision: d, score };
            })
            .filter(r => r.score > 0)
            .sort((a, b) => b.score - a.score)
            .map(r => r.decision);
    }

    /** Find decisions that might be relevant to a new decision context. */
    public findRelated(context: string, domain: string): Decision[] {
        const contextTerms = context.toLowerCase().split(/\s+/).filter(t => t.length > 3);
        return this.data.decisions
            .filter(d => d.status === "active")
            .map(d => {
                let score = 0;
                if (d.domain.toLowerCase() === domain.toLowerCase()) score += 3;
                const dText = `${d.context} ${d.reasoning}`.toLowerCase();
                score += contextTerms.filter(t => dText.includes(t)).length;
                return { decision: d, score };
            })
            .filter(r => r.score > 1)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
            .map(r => r.decision);
    }

    public getAll(): Decision[] {
        return this.data.decisions;
    }

    public getById(id: string): Decision | undefined {
        return this.data.decisions.find(d => d.id === id);
    }
}

// Singleton
export const decisionJournal = new DecisionJournal();

// ─── Formatting ───────────────────────────────────────────────────────────────

export function formatDecision(d: Decision): string {
    const statusIcon = d.status === "active" ? "✅" : d.status === "superseded" ? "🔄" : "🔍";
    const lines = [
        `### ${statusIcon} ${d.chosen} (${d.domain})`,
        `**ID:** \`${d.id}\` · **Date:** ${d.date.split("T")[0]} · **Status:** ${d.status}`,
        d.projectScope ? `**Project:** ${d.projectScope}` : "**Scope:** Global",
        d.tags.length > 0 ? `**Tags:** ${d.tags.join(", ")}` : "",
        "",
        `**Context:** ${d.context}`,
        "",
        "**Options Considered:**",
        ...d.options.map(o => {
            const pros = o.prosConsidered.length > 0 ? `  ✓ ${o.prosConsidered.join(", ")}` : "";
            const cons = o.consConsidered.length > 0 ? `  ✗ ${o.consConsidered.join(", ")}` : "";
            const marker = o.name === d.chosen ? " ← **CHOSEN**" : "";
            return `- **${o.name}**${marker}\n${pros}\n${cons}`.trim();
        }),
        "",
        `**Reasoning:** ${d.reasoning}`,
    ];

    if (d.consequences.length > 0) {
        lines.push("", "**Accepted Tradeoffs:**");
        d.consequences.forEach(c => lines.push(`- ${c}`));
    }

    if (d.supersededBy) {
        lines.push("", `_Superseded by decision \`${d.supersededBy}\`_`);
    }

    return lines.filter(l => l !== "").join("\n");
}

export function formatDecisionList(decisions: Decision[]): string {
    if (decisions.length === 0) return "No decisions found.";
    return decisions.map(formatDecision).join("\n\n---\n\n");
}
