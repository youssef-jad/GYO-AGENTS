import { isAbsolute } from "node:path";

export const maxPatchBytes = 2 * 1024 * 1024;

export function repoPathParts(path: string): string[] {
    const parts = path.split("/");
    if (isAbsolute(path) || /^[A-Za-z]:/.test(path) || /[\\\x00-\x1f\x7f]/.test(path) ||
        parts.some(part => part === "" || part === "." || part === "..")) {
        throw new Error("Use a repository-relative path with forward slashes.");
    }
    return parts;
}

export interface AddedLine {
    path: string;
    line: number;
    text: string;
}

/** Reads standard Git text patches with a/ and b/ prefixes. */
export function* addedLines(patch: string): Generator<AddedLine> {
    if (Buffer.byteLength(patch) > maxPatchBytes) {
        throw new Error(`Patch exceeds ${maxPatchBytes} bytes. Check smaller patches.`);
    }

    let fileHeader = false;
    let sawOldPath = false;
    let path: string | null | undefined;
    let hunk: { oldLeft: number; newLeft: number; line: number } | undefined;
    let sawHunk = false;
    let metadataChange = false;
    const lines = patch.split("\n");
    if (lines.at(-1) === "") lines.pop();

    function finishFile() {
        if (hunk || (fileHeader && !(sawOldPath ? sawHunk : metadataChange))) {
            throw new Error("Incomplete Git patch.");
        }
    }

    for (const raw of lines) {
        const line = raw.replace(/\r$/, "");
        if (line === "\\ No newline at end of file" && sawHunk) continue;

        if (hunk) {
            const kind = line[0];
            if (kind !== "+" && kind !== "-" && kind !== " ") {
                throw new Error("Invalid or truncated Git patch hunk.");
            }
            if (kind !== "+") hunk.oldLeft--;
            if (kind !== "-") hunk.newLeft--;
            if (hunk.oldLeft < 0 || hunk.newLeft < 0) {
                throw new Error("Git patch hunk does not match its declared line counts.");
            }
            if (kind === "+" && path) yield { path, line: hunk.line, text: line.slice(1) };
            if (kind !== "-") hunk.line++;
            if (hunk.oldLeft === 0 && hunk.newLeft === 0) hunk = undefined;
            continue;
        }

        if (line.startsWith("diff --git ")) {
            finishFile();
            fileHeader = true;
            sawOldPath = false;
            path = undefined;
            sawHunk = false;
            metadataChange = false;
            continue;
        }
        if (fileHeader && line.startsWith("--- ") && !sawOldPath) {
            sawOldPath = true;
            continue;
        }
        if (sawOldPath && path === undefined && line.startsWith("+++ ")) {
            const header = line.slice(4).split("\t", 1)[0];
            if (header === "/dev/null") {
                path = null;
            } else if (header.startsWith("b/")) {
                path = repoPathParts(header.slice(2)).join("/");
            } else {
                throw new Error("Unsupported Git patch path. Use b/ prefixes and -c core.quotePath=false.");
            }
            continue;
        }
        if (path !== undefined && line.startsWith("@@ ")) {
            const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: |$)/.exec(line);
            if (!match) throw new Error("Invalid Git patch hunk header.");
            const [, oldStart, oldCount = "1", newStart, newCount = "1"] = match;
            const [oldLeft, newLeft, firstLine] = [oldCount, newCount, newStart].map(Number);
            if (![Number(oldStart), oldLeft, newLeft, firstLine, firstLine + newLeft].every(Number.isSafeInteger) ||
                (oldLeft > 0 && Number(oldStart) === 0) || (newLeft > 0 && firstLine === 0) ||
                (path === null && newLeft !== 0) || (oldLeft === 0 && newLeft === 0)) {
                throw new Error("Invalid Git patch hunk range.");
            }
            hunk = { oldLeft, newLeft, line: firstLine };
            sawHunk = true;
            continue;
        }
        if (fileHeader && !sawOldPath) {
            if (/^(?:new file mode |deleted file mode |new mode |rename to |copy to |Binary files )/.test(line)) {
                metadataChange = true;
                continue;
            }
            if (/^(?:index |old mode |similarity index |dissimilarity index |rename from |copy from )/.test(line)) continue;
        }
        throw new Error("Expected a standard Git patch. Disable external diffs and text conversion.");
    }

    finishFile();
}
