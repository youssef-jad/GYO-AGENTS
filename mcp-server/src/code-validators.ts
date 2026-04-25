import { execSync } from "child_process";
import { existsSync, readdirSync, statSync, readFileSync } from "fs";
import { join, relative, extname } from "path";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeExec(cmd: string, cwd: string): string {
    try {
        return execSync(cmd, { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 10_000 }).trim();
    } catch {
        return "";
    }
}

/** Walk a directory and collect files matching an extension filter. */
function walkFiles(dir: string, extensions: string[], maxFiles = 5000): string[] {
    const results: string[] = [];

    function recurse(current: string) {
        if (results.length >= maxFiles) return;
        let entries: string[];
        try {
            entries = readdirSync(current);
        } catch {
            return;
        }
        for (const entry of entries) {
            if (entry.startsWith(".") || entry === "node_modules" || entry === "vendor") continue;
            const full = join(current, entry);
            let stat;
            try { stat = statSync(full); } catch { continue; }
            if (stat.isDirectory()) {
                recurse(full);
            } else if (extensions.includes(extname(full))) {
                results.push(full);
            }
        }
    }

    recurse(dir);
    return results;
}

function readFileSafe(path: string): string {
    try { return readFileSync(path, "utf-8"); } catch { return ""; }
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
        .map((r) => join(projectPath, r))
        .filter(existsSync);

    const matchedModules: DomainModule[] = [];

    for (const root of moduleRoots) {
        let entries: string[];
        try { entries = readdirSync(root); } catch { continue; }

        for (const entry of entries) {
            const entryLower = entry.toLowerCase();
            const full = join(root, entry);

            let stat;
            try { stat = statSync(full); } catch { continue; }
            if (!stat.isDirectory()) continue;

            // High confidence: directory name IS the domain keyword
            if (domainVariants.some((v) => entryLower === v.toLowerCase())) {
                matchedModules.push({
                    name: entry,
                    path: relative(projectPath, full),
                    confidence: "high",
                    reason: `Directory name matches domain "${domain}" exactly`,
                });
                continue;
            }

            // Medium confidence: directory name CONTAINS the domain keyword
            if (domainVariants.some((v) => entryLower.includes(v.toLowerCase()))) {
                matchedModules.push({
                    name: entry,
                    path: relative(projectPath, full),
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
                    path: relative(projectPath, full),
                    confidence: "low",
                    reason: `References "${domain}" in source files`,
                });
            }
        }
    }

    // Collect namespaces (grep for namespace declarations)
    const namespacesRaw = safeExec(
        `grep -rh --include="*.php" "namespace" . | sort -u | head -30`,
        projectPath
    );
    const namespaces = namespacesRaw
        .split("\n")
        .map((l) => l.replace("namespace ", "").replace(";", "").trim())
        .filter((n) => domainVariants.some((v) => n.toLowerCase().includes(v.toLowerCase())));

    // Collect route files referencing the domain
    const routeFiles: string[] = [];
    const routeSearchRaw = safeExec(
        `grep -rl --include="*.php" "${domain}" routes/ 2>/dev/null || true`,
        projectPath
    );
    if (routeSearchRaw) routeFiles.push(...routeSearchRaw.split("\n").filter(Boolean));

    // Related config/migration files
    const relatedFilesRaw = safeExec(
        `find . -name "*${domainLower}*" -o -name "*${domain}*" 2>/dev/null | grep -v ".git" | grep -v "vendor" | head -20`,
        projectPath
    );
    const relatedFiles = relatedFilesRaw.split("\n").filter(Boolean).map((f) => f.replace("./", ""));

    const summary =
        matchedModules.length === 0
            ? `No modules found for domain "${domain}". Check the spelling or try a broader term.`
            : `Found ${matchedModules.length} module(s) for domain "${domain}": ${matchedModules.map((m) => m.name).join(", ")}.`;

    return { domain, projectPath, matchedModules, relatedFiles, namespaces, routeFiles, summary };
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

    const searchRoot = scope ? join(projectPath, scope) : projectPath;
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
                        file: relative(projectPath, file),
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

    const searchRoot = scope ? join(projectPath, scope) : projectPath;
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
                        file: relative(projectPath, file),
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
