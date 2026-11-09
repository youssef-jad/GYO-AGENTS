import { mkdirSync, readFileSync, realpathSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "fs";
import { homedir } from "os";
import { isAbsolute, join, resolve } from "path";

export const dataDirectory = process.env.GYO_AGENTS_DATA_DIR || join(homedir(), ".gyo-agents");

export function scopeKey(scope?: string | null): string | null {
    if (!scope) return null;
    if (!isAbsolute(scope)) return scope;
    try { return realpathSync(scope); } catch { return resolve(scope); }
}

export function inScope(stored: string | null, requested: string | null): boolean {
    return stored === null || (requested !== null && scopeKey(stored) === requested);
}

/** A local JSON file shared by independent MCP server processes. */
export class JsonStore<T extends { version: number }> {
    private readonly path: string;

    constructor(fileName: string, private readonly initial: () => T) {
        this.path = join(dataDirectory, fileName);
    }

    read(): T {
        let raw: string;
        try {
            raw = readFileSync(this.path, "utf-8");
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return this.initial();
            throw error;
        }

        let data: T;
        try {
            data = JSON.parse(raw);
        } catch {
            throw new Error(`Invalid JSON in ${this.path}`);
        }
        const defaults = this.initial();
        if (data?.version !== defaults.version || Object.entries(defaults).some(([key, value]) =>
            Array.isArray(value) && !Array.isArray(data[key as keyof T])
        )) {
            throw new Error(`Invalid data in ${this.path}`);
        }
        return data;
    }

    update<Result>(mutate: (data: T) => Result): Result {
        mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
        const lock = this.path + ".lock";
        const deadline = Date.now() + 5000;
        const pause = new Int32Array(new SharedArrayBuffer(4));
        for (;;) {
            try {
                mkdirSync(lock, { mode: 0o700 });
                break;
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
                if (Date.now() >= deadline) {
                    throw new Error(`Store is locked: ${lock}. If a writer was interrupted, close all GYO clients before removing the lock directory.`);
                }
                Atomics.wait(pause, 0, 0, 20);
            }
        }

        const pending = join(lock, "pending.json");
        try {
            const data = this.read();
            const result = mutate(data);
            writeFileSync(pending, JSON.stringify(data, null, 2), { mode: 0o600, flag: "wx" });
            renameSync(pending, this.path);
            return result;
        } finally {
            try {
                unlinkSync(pending);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
            }
            rmdirSync(lock);
        }
    }
}
