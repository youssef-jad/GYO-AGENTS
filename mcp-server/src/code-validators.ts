import { existsSync, lstatSync, opendirSync, readFileSync, realpathSync, readdirSync } from "fs";
import { extname, isAbsolute, join, relative, resolve, sep } from "path";

function isWithin(root: string, path: string): boolean {
    const difference = relative(root, path);
    return !isAbsolute(difference) && difference !== ".." && !difference.startsWith(".." + sep);
}

function resolveScope(projectPath: string, scope = "."): string {
    const root = realpathSync(projectPath);
    const candidate = resolve(root, scope);
    if (!isWithin(root, candidate)) {
        throw new Error("Scan scope must stay within the project.");
    }
    const actual = realpathSync(candidate);
    if (!isWithin(root, actual) || !lstatSync(actual).isDirectory()) {
        throw new Error("Scan scope must be a directory within the project.");
    }
    return actual;
}

function* walkEntries(dir: string, budget = { remaining: 20_000 }): Generator<{ path: string; isFile: boolean }> {
    let entries;
    try { entries = opendirSync(dir); } catch { return; }
    try {
        while (budget.remaining > 0) {
            const entry = entries.readSync();
            if (!entry) break;
            budget.remaining--;
            if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "vendor") continue;
            const path = join(dir, entry.name);
            if (entry.isFile()) {
                yield { path, isFile: true };
            } else if (entry.isDirectory()) {
                yield { path, isFile: false };
                yield* walkEntries(path, budget);
            }
        }
    } finally {
        entries.closeSync();
    }
}

function walkFiles(dir: string, extensions: string[], maxFiles = 5000): string[] {
    const results: string[] = [];
    for (const entry of walkEntries(dir)) {
        if (!entry.isFile || !extensions.includes(extname(entry.path))) continue;
        results.push(entry.path);
        if (results.length >= maxFiles) break;
    }
    return results;
}

