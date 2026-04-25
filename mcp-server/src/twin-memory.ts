import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export type MemoryType = "preference" | "solution" | "mistake";

export interface MemoryEntry {
    id: string;
    type: MemoryType;
    topic: string;
    content: string;
    createdAt: string;
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

    public memorize(type: MemoryType, topic: string, content: string): MemoryEntry {
        // Check if exact same content exists
        const existing = this.data.memories.find(
            (m) => m.type === type && m.topic === topic && m.content === content
        );
        if (existing) return existing;

        const entry: MemoryEntry = {
            id: generateId(),
            type,
            topic,
            content,
            createdAt: new Date().toISOString(),
        };
        this.data.memories.push(entry);
        this.saveMemory();
        return entry;
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

    public search(query: string): MemoryEntry[] {
        const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
        if (terms.length === 0) return this.data.memories;

        return this.data.memories
            .map((m) => {
                const text = `${m.type} ${m.topic} ${m.content}`.toLowerCase();
                const score = terms.filter((term) => text.includes(term)).length;
                return { entry: m, score };
            })
            .filter((m) => m.score > 0)
            .sort((a, b) => b.score - a.score)
            .map((m) => m.entry);
    }

    public getAll(): MemoryEntry[] {
        return this.data.memories;
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
