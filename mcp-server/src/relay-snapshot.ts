import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { closeSync, constants, fstatSync, lstatSync, openSync, readlinkSync, readSync, realpathSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
import { gitHead, gitRoot } from "./guardrail-git.js";
import { listProjectGuardrails } from "./guardrails.js";
import { repoPathParts } from "./patch.js";

export const relayConfigPath = ".gyo/relay.json";
const maxBytes = 64 * 1024 * 1024;
export const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export function relayGit(root: string, args: string[]): string {
    return execFileSync("git", args, {
        cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10_000,
        maxBuffer: 8 * 1024 * 1024,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_NO_LAZY_FETCH: "1", LC_ALL: "C" },
    });
}

export function relayRoot(path: string): string {
    if (!isAbsolute(path)) throw new Error("Provide an absolute Git project root.");
    const root = gitRoot(path);
    if (!root || root !== realpathSync(path)) throw new Error("Relay requires the Git project root.");
    if (!gitHead(root)) throw new Error("Relay requires a repository with a committed HEAD.");
    return root;
}

const checkSchema = z.object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    command: z.string().min(1).max(1024),
    args: z.array(z.string().max(2048)).max(50).default([]),
    timeoutMs: z.number().int().min(100).max(120_000).default(30_000),
}).strict();
const configSchema = z.object({ version: z.literal(1), checks: z.array(checkSchema).min(1).max(10) }).strict();
export type RelayCheck = z.infer<typeof checkSchema>;

/** Only the reviewed, committed configuration can supply executable commands. */
export function relayChecks(root: string): RelayCheck[] {
    const head = gitHead(root)!;
    const entry = relayGit(root, ["ls-tree", "-z", head, "--", relayConfigPath]);
    const blob = /^100(?:644|755) blob ([a-f\d]+)\t/.exec(entry);
    if (!blob) throw new Error(`Commit a regular ${relayConfigPath} with the project's allowed checks first.`);
    const config = configSchema.parse(JSON.parse(relayGit(root, ["cat-file", "blob", blob[1]])));
    if (new Set(config.checks.map(check => check.id)).size !== config.checks.length) throw new Error("Check IDs must be unique.");
    return config.checks;
}

export interface Snapshot {
    fingerprint: string;
    head: string;
    index: string;
    policy: string;
    files: Record<string, string>;
}

function captureOnce(root: string): Snapshot {
    const head = gitHead(root)!;
    const index = relayGit(root, ["ls-files", "--stage", "-z"]);
    if (/(?:^|\0)160000 /.test(index)) throw new Error("Relay v1 does not snapshot submodules.");
    const paths = [...new Set(relayGit(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
        .split("\0").filter(Boolean))].sort();
    if (paths.length > 10_000) throw new Error("Relay snapshot exceeds 10,000 files.");
    const files: Record<string, string> = Object.create(null);
    let bytes = 0;
    for (const path of paths) {
        const parts = repoPathParts(path);
        let parent = root;
        // Never follow a replaced directory symlink to read outside the checkout.
        let missing = false;
        for (const part of parts.slice(0, -1)) {
            parent = join(parent, part);
            try {
                if (!lstatSync(parent).isDirectory()) throw new Error(`Unsupported parent of ${path}.`);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
                missing = true;
                break;
            }
        }
        if (missing) { files[path] = "missing"; continue; }
        const file = join(root, ...parts);
        let stat;
        try { stat = lstatSync(file); } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
            files[path] = "missing";
            continue;
        }
        if (stat.isSymbolicLink()) {
            files[path] = "link:" + digest(readlinkSync(file));
            continue;
        }
        if (!stat.isFile()) throw new Error(`Unsupported Relay file: ${path}`);
        bytes += stat.size;
        if (bytes > maxBytes) throw new Error("Relay snapshot exceeds 64 MiB. Ignore generated/untracked outputs.");
        const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        try {
            const before = fstatSync(fd);
            if (!before.isFile() || before.ino !== stat.ino || before.size !== stat.size) throw new Error(`File changed during snapshot: ${path}`);
            const buffer = Buffer.alloc(stat.size + 1);
            let count = 0;
            while (count < buffer.length) {
                const n = readSync(fd, buffer, count, buffer.length - count, null);
                if (!n) break;
                count += n;
            }
            const after = fstatSync(fd);
            if (count !== stat.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) {
                throw new Error(`File changed during snapshot: ${path}`);
            }
            files[path] = `${stat.mode & 0o111}:${digest(buffer.subarray(0, count))}`;
        } finally { closeSync(fd); }
    }
    const policy = digest(JSON.stringify({
        checks: relayChecks(root),
        rules: listProjectGuardrails(root).filter(rule => !("approvedAt" in rule) || rule.approvedAt),
    }));
    const state = { head, index: digest(index), policy, files };
    return { fingerprint: digest(JSON.stringify(state)), ...state };
}

export function captureSnapshot(root: string): Snapshot {
    const first = captureOnce(root);
    const second = captureOnce(root);
    if (first.fingerprint !== second.fingerprint) throw new Error("Repository changed during Relay snapshot; retry when edits finish.");
    return second;
}

export function compareSnapshot(previous: Snapshot, current: Snapshot) {
    return {
        stale: previous.fingerprint !== current.fingerprint,
        headChanged: previous.head !== current.head,
        indexChanged: previous.index !== current.index,
        policyChanged: previous.policy !== current.policy,
        changedPaths: [...new Set([...Object.keys(previous.files), ...Object.keys(current.files)])]
            .filter(path => previous.files[path] !== current.files[path]),
    };
}
