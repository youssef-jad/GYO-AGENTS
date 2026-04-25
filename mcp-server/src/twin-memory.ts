import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

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

const MEMORY_DIR_NAME = ".gyo-agents";
const MEMORY_FILE_NAME = "twin-memory.json";

function getMemoryFilePath(): string {
    const dir = join(homedir(), MEMORY_DIR_NAME);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    return join(dir, MEMORY_FILE_NAME);
}

function generateId(): string {
    return Math.random().toString(36).substring(2, 10);
}

export class TwinMemory {
    private data: TwinMemoryData;
    private filePath: string;

    constructor() {
        this.filePath = getMemoryFilePath();
        this.data = this.loadMemory();
    }

    private loadMemory(): TwinMemoryData {
        if (!existsSync(this.filePath)) {
            return { version: 1, developerName: null, memories: [] };
        }
        try {
            const raw = readFileSync(this.filePath, "utf-8");
            return JSON.parse(raw) as TwinMemoryData;
        } catch {
            return { version: 1, developerName: null, memories: [] };
        }
    }

    private saveMemory() {
        writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
    }

    public memorize(
        type: MemoryType,
        topic: string,
        content: string,
        tags: string[] = [],
        projectScope: string | null = null,
        confidence: "low" | "medium" | "high" = "medium",
    ): MemoryEntry {
        // Check if exact same content exists
        const existing = this.data.memories.find(
            (m) => m.type === type && m.topic === topic && m.content === content
        );
        if (existing) return existing;

        const now = new Date().toISOString();
        const entry: MemoryEntry = {
            id: generateId(),
            type,
            topic,
            content,
            tags,
            projectScope,
            createdAt: now,
            updatedAt: now,
            useCount: 0,
            lastUsedAt: now,
            confidence,
        };
        this.data.memories.push(entry);
        this.saveMemory();
        return entry;
    }

    public updateMemory(id: string, updates: { topic?: string; content?: string; tags?: string[]; confidence?: "low" | "medium" | "high" }): MemoryEntry | null {
        const entry = this.data.memories.find((m) => m.id === id);
        if (!entry) return null;

        if (updates.topic !== undefined) entry.topic = updates.topic;
        if (updates.content !== undefined) entry.content = updates.content;
        if (updates.tags !== undefined) entry.tags = updates.tags;
        if (updates.confidence !== undefined) entry.confidence = updates.confidence;
        entry.updatedAt = new Date().toISOString();

        this.saveMemory();
        return entry;
    }

    /** Bump use count — call this when a memory is surfaced to an agent. */
    public touch(id: string): void {
        const entry = this.data.memories.find((m) => m.id === id);
        if (entry) {
            entry.useCount++;
            entry.lastUsedAt = new Date().toISOString();
            this.saveMemory();
        }
    }

    /** Find memories that conflict with a proposed new memory (same topic, different content). */
    public findContradictions(type: MemoryType, topic: string, content: string): MemoryEntry[] {
        const topicLower = topic.toLowerCase();
        return this.data.memories.filter(
            (m) => m.type === type &&
                m.topic.toLowerCase() === topicLower &&
                m.content !== content
        );
    }

    /** Remove memories unused for more than `days` days. Returns count of pruned entries. */
    public pruneStale(days: number): number {
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        const before = this.data.memories.length;
        this.data.memories = this.data.memories.filter(
            (m) => new Date(m.lastUsedAt).getTime() > cutoff || m.useCount > 5
        );
        const pruned = before - this.data.memories.length;
        if (pruned > 0) this.saveMemory();
        return pruned;
    }

    public forget(id: string): boolean {
        const initialLength = this.data.memories.length;
        this.data.memories = this.data.memories.filter((m) => m.id !== id);
        if (this.data.memories.length < initialLength) {
            this.saveMemory();
            return true;
        }
        return false;
    }

    public search(query: string, projectScope?: string | null): MemoryEntry[] {
        let pool = this.data.memories;

        // Filter by project scope if provided (includes global memories too)
        if (projectScope) {
            pool = pool.filter(
                (m) => m.projectScope === null || m.projectScope === projectScope
            );
        }

        const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
        if (terms.length === 0) return pool;

        return pool
            .map((m) => {
                const text = `${m.type} ${m.topic} ${m.content} ${m.tags.join(" ")}`.toLowerCase();
                let score = terms.filter((term) => text.includes(term)).length;
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
        if (projectScope) {
            return this.data.memories.filter(
                (m) => m.projectScope === null || m.projectScope === projectScope
            );
        }
        return this.data.memories;
    }

    public getByTags(tags: string[]): MemoryEntry[] {
        const tagsLower = tags.map(t => t.toLowerCase());
        return this.data.memories.filter(
            (m) => m.tags.some(t => tagsLower.includes(t.toLowerCase()))
        );
    }

    public setDeveloperName(name: string) {
        if (this.data.developerName !== name) {
            this.data.developerName = name;
            this.saveMemory();
        }
    }

    public getDeveloperName(): string | null {
        return this.data.developerName;
    }
}

// Singleton instance
export const twinMemory = new TwinMemory();