function readFileSafe(path: string): string {
    try {
        const stat = lstatSync(path);
        return stat.isFile() && stat.size <= 1024 * 1024 ? readFileSync(path, "utf-8") : "";
    } catch {
        return "";
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. get_domain_context
// ═══════════════════════════════════════════════════════════════════════════════

export interface DomainContextResult {
    domain: string;
    projectPath: string;
    matchedModules: DomainModule[];
    relatedFiles: string[];
    namespaces: string[];
    routeFiles: string[];
    summary: string;
}

export interface DomainModule {
    name: string;
    path: string;
    confidence: "high" | "medium" | "low";
    reason: string;
}

/**
 * Scans the project's module/src structure and finds everything related to a domain keyword.
 * Works for Laravel modular projects (Modules/, src/, app/) and any directory-based structure.
 */
export function getDomainContext(projectPath: string, domain: string): DomainContextResult {
    if (!existsSync(projectPath)) {
        throw new Error(`Project path does not exist: ${projectPath}`);
    }

    const rootPath = realpathSync(projectPath);
    const domainLower = domain.toLowerCase();
    const domainVariants = [
        domainLower,
        domainLower.replace(/\s+/g, ""),          // "pointofsale" → "pos"
        domainLower.replace(/\s+/g, "-"),          // "point-of-sale"
        domainLower.replace(/\s+/g, "_"),          // "point_of_sale"
        domainLower.toUpperCase(),                  // "POS"
        domain,                                     // original casing
    ];

    // Module root candidates
    const moduleRoots = ["Modules", "modules", "src/Modules", "app/Modules", "src", "app"]
        .flatMap((scope) => {
            try { return [resolveScope(rootPath, scope)]; } catch { return []; }
        });

    const matchedModules: DomainModule[] = [];

    for (const root of moduleRoots) {
        let entries: string[];
        try { entries = readdirSync(root); } catch { continue; }

        for (const entry of entries) {
            const entryLower = entry.toLowerCase();
            const full = join(root, entry);

            let stat;
            try { stat = lstatSync(full); } catch { continue; }
            if (!stat.isDirectory()) continue;

            // High confidence: directory name IS the domain keyword
            if (domainVariants.some((v) => entryLower === v.toLowerCase())) {
                matchedModules.push({
                    name: entry,
                    path: relative(rootPath, full),
                    confidence: "high",
                    reason: `Directory name matches domain "${domain}" exactly`,
                });
                continue;
            }

            // Medium confidence: directory name CONTAINS the domain keyword
            if (domainVariants.some((v) => entryLower.includes(v.toLowerCase()))) {
                matchedModules.push({
                    name: entry,
                    path: relative(rootPath, full),
                    confidence: "medium",
                    reason: `Directory name contains "${domain}"`,
                });
                continue;
            }

            // Low confidence: scan directory contents for namespace/class references to domain
            const phpFiles = walkFiles(full, [".php"], 30);
            const hasReference = phpFiles.some((f) => {
                const src = readFileSafe(f);
                return domainVariants.some((v) => src.includes(v));
            });

            if (hasReference) {
                matchedModules.push({
                    name: entry,
                    path: relative(rootPath, full),
                    confidence: "low",
                    reason: `References "${domain}" in source files`,
                });
            }
        }
    }

    const namespaces = new Set<string>();
    const routeFiles: string[] = [];
    const relatedFiles: string[] = [];
    const routesRoot = join(rootPath, "routes");
    let phpFilesScanned = 0;

    for (const { path, isFile } of walkEntries(rootPath)) {
        const localPath = relative(rootPath, path);
        const name = localPath.split(sep).pop()!;
        if (relatedFiles.length < 20 && name.toLowerCase().includes(domainLower)) {
            relatedFiles.push(localPath);
        }
        if (!isFile || extname(path) !== ".php" || phpFilesScanned >= 5000) continue;
        phpFilesScanned++;
        const source = readFileSafe(path);
        for (const [, namespace] of source.matchAll(/^\s*namespace\s+([\w\\]+)\s*[;{]/gm)) {
            if (namespaces.size < 30 && domainVariants.some(v => namespace.toLowerCase().includes(v.toLowerCase()))) {
                namespaces.add(namespace);
            }
        }
        if (routeFiles.length < 100 && isWithin(routesRoot, path) && source.includes(domain)) {
            routeFiles.push(localPath);
        }
    }

    const summary =
        matchedModules.length === 0
            ? `No modules found for domain "${domain}". Check the spelling or try a broader term.`
            : `Found ${matchedModules.length} module(s) for domain "${domain}": ${matchedModules.map((m) => m.name).join(", ")}.`;

    return { domain, projectPath, matchedModules, relatedFiles, namespaces: [...namespaces], routeFiles, summary };
}

export function formatDomainContext(result: DomainContextResult): string {
    const lines = [
        `# Domain Context: "${result.domain}"`,
        `**Project:** \`${result.projectPath}\``,
        "",
    ];

    if (result.matchedModules.length === 0) {
        lines.push(`> ⚠️  ${result.summary}`);
        return lines.join("\n");
    }

    lines.push(`## Matched Modules (${result.matchedModules.length})`);
    lines.push("| Module | Path | Confidence | Reason |");
    lines.push("|--------|------|------------|--------|");
    for (const m of result.matchedModules) {
        const badge = m.confidence === "high" ? "🟢 High" : m.confidence === "medium" ? "🟡 Medium" : "🔵 Low";
        lines.push(`| **${m.name}** | \`${m.path}\` | ${badge} | ${m.reason} |`);
    }

    if (result.namespaces.length > 0) {
        lines.push("", "## Related Namespaces");
        result.namespaces.forEach((n) => lines.push(`- \`${n}\``));
    }

    if (result.routeFiles.length > 0) {
        lines.push("", "## Route Files");
        result.routeFiles.forEach((f) => lines.push(`- \`${f}\``));
    }

    if (result.relatedFiles.length > 0) {
        lines.push("", "## Other Related Files");
        result.relatedFiles.slice(0, 15).forEach((f) => lines.push(`- \`${f}\``));
    }

    lines.push("", `---`, `_${result.summary}_`);
    return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. validate_api_response
// ═══════════════════════════════════════════════════════════════════════════════

export interface ApiResponseViolation {
    file: string;
    line: number;
    snippet: string;
    suggestion: string;
}

export interface ValidateApiResponseResult {
    projectPath: string;
    totalFilesScanned: number;
    violations: ApiResponseViolation[];
    summary: string;
}

const API_RESPONSE_PATTERNS: Array<{
    pattern: RegExp;
    label: string;
    suggestion: string;
}> = [
        {
            pattern: /response\(\)\s*->\s*json\s*\(/g,
            label: "response()->json()",
            suggestion: "Use Json::item($data) or Json::collection($data) from the project's Json facade instead of response()->json(). See api-development.md.",
        },
        {
            pattern: /return\s+response\(\)\s*->\s*json\s*\(/g,
            label: "return response()->json()",
            suggestion: "Use Json::item($data) or Json::collection($data). See api-development.md.",
        },
        {
            pattern: /new\s+JsonResponse\s*\(/g,
            label: "new JsonResponse()",
            suggestion: "Avoid constructing JsonResponse directly. Use Json::item() or Json::collection(). See api-development.md.",
        },
    ];

export function validateApiResponse(projectPath: string, scope?: string): ValidateApiResponseResult {
    if (!existsSync(projectPath)) {
        throw new Error(`Project path does not exist: ${projectPath}`);
    }

    const rootPath = realpathSync(projectPath);
    const searchRoot = resolveScope(rootPath, scope);
    const phpFiles = walkFiles(searchRoot, [".php"]);
    const violations: ApiResponseViolation[] = [];

    for (const file of phpFiles) {
        const content = readFileSafe(file);
        if (!content) continue;

        const lines = content.split("\n");
        lines.forEach((lineContent, idx) => {
            for (const { pattern, suggestion } of API_RESPONSE_PATTERNS) {
                pattern.lastIndex = 0; // reset regex
                if (pattern.test(lineContent)) {
                    violations.push({
                        file: relative(rootPath, file),
                        line: idx + 1,
                        snippet: lineContent.trim(),
                        suggestion,
                    });
                }
            }
        });
    }

    const summary =
        violations.length === 0
            ? `✅ No response()->json() violations found across ${phpFiles.length} scanned files.`
            : `❌ Found ${violations.length} violation(s) in ${new Set(violations.map((v) => v.file)).size} file(s) out of ${phpFiles.length} scanned.`;

    return { projectPath, totalFilesScanned: phpFiles.length, violations, summary };
}

export function formatApiResponseReport(result: ValidateApiResponseResult): string {
    const lines = [
        "# API Response Validation",
        `**Project:** \`${result.projectPath}\``,
        `**Files Scanned:** ${result.totalFilesScanned}`,
        "",
    ];

    if (result.violations.length === 0) {
        lines.push(`> ${result.summary}`);
        return lines.join("\n");
    }

    lines.push(`> ${result.summary}`, "");
    lines.push("## Violations");
    lines.push("");

    const byFile = new Map<string, ApiResponseViolation[]>();
    for (const v of result.violations) {
        if (!byFile.has(v.file)) byFile.set(v.file, []);
        byFile.get(v.file)!.push(v);
    }

    for (const [file, vs] of byFile) {
        lines.push(`### \`${file}\``);
        for (const v of vs) {
            lines.push(`- **Line ${v.line}:** \`${v.snippet}\``);
            lines.push(`  > ${v.suggestion}`);
        }
        lines.push("");
    }

    return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. check_cache_usage
// ═══════════════════════════════════════════════════════════════════════════════

export interface CacheViolation {
    file: string;
    line: number;
    snippet: string;
    type: "facade" | "helper" | "direct";
    suggestion: string;
}

export interface CheckCacheUsageResult {
    projectPath: string;
    totalFilesScanned: number;
    violations: CacheViolation[];
    correctUsages: number;
    summary: string;
}

const CACHE_VIOLATIONS: Array<{
    pattern: RegExp;
    type: "facade" | "helper" | "direct";
    suggestion: string;
}> = [
        {
            pattern: /\bCache::/g,
            type: "facade",
            suggestion: "Replace Cache:: with cache_store('read') or cache_store('write') to respect the project's read/write split. See guardrails.md.",
        },
        {
            pattern: /\bcache\(\)/g,
            type: "helper",
            suggestion: "Replace cache() helper with cache_store('read') or cache_store('write'). See guardrails.md.",
        },
    ];

const CACHE_CORRECT_PATTERN = /cache_store\s*\(\s*['"](?:read|write)['"]\s*\)/;

export function checkCacheUsage(projectPath: string, scope?: string): CheckCacheUsageResult {
    if (!existsSync(projectPath)) {
        throw new Error(`Project path does not exist: ${projectPath}`);
    }

    const rootPath = realpathSync(projectPath);
    const searchRoot = resolveScope(rootPath, scope);
    const phpFiles = walkFiles(searchRoot, [".php"]);
    const violations: CacheViolation[] = [];
    let correctUsages = 0;

    for (const file of phpFiles) {
        const content = readFileSafe(file);
        if (!content) continue;

        const lines = content.split("\n");
        lines.forEach((lineContent, idx) => {
            // Count correct usages
            if (CACHE_CORRECT_PATTERN.test(lineContent)) {
                correctUsages++;
                return; // line uses the correct pattern — skip violation check
            }

            for (const { pattern, type, suggestion } of CACHE_VIOLATIONS) {
                pattern.lastIndex = 0;
                if (pattern.test(lineContent)) {
                    violations.push({
                        file: relative(rootPath, file),
                        line: idx + 1,
                        snippet: lineContent.trim(),
                        type,
                        suggestion,
                    });
                }
            }
        });
    }

    const violatingFiles = new Set(violations.map((v) => v.file)).size;
    const summary =
        violations.length === 0
            ? `✅ No Cache:: / cache() violations found across ${phpFiles.length} files. ${correctUsages} correct cache_store() usage(s) found.`
            : `❌ Found ${violations.length} violation(s) in ${violatingFiles} file(s). ${correctUsages} correct cache_store() usage(s) found.`;

    return { projectPath, totalFilesScanned: phpFiles.length, violations, correctUsages, summary };
}

export function formatCacheReport(result: CheckCacheUsageResult): string {
    const lines = [
        "# Cache Usage Check",
        `**Project:** \`${result.projectPath}\``,
        `**Files Scanned:** ${result.totalFilesScanned}`,
        `**Correct \`cache_store()\` usages:** ${result.correctUsages}`,
        "",
    ];

    if (result.violations.length === 0) {
        lines.push(`> ${result.summary}`);
        return lines.join("\n");
    }

    lines.push(`> ${result.summary}`, "");
    lines.push("## Violations");
    lines.push("");

    const byFile = new Map<string, CacheViolation[]>();
    for (const v of result.violations) {
        if (!byFile.has(v.file)) byFile.set(v.file, []);
        byFile.get(v.file)!.push(v);
    }

    for (const [file, vs] of byFile) {
        lines.push(`### \`${file}\``);
        for (const v of vs) {
            const badge = v.type === "facade" ? "Cache::" : "cache()";
            lines.push(`- **Line ${v.line}** [\`${badge}\`]: \`${v.snippet}\``);
            lines.push(`  > ${v.suggestion}`);
        }
        lines.push("");
    }

    lines.push("## Quick Fix");
    lines.push("```php");
    lines.push("// ❌ Before");
    lines.push("Cache::remember('key', 60, fn() => ...);");
    lines.push("Cache::put('key', $value, 60);");
    lines.push("");
    lines.push("// ✅ After");
    lines.push("cache_store('read')->remember('key', 60, fn() => ...);");
    lines.push("cache_store('write')->put('key', $value, 60);");
    lines.push("```");

    return lines.join("\n");
}
