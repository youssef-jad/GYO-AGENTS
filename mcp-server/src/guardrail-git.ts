import { execFileSync } from "node:child_process";
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { addedLines, maxPatchBytes, repoPathParts, type AddedLine } from "./patch.js";

export const teamRulesPath = ".gyo/guardrails.json";

function git(cwd: string, args: string[], input?: string): string {
    return execFileSync("git", args, {
        cwd,
        encoding: "utf-8",
        env: { ...process.env, LC_ALL: "C", GIT_OPTIONAL_LOCKS: "0", GIT_NO_LAZY_FETCH: "1" },
        maxBuffer: maxPatchBytes,
        stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
        input,
        timeout: 5000,
    });
}

export function gitRoot(cwd: string): string | undefined {
    try {
        return realpathSync(git(cwd, ["rev-parse", "--show-toplevel"]).replace(/\r?\n$/, ""));
    } catch (error) {
        const failure = error as { status?: number; stderr?: string; code?: string };
        if (failure.code === "ENOENT" || (failure.status === 128 && failure.stderr?.includes("not a git repository"))) return;
        throw error;
    }
}

export function gitHead(root: string): string | undefined {
    try {
        return git(root, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]).trim();
    } catch (error) {
        if ((error as { status?: number }).status === 1) return;
        throw error;
    }
}

export function committedTeamRules(root: string, head: string): string | undefined {
    const entry = git(root, ["ls-tree", "--full-tree", "-z", head, "--", teamRulesPath]);
    if (!entry) return;
    const blob = /^100(?:644|755) blob ([a-f\d]+)\t/.exec(entry);
    if (!blob) throw new Error(`Committed ${teamRulesPath} must be a regular file.`);
    return git(root, ["cat-file", "blob", blob[1]]);
}

function readUntrackedFile(root: string, path: string, remaining: number): Buffer | undefined {
    const file = resolve(root, ...repoPathParts(path));
    if (!lstatSync(file).isFile()) return;
    const canonicalFile = realpathSync(file);
    const relativePath = relative(root, canonicalFile);
    if (isAbsolute(relativePath) || relativePath === ".." || relativePath.startsWith(".." + sep)) {
        throw new Error(`Untracked file is outside the repository: ${path}`);
    }
    const fd = openSync(canonicalFile, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    try {
        const stat = fstatSync(fd);
        if (!stat.isFile()) return;
        const buffer = Buffer.allocUnsafe(Math.min(stat.size, remaining) + 1);
        let length = 0;
        while (length < buffer.length) {
            const read = readSync(fd, buffer, length, buffer.length - length, null);
            if (!read) break;
            length += read;
        }
        const content = buffer.subarray(0, length);
        if (content.subarray(0, 8000).includes(0)) return;
        if (length > remaining) {
            throw new Error(`Working changes exceed ${maxPatchBytes} bytes. Check a smaller set of changes.`);
        }
        if (length > stat.size) throw new Error(`File changed while checking guardrails: ${path}`);
        return content;
    } finally {
        closeSync(fd);
    }
}

export function* workingAddedLines(
    root: string,
    head: string | undefined,
    matchesRule: (path: string) => boolean,
): Generator<AddedLine> {
    const base = head ?? git(root, ["hash-object", "-t", "tree", "--stdin"], "").trim();
    const patch = git(root, [
        "-c", "core.quotePath=false", "diff", "--no-color", "--no-ext-diff", "--no-textconv",
        "--src-prefix=a/", "--dst-prefix=b/", "--no-relative", "--submodule=short", base, "--",
    ]);
    yield* addedLines(patch);

    let remaining = maxPatchBytes - Buffer.byteLength(patch);
    const untracked = git(root, ["ls-files", "--others", "--exclude-standard", "-z", "--"]);
    for (const path of untracked.split("\0")) {
        if (!path || path === teamRulesPath || !matchesRule(path)) continue;
        const content = readUntrackedFile(root, path, remaining);
        if (!content) continue;
        remaining -= content.length;
        const lines = content.toString("utf-8").split("\n");
        if (lines.at(-1) === "") lines.pop();
        for (const [index, line] of lines.entries()) {
            yield { path, line: index + 1, text: line.replace(/\r$/, "") };
        }
    }
}
