import { inScope, JsonStore, scopeKey } from "./json-store.js";

export type MemoryType = "preference" | "solution" | "mistake";

export interface MemoryEntry {
    id: string;
    type: MemoryType;
    topic: string;
    content: string;
    tags: string[];
    projectScope: string | null; // null = global, otherwise project name/path
    createdAt: string;
    updatedAt: string;
    useCount: number;
    lastUsedAt: string;
    confidence: "low" | "medium" | "high";
}

export interface TwinMemoryData {
    version: number;
    developerName: string | null;
    memories: MemoryEntry[];
}

function generateId(): string {
    return Math.random().toString(36).substring(2, 10);
}

export class TwinMemory {
    private readonly store = new JsonStore<TwinMemoryData>("twin-memory.json", () => ({
        version: 1, developerName: null, memories: [],
    }));

    public memorize(
        type: MemoryType,
        topic: string,
        content: string,
        tags: string[] = [],
        projectScope: string | null = null,
        confidence: "low" | "medium" | "high" = "medium",
    ): MemoryEntry {
        const scope = scopeKey(projectScope);
        return this.store.update(data => {
            // Check if exact same content exists within this scope
            const existing = data.memories.find(
                (m) => m.type === type && m.topic === topic && m.content === content && scopeKey(m.projectScope) === scope
            );
            if (existing) return existing;

            const now = new Date().toISOString();
            const entry: MemoryEntry = {
                id: generateId(),
                type,
                topic,
                content,
                tags,
                projectScope: scope,
                createdAt: now,
                updatedAt: now,
                useCount: 0,
                lastUsedAt: now,
                confidence,
            };
            data.memories.push(entry);
            return entry;
        });
    }

    public updateMemory(id: string, updates: { topic?: string; content?: string; tags?: string[]; confidence?: "low" | "medium" | "high" }): MemoryEntry | null {
        return this.store.update(data => {
            const entry = data.memories.find((m) => m.id === id);
            if (!entry) return null;

            if (updates.topic !== undefined) entry.topic = updates.topic;
            if (updates.content !== undefined) entry.content = updates.content;
            if (updates.tags !== undefined) entry.tags = updates.tags;
            if (updates.confidence !== undefined) entry.confidence = updates.confidence;
            entry.updatedAt = new Date().toISOString();

            return entry;
        });
    }

    /** Bump use count — call this when a memory is surfaced to an agent. */
    public touch(ids: string[]): void {
        if (ids.length === 0) return;
        const selected = new Set(ids);
        const now = new Date().toISOString();
        this.store.update(data => {
            for (const entry of data.memories) {
                if (!selected.has(entry.id)) continue;
                entry.useCount++;
                entry.lastUsedAt = now;
            }
        });
    }

    /** Find memories that conflict with a proposed new memory (same topic, different content). */
    public findContradictions(type: MemoryType, topic: string, content: string, projectScope?: string): MemoryEntry[] {
        const topicLower = topic.toLowerCase();
        return this.getAll(projectScope).filter(
            (m) => m.type === type &&
                m.topic.toLowerCase() === topicLower &&
                m.content !== content
        );
    }

    /** Remove memories unused for more than `days` days. Returns count of pruned entries. */
    public pruneStale(days: number): number {
        return this.store.update(data => {
            const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
            const before = data.memories.length;
            data.memories = data.memories.filter(
                (m) => new Date(m.lastUsedAt).getTime() > cutoff || m.useCount > 5
            );
            return before - data.memories.length;
        });
    }

    public forget(id: string): boolean {
        return this.store.update(data => {
            const initialLength = data.memories.length;
            data.memories = data.memories.filter((m) => m.id !== id);
            return data.memories.length < initialLength;
        });
    }

    public search(query: string, projectScope?: string | null): MemoryEntry[] {
        const pool = this.getAll(projectScope);

        const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
        if (terms.length === 0) return pool;

        return pool
            .map((m) => {
                const text = `${m.type} ${m.topic} ${m.content} ${m.tags.join(" ")}`.toLowerCase();
                let score = terms.filter((term) => text.includes(term)).length;
                if (score === 0) return { entry: m, score };
                // Boost frequently-used memories
                score += Math.min(m.useCount * 0.1, 1);
                // Boost high-confidence memories
                if (m.confidence === "high") score += 0.5;
                return { entry: m, score };
            })
            .filter((m) => m.score > 0)
            .sort((a, b) => b.score - a.score)
            .map((m) => m.entry);
    }

    public getAll(projectScope?: string | null): MemoryEntry[] {
        const scope = scopeKey(projectScope);
        return this.store.read().memories.filter(memory => inScope(memory.projectScope, scope));
    }

    public getByTags(tags: string[], projectScope?: string): MemoryEntry[] {
        const tagsLower = tags.map(t => t.toLowerCase());
        return this.getAll(projectScope).filter(
            (m) => m.tags.some(t => tagsLower.includes(t.toLowerCase()))
        );
    }

    public setDeveloperName(name: string) {
        return this.store.update(data => {
            if (data.developerName !== name) {
                data.developerName = name;
            }
        });
    }

    public getDeveloperName(): string | null {
        return this.store.read().developerName;
    }
}

// Singleton instance
export const twinMemory = new TwinMemory();
