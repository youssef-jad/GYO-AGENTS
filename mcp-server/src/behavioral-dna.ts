import { execSync } from "child_process";
import { existsSync, readdirSync, statSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, extname, relative } from "path";
import { homedir } from "os";

// ═══════════════════════════════════════════════════════════════════════════════
// Behavioral DNA — The "Soul" of the Digital Twin
//
// Instead of storing explicit memories, this module OBSERVES actual code and
// infers the developer's instincts, values, and growth trajectory.
// It builds a living personality model that evolves with every scan.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Types ────────────────────────────────────────────────────────────────────

/** A single observed coding pattern with confidence tracking. */
export interface Trait {
    signal: string;
    observation: string;
    examples: string[];
    confidence: number;       // 0.0–1.0, increases with repeated observations
    firstSeen: string;        // ISO date
    lastSeen: string;         // ISO date
    observationCount: number; // how many scans confirmed this
}

/** Layer 1: Reflexive coding habits — how you write code without thinking. */
export interface Instincts {
    controlFlow: Trait[];     // early returns vs nested, ternary vs if/else
    naming: Trait[];          // verbose vs terse, camelCase vs snake_case
    structure: Trait[];       // function length, nesting depth, file organization
    expressiveness: Trait[];  // comments, type annotations, error messages
}

/** Layer 2: What you optimize for when making tradeoffs. */
export interface Values {
    tradeoffs: Trait[];       // readability vs performance, DRY vs explicit
    quality: Trait[];         // test coverage, error handling thoroughness
    complexity: Trait[];      // over-engineering vs minimalism
}

/** A snapshot of a trait at a point in time, for tracking evolution. */
export interface GrowthSnapshot {
    date: string;
    projectPath: string;
    traits: Array<{ signal: string; confidence: number }>;
}

/** Layer 3: How the developer is changing over time. */
export interface Growth {
    snapshots: GrowthSnapshot[];
    transitions: Array<{
        from: string;
        to: string;
        when: string;
        confidence: number;
    }>;
}

/** The complete Behavioral DNA profile. */
export interface BehavioralDNA {
    version: number;
    lastUpdated: string;
    scanCount: number;
    instincts: Instincts;
    values: Values;
    growth: Growth;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

const DNA_FILE_NAME = "behavioral-dna.json";
const DNA_DIR = join(homedir(), ".gyo-agents");

function getDnaFilePath(): string {
    if (!existsSync(DNA_DIR)) {
        mkdirSync(DNA_DIR, { recursive: true });
    }
    return join(DNA_DIR, DNA_FILE_NAME);
}

function createEmptyDNA(): BehavioralDNA {
    return {
        version: 1,
        lastUpdated: new Date().toISOString(),
        scanCount: 0,
        instincts: { controlFlow: [], naming: [], structure: [], expressiveness: [] },
        values: { tradeoffs: [], quality: [], complexity: [] },
        growth: { snapshots: [], transitions: [] },
    };
}

export function loadDNA(): BehavioralDNA {
    const path = getDnaFilePath();
    if (!existsSync(path)) return createEmptyDNA();
    try {
        return JSON.parse(readFileSync(path, "utf-8")) as BehavioralDNA;
    } catch {
        return createEmptyDNA();
    }
}

export function saveDNA(dna: BehavioralDNA): void {
    dna.lastUpdated = new Date().toISOString();
    writeFileSync(getDnaFilePath(), JSON.stringify(dna, null, 2), "utf-8");
}


// ─── Code Scanning Helpers ────────────────────────────────────────────────────

const CODE_EXTENSIONS = [".ts", ".js", ".tsx", ".jsx", ".py", ".php", ".rb", ".go", ".rs", ".java", ".kt", ".swift", ".cs"];

function walkCodeFiles(dir: string, maxFiles = 500): string[] {
    const results: string[] = [];
    function recurse(current: string) {
        if (results.length >= maxFiles) return;
        let entries: string[];
        try { entries = readdirSync(current); } catch { return; }
        for (const entry of entries) {
            if (entry.startsWith(".") || entry === "node_modules" || entry === "vendor" ||
                entry === "dist" || entry === "build" || entry === "__pycache__") continue;
            const full = join(current, entry);
            let stat;
            try { stat = statSync(full); } catch { continue; }
            if (stat.isDirectory()) {
                recurse(full);
            } else if (CODE_EXTENSIONS.includes(extname(full))) {
                results.push(full);
            }
        }
    }
    recurse(dir);
    return results;
}

function safeRead(path: string): string {
    try { return readFileSync(path, "utf-8"); } catch { return ""; }
}

// ─── Pattern Detectors ────────────────────────────────────────────────────────
// Each detector scans code files and returns raw signal counts.

interface SignalCounts {
    // Control flow
    earlyReturns: number;
    nestedElse: number;
    ternaries: number;
    ifElseBlocks: number;
    forLoops: number;
    functionalIterators: number; // .map, .filter, .reduce, .forEach
    tryCatchBlocks: number;
    guardClauses: number;

    // Naming
    camelCaseVars: number;
    snakeCaseVars: number;
    shortNames: number;        // 1-2 char variable names
    descriptiveNames: number;  // 20+ char identifiers
    abbreviations: number;     // common abbreviations like btn, msg, req, res

    // Structure
    totalFunctions: number;
    shortFunctions: number;    // < 10 lines
    longFunctions: number;     // > 40 lines
    maxNestingDepth: number;
    avgFunctionLength: number;
    singleExportFiles: number;
    multiExportFiles: number;

    // Expressiveness
    commentLines: number;
    todoComments: number;
    typeAnnotations: number;
    anyTypes: number;
    jsdocBlocks: number;
    inlineComments: number;

    // Values — quality signals
    errorHandlingBlocks: number;
    customErrorClasses: number;
    assertStatements: number;
    validationChecks: number;  // zod, joi, yup, class-validator patterns

    // Values — complexity signals
    genericTypes: number;
    abstractClasses: number;
    interfaceDeclarations: number;
    simpleObjects: number;     // plain object literals, no class

    totalFiles: number;
    totalLines: number;
}

function analyzeCodeSignals(projectPath: string): SignalCounts {
    const files = walkCodeFiles(projectPath);
    const counts: SignalCounts = {
        earlyReturns: 0, nestedElse: 0, ternaries: 0, ifElseBlocks: 0,
        forLoops: 0, functionalIterators: 0, tryCatchBlocks: 0, guardClauses: 0,
        camelCaseVars: 0, snakeCaseVars: 0, shortNames: 0, descriptiveNames: 0, abbreviations: 0,
        totalFunctions: 0, shortFunctions: 0, longFunctions: 0,
        maxNestingDepth: 0, avgFunctionLength: 0, singleExportFiles: 0, multiExportFiles: 0,
        commentLines: 0, todoComments: 0, typeAnnotations: 0, anyTypes: 0,
        jsdocBlocks: 0, inlineComments: 0,
        errorHandlingBlocks: 0, customErrorClasses: 0, assertStatements: 0, validationChecks: 0,
        genericTypes: 0, abstractClasses: 0, interfaceDeclarations: 0, simpleObjects: 0,
        totalFiles: files.length, totalLines: 0,
    };

    const functionLengths: number[] = [];
    const ABBREVS = /\b(btn|msg|req|res|ctx|cfg|env|tmp|err|cb|fn|args|opts|params|util|utils|lib|src|pkg|mod|impl)\b/g;

    for (const file of files) {
        const content = safeRead(file);
        if (!content) continue;
        const lines = content.split("\n");
        counts.totalLines += lines.length;

        let inFunction = false;
        let functionLineCount = 0;
        let braceDepth = 0;
        let maxDepthInFile = 0;
        let exportCount = 0;

        for (const line of lines) {
            const trimmed = line.trim();

            // Control flow
            if (/^\s*return\b/.test(line) && braceDepth <= 2) counts.earlyReturns++;
            if (/}\s*else\s*{/.test(line)) counts.nestedElse++;
            if (/\?.*:/.test(line) && !/:.*:/.test(line)) counts.ternaries++;
            if (/^\s*if\s*\(/.test(line)) counts.ifElseBlocks++;
            if (/\bfor\s*\(/.test(line) || /\bwhile\s*\(/.test(line)) counts.forLoops++;
            if (/\.(map|filter|reduce|forEach|flatMap|find|some|every)\s*\(/.test(line)) counts.functionalIterators++;
            if (/\btry\s*{/.test(line)) counts.tryCatchBlocks++;
            if (/^\s*if\s*\(.*\)\s*return\b/.test(line) || /^\s*if\s*\(.*\)\s*throw\b/.test(line)) counts.guardClauses++;

            // Naming (sample variable declarations)
            const varMatch = line.match(/(?:const|let|var|function)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
            if (varMatch) {
                const name = varMatch[1];
                if (/[a-z][A-Z]/.test(name)) counts.camelCaseVars++;
                if (/_[a-z]/.test(name)) counts.snakeCaseVars++;
                if (name.length <= 2) counts.shortNames++;
                if (name.length >= 20) counts.descriptiveNames++;
            }
            const abbrevMatches = line.match(ABBREVS);
            if (abbrevMatches) counts.abbreviations += abbrevMatches.length;

            // Structure — track function boundaries
            if (/\b(function|async function)\s+\w+/.test(line) || /(?:const|let)\s+\w+\s*=\s*(?:async\s*)?\(/.test(line)) {
                if (inFunction && functionLineCount > 0) {
                    functionLengths.push(functionLineCount);
                    if (functionLineCount < 10) counts.shortFunctions++;
                    if (functionLineCount > 40) counts.longFunctions++;
                }
                counts.totalFunctions++;
                inFunction = true;
                functionLineCount = 0;
            }
            if (inFunction) functionLineCount++;

            // Brace depth tracking
            const opens = (line.match(/{/g) || []).length;
            const closes = (line.match(/}/g) || []).length;
            braceDepth += opens - closes;
            if (braceDepth > maxDepthInFile) maxDepthInFile = braceDepth;

            // Exports
            if (/\bexport\b/.test(line)) exportCount++;

            // Expressiveness
            if (/^\s*\/\//.test(line) || /^\s*\/\*/.test(line) || /^\s*\*/.test(line)) counts.commentLines++;
            if (/\/\/\s*(TODO|FIXME|HACK|XXX)/i.test(line)) counts.todoComments++;
            if (/:\s*\w+(\[\])?(\s*[=;,)])/.test(line) || /:\s*\w+</.test(line)) counts.typeAnnotations++;
            if (/:\s*any\b/.test(line)) counts.anyTypes++;
            if (/\/\*\*/.test(line)) counts.jsdocBlocks++;
            if (/\S.*\/\/\s*\S/.test(line)) counts.inlineComments++;

            // Quality signals
            if (/\bcatch\s*\(/.test(line)) counts.errorHandlingBlocks++;
            if (/class\s+\w+.*extends\s+.*Error/.test(line)) counts.customErrorClasses++;
            if (/\bassert\b|\bexpect\b/.test(line)) counts.assertStatements++;
            if (/\bz\.\w+|Joi\.\w+|yup\.\w+|@IsString|@IsNumber|class-validator/.test(line)) counts.validationChecks++;

            // Complexity signals
            if (/<\w+>/.test(line) && /\b(function|class|interface|type)\b/.test(line)) counts.genericTypes++;
            if (/\babstract\s+class\b/.test(line)) counts.abstractClasses++;
            if (/\binterface\s+\w+/.test(line)) counts.interfaceDeclarations++;
            if (/=\s*{/.test(line) && !/class\b/.test(line)) counts.simpleObjects++;
        }

        // Flush last function
        if (inFunction && functionLineCount > 0) {
            functionLengths.push(functionLineCount);
            if (functionLineCount < 10) counts.shortFunctions++;
            if (functionLineCount > 40) counts.longFunctions++;
        }

        if (maxDepthInFile > counts.maxNestingDepth) counts.maxNestingDepth = maxDepthInFile;
        if (exportCount <= 1) counts.singleExportFiles++;
        else counts.multiExportFiles++;
    }

    counts.avgFunctionLength = functionLengths.length > 0
        ? Math.round(functionLengths.reduce((a, b) => a + b, 0) / functionLengths.length)
        : 0;

    return counts;
}


// ─── Signal → Trait Interpretation ────────────────────────────────────────────

function makeTrait(signal: string, observation: string, examples: string[], confidence: number): Trait {
    const now = new Date().toISOString();
    return { signal, observation, examples, confidence, firstSeen: now, lastSeen: now, observationCount: 1 };
}

function interpretInstincts(s: SignalCounts): Instincts {
    const controlFlow: Trait[] = [];
    const naming: Trait[] = [];
    const structure: Trait[] = [];
    const expressiveness: Trait[] = [];

    // ── Control Flow ──
    const totalBranching = s.earlyReturns + s.nestedElse;
    if (totalBranching > 0) {
        const earlyReturnRatio = s.earlyReturns / totalBranching;
        if (earlyReturnRatio > 0.65) {
            controlFlow.push(makeTrait("early-return-preference",
                `Strongly prefers early returns / guard clauses (${Math.round(earlyReturnRatio * 100)}% of branching patterns).`,
                [`${s.earlyReturns} early returns vs ${s.nestedElse} nested else blocks`], earlyReturnRatio));
        } else if (earlyReturnRatio < 0.35) {
            controlFlow.push(makeTrait("nested-branching-preference",
                `Tends toward nested if/else blocks over early returns (${Math.round((1 - earlyReturnRatio) * 100)}%).`,
                [`${s.nestedElse} nested else vs ${s.earlyReturns} early returns`], 1 - earlyReturnRatio));
        }
    }

    if (s.guardClauses > 10) {
        controlFlow.push(makeTrait("guard-clause-pattern",
            `Uses guard clauses frequently (${s.guardClauses} instances) — validates inputs early and exits.`,
            [`${s.guardClauses} guard clauses across ${s.totalFiles} files`], Math.min(s.guardClauses / 50, 1)));
    }

    const totalIteration = s.forLoops + s.functionalIterators;
    if (totalIteration > 0) {
        const functionalRatio = s.functionalIterators / totalIteration;
        if (functionalRatio > 0.6) {
            controlFlow.push(makeTrait("functional-iteration",
                `Prefers functional iteration (.map/.filter/.reduce) over imperative loops (${Math.round(functionalRatio * 100)}%).`,
                [`${s.functionalIterators} functional vs ${s.forLoops} imperative`], functionalRatio));
        } else if (functionalRatio < 0.3) {
            controlFlow.push(makeTrait("imperative-iteration",
                `Prefers imperative loops (for/while) over functional methods (${Math.round((1 - functionalRatio) * 100)}%).`,
                [`${s.forLoops} imperative vs ${s.functionalIterators} functional`], 1 - functionalRatio));
        }
    }

    const ternaryRatio = s.ifElseBlocks > 0 ? s.ternaries / (s.ternaries + s.ifElseBlocks) : 0;
    if (s.ternaries > 5 && ternaryRatio > 0.2) {
        controlFlow.push(makeTrait("ternary-comfort",
            `Comfortable with ternary expressions (${s.ternaries} uses, ${Math.round(ternaryRatio * 100)}% of conditionals).`,
            [`${s.ternaries} ternaries across codebase`], Math.min(ternaryRatio * 2, 1)));
    }

    // ── Naming ──
    const totalNamingSignals = s.camelCaseVars + s.snakeCaseVars;
    if (totalNamingSignals > 10) {
        const camelRatio = s.camelCaseVars / totalNamingSignals;
        if (camelRatio > 0.7) {
            naming.push(makeTrait("camelCase-naming",
                `Consistently uses camelCase naming (${Math.round(camelRatio * 100)}%).`,
                [`${s.camelCaseVars} camelCase vs ${s.snakeCaseVars} snake_case`], camelRatio));
        } else if (camelRatio < 0.3) {
            naming.push(makeTrait("snake_case-naming",
                `Consistently uses snake_case naming (${Math.round((1 - camelRatio) * 100)}%).`,
                [`${s.snakeCaseVars} snake_case vs ${s.camelCaseVars} camelCase`], 1 - camelRatio));
        } else {
            naming.push(makeTrait("mixed-naming",
                `Uses a mix of camelCase and snake_case — possibly multi-language or inconsistent convention.`,
                [`${s.camelCaseVars} camelCase, ${s.snakeCaseVars} snake_case`], 0.5));
        }
    }

    const verbosityRatio = s.descriptiveNames > 0 ? s.descriptiveNames / (s.descriptiveNames + s.shortNames) : 0.5;
    if (s.shortNames > 20 && verbosityRatio < 0.2) {
        naming.push(makeTrait("terse-naming",
            `Favors short, terse variable names (${s.shortNames} short names found).`,
            [`${s.shortNames} names ≤2 chars, ${s.abbreviations} abbreviations`], Math.min(s.shortNames / 50, 1)));
    } else if (s.descriptiveNames > 10 && verbosityRatio > 0.4) {
        naming.push(makeTrait("descriptive-naming",
            `Favors long, descriptive variable names (${s.descriptiveNames} names ≥20 chars).`,
            [`${s.descriptiveNames} descriptive names found`], Math.min(s.descriptiveNames / 30, 1)));
    }

    // ── Structure ──
    if (s.totalFunctions > 10) {
        if (s.avgFunctionLength < 15) {
            structure.push(makeTrait("small-functions",
                `Writes small, focused functions (avg ${s.avgFunctionLength} lines).`,
                [`${s.shortFunctions} functions <10 lines, ${s.longFunctions} functions >40 lines`], Math.min(s.shortFunctions / s.totalFunctions * 2, 1)));
        } else if (s.avgFunctionLength > 35) {
            structure.push(makeTrait("large-functions",
                `Tends toward larger functions (avg ${s.avgFunctionLength} lines). May prefer keeping related logic together.`,
                [`${s.longFunctions} functions >40 lines out of ${s.totalFunctions} total`], Math.min(s.longFunctions / s.totalFunctions * 2, 1)));
        }
    }

    if (s.maxNestingDepth > 6) {
        structure.push(makeTrait("deep-nesting",
            `Code reaches nesting depth of ${s.maxNestingDepth}. Consider flattening with early returns or extraction.`,
            [`Max brace depth: ${s.maxNestingDepth}`], Math.min(s.maxNestingDepth / 10, 1)));
    }

    if (s.singleExportFiles > s.multiExportFiles * 2) {
        structure.push(makeTrait("single-export-files",
            `Prefers one export per file (${s.singleExportFiles} single-export vs ${s.multiExportFiles} multi-export files).`,
            [], Math.min(s.singleExportFiles / (s.singleExportFiles + s.multiExportFiles), 1)));
    }

    // ── Expressiveness ──
    if (s.totalLines > 0) {
        const commentDensity = s.commentLines / s.totalLines;
        if (commentDensity > 0.15) {
            expressiveness.push(makeTrait("heavy-commenter",
                `Comments heavily (${Math.round(commentDensity * 100)}% of lines are comments).`,
                [`${s.commentLines} comment lines in ${s.totalLines} total`], Math.min(commentDensity * 5, 1)));
        } else if (commentDensity < 0.03 && s.totalLines > 500) {
            expressiveness.push(makeTrait("minimal-comments",
                `Writes minimal comments (${Math.round(commentDensity * 100)}%) — lets code speak for itself.`,
                [`${s.commentLines} comment lines in ${s.totalLines} total`], Math.min((1 - commentDensity) * 0.8, 1)));
        }
    }

    if (s.typeAnnotations > 20) {
        const typeStrictness = s.anyTypes > 0 ? 1 - (s.anyTypes / s.typeAnnotations) : 1;
        expressiveness.push(makeTrait("type-conscious",
            `Uses type annotations extensively (${s.typeAnnotations} annotations, ${s.anyTypes} \`any\` escapes). Strictness: ${Math.round(typeStrictness * 100)}%.`,
            [`${s.typeAnnotations} typed, ${s.anyTypes} any`], typeStrictness));
    }

    if (s.jsdocBlocks > 10) {
        expressiveness.push(makeTrait("jsdoc-documenter",
            `Writes JSDoc documentation blocks (${s.jsdocBlocks} found).`,
            [], Math.min(s.jsdocBlocks / 30, 1)));
    }

    return { controlFlow, naming, structure, expressiveness };
}

function interpretValues(s: SignalCounts): Values {
    const tradeoffs: Trait[] = [];
    const quality: Trait[] = [];
    const complexity: Trait[] = [];

    // ── Quality ──
    if (s.tryCatchBlocks > 5) {
        const errorDensity = s.tryCatchBlocks / Math.max(s.totalFunctions, 1);
        quality.push(makeTrait("error-handling-discipline",
            `Handles errors explicitly (${s.tryCatchBlocks} try/catch blocks, ${Math.round(errorDensity * 100)}% of functions).`,
            [`${s.customErrorClasses} custom error classes`], Math.min(errorDensity * 3, 1)));
    }

    if (s.validationChecks > 5) {
        quality.push(makeTrait("input-validation",
            `Validates inputs with schema libraries (${s.validationChecks} validation patterns found).`,
            [], Math.min(s.validationChecks / 20, 1)));
    }

    if (s.assertStatements > 10) {
        quality.push(makeTrait("assertion-driven",
            `Uses assertions/expectations heavily (${s.assertStatements} found) — likely test-conscious.`,
            [], Math.min(s.assertStatements / 50, 1)));
    }

    // ── Complexity ──
    const abstractionSignals = s.genericTypes + s.abstractClasses + s.interfaceDeclarations;
    const concreteSignals = s.simpleObjects + s.totalFunctions;
    if (abstractionSignals > 10 && concreteSignals > 0) {
        const abstractionRatio = abstractionSignals / (abstractionSignals + concreteSignals);
        if (abstractionRatio > 0.15) {
            complexity.push(makeTrait("abstraction-oriented",
                `Leans toward abstraction (${abstractionSignals} interfaces/generics/abstract classes).`,
                [`${s.interfaceDeclarations} interfaces, ${s.genericTypes} generics, ${s.abstractClasses} abstract classes`],
                Math.min(abstractionRatio * 3, 1)));
        }
    } else if (s.simpleObjects > 20 && abstractionSignals < 5) {
        complexity.push(makeTrait("concrete-pragmatist",
            `Prefers concrete, simple structures over abstractions (${s.simpleObjects} plain objects, few interfaces).`,
            [], Math.min(s.simpleObjects / 50, 1)));
    }

    // ── Tradeoffs ──
    if (s.todoComments > 5) {
        tradeoffs.push(makeTrait("pragmatic-debt-tracker",
            `Leaves TODO/FIXME markers (${s.todoComments} found) — acknowledges tech debt rather than ignoring it.`,
            [], Math.min(s.todoComments / 20, 1)));
    }

    return { tradeoffs, quality, complexity };
}


// ─── Evolution / Merge Logic ──────────────────────────────────────────────────

/** Merge a newly observed trait into an existing trait list, boosting confidence on repeat observations. */
function mergeTraits(existing: Trait[], incoming: Trait[]): Trait[] {
    const merged = [...existing];
    for (const inc of incoming) {
        const match = merged.find(t => t.signal === inc.signal);
        if (match) {
            // Reinforce: boost confidence, update timestamp, increment count
            match.confidence = Math.min(1, match.confidence + 0.1);
            match.lastSeen = inc.lastSeen;
            match.observationCount++;
            match.observation = inc.observation; // update with latest wording
            // Merge examples (keep unique, cap at 5)
            const allExamples = [...new Set([...match.examples, ...inc.examples])];
            match.examples = allExamples.slice(0, 5);
        } else {
            merged.push(inc);
        }
    }

    // Decay: traits not seen in this scan lose a bit of confidence
    const incomingSignals = new Set(incoming.map(t => t.signal));
    for (const trait of merged) {
        if (!incomingSignals.has(trait.signal)) {
            trait.confidence = Math.max(0, trait.confidence - 0.05);
        }
    }

    // Remove traits that have decayed to zero
    return merged.filter(t => t.confidence > 0);
}

/** Detect transitions: traits that appeared or disappeared between scans. */
function detectTransitions(oldTraits: Trait[], newTraits: Trait[]): Array<{ from: string; to: string; when: string; confidence: number }> {
    const transitions: Array<{ from: string; to: string; when: string; confidence: number }> = [];
    const now = new Date().toISOString();

    const oldSignals = new Set(oldTraits.map(t => t.signal));
    const newSignals = new Set(newTraits.map(t => t.signal));

    // New traits that weren't there before
    for (const t of newTraits) {
        if (!oldSignals.has(t.signal) && t.confidence > 0.5) {
            transitions.push({ from: "(none)", to: t.signal, when: now, confidence: t.confidence });
        }
    }

    // Old traits that disappeared
    for (const t of oldTraits) {
        if (!newSignals.has(t.signal) && t.confidence > 0.5) {
            transitions.push({ from: t.signal, to: "(abandoned)", when: now, confidence: t.confidence });
        }
    }

    return transitions;
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Scan a codebase and evolve the Behavioral DNA.
 * This is the "soul builder" — it observes code, infers personality traits,
 * and merges them with the existing DNA, tracking growth over time.
 */
export function learnFromCodebase(projectPath: string): { dna: BehavioralDNA; newTraitsCount: number; reinforcedCount: number; decayedCount: number } {
    if (!existsSync(projectPath)) {
        throw new Error(`Project path does not exist: ${projectPath}`);
    }

    const dna = loadDNA();
    const signals = analyzeCodeSignals(projectPath);

    if (signals.totalFiles === 0) {
        throw new Error(`No code files found in ${projectPath}. Supported extensions: ${CODE_EXTENSIONS.join(", ")}`);
    }

    const newInstincts = interpretInstincts(signals);
    const newValues = interpretValues(signals);

    // Count changes before merge
    const allOldTraits = [
        ...dna.instincts.controlFlow, ...dna.instincts.naming,
        ...dna.instincts.structure, ...dna.instincts.expressiveness,
        ...dna.values.tradeoffs, ...dna.values.quality, ...dna.values.complexity,
    ];
    const allNewTraits = [
        ...newInstincts.controlFlow, ...newInstincts.naming,
        ...newInstincts.structure, ...newInstincts.expressiveness,
        ...newValues.tradeoffs, ...newValues.quality, ...newValues.complexity,
    ];

    const oldSignals = new Set(allOldTraits.map(t => t.signal));
    const newSignals = new Set(allNewTraits.map(t => t.signal));
    const newTraitsCount = [...newSignals].filter(s => !oldSignals.has(s)).length;
    const reinforcedCount = [...newSignals].filter(s => oldSignals.has(s)).length;

    // Detect transitions before merge
    const transitions = detectTransitions(allOldTraits, allNewTraits);

    // Merge
    dna.instincts.controlFlow = mergeTraits(dna.instincts.controlFlow, newInstincts.controlFlow);
    dna.instincts.naming = mergeTraits(dna.instincts.naming, newInstincts.naming);
    dna.instincts.structure = mergeTraits(dna.instincts.structure, newInstincts.structure);
    dna.instincts.expressiveness = mergeTraits(dna.instincts.expressiveness, newInstincts.expressiveness);
    dna.values.tradeoffs = mergeTraits(dna.values.tradeoffs, newValues.tradeoffs);
    dna.values.quality = mergeTraits(dna.values.quality, newValues.quality);
    dna.values.complexity = mergeTraits(dna.values.complexity, newValues.complexity);

    // Track growth
    const snapshot: GrowthSnapshot = {
        date: new Date().toISOString(),
        projectPath: relative(homedir(), projectPath) || projectPath,
        traits: allNewTraits.map(t => ({ signal: t.signal, confidence: t.confidence })),
    };
    dna.growth.snapshots.push(snapshot);
    // Keep last 50 snapshots
    if (dna.growth.snapshots.length > 50) {
        dna.growth.snapshots = dna.growth.snapshots.slice(-50);
    }
    dna.growth.transitions.push(...transitions);
    // Keep last 100 transitions
    if (dna.growth.transitions.length > 100) {
        dna.growth.transitions = dna.growth.transitions.slice(-100);
    }

    // Count decayed
    const allMergedTraits = [
        ...dna.instincts.controlFlow, ...dna.instincts.naming,
        ...dna.instincts.structure, ...dna.instincts.expressiveness,
        ...dna.values.tradeoffs, ...dna.values.quality, ...dna.values.complexity,
    ];
    const decayedCount = allOldTraits.length - allMergedTraits.filter(t => oldSignals.has(t.signal)).length;

    dna.scanCount++;
    saveDNA(dna);

    return { dna, newTraitsCount, reinforcedCount, decayedCount: Math.max(0, decayedCount) };
}

// ─── Formatting ───────────────────────────────────────────────────────────────

function formatTraitList(traits: Trait[]): string {
    if (traits.length === 0) return "_No patterns detected yet._\n";
    return traits
        .sort((a, b) => b.confidence - a.confidence)
        .map(t => {
            const bar = "█".repeat(Math.round(t.confidence * 10)) + "░".repeat(10 - Math.round(t.confidence * 10));
            const seen = t.observationCount > 1 ? ` (seen ${t.observationCount}×)` : "";
            return `- \`${t.signal}\` [${bar}] ${Math.round(t.confidence * 100)}%${seen}\n  ${t.observation}`;
        })
        .join("\n");
}

export function formatBehavioralDNA(dna: BehavioralDNA): string {
    const lines: string[] = [
        "# 🧬 Behavioral DNA",
        `_Last updated: ${dna.lastUpdated} · Scans: ${dna.scanCount}_`,
        "",
        "## Layer 1: Instincts — How You Reflexively Code",
        "",
        "### Control Flow",
        formatTraitList(dna.instincts.controlFlow),
        "### Naming",
        formatTraitList(dna.instincts.naming),
        "### Structure",
        formatTraitList(dna.instincts.structure),
        "### Expressiveness",
        formatTraitList(dna.instincts.expressiveness),
        "",
        "## Layer 2: Values — What You Optimize For",
        "",
        "### Quality Signals",
        formatTraitList(dna.values.quality),
        "### Complexity Preferences",
        formatTraitList(dna.values.complexity),
        "### Tradeoff Patterns",
        formatTraitList(dna.values.tradeoffs),
    ];

    // Growth section
    if (dna.growth.transitions.length > 0) {
        lines.push("", "## Layer 3: Growth — How You're Evolving", "");
        const recent = dna.growth.transitions.slice(-10);
        for (const t of recent) {
            if (t.from === "(none)") {
                lines.push(`- 🌱 **Adopted** \`${t.to}\` (${t.when.split("T")[0]})`);
            } else if (t.to === "(abandoned)") {
                lines.push(`- 🍂 **Dropped** \`${t.from}\` (${t.when.split("T")[0]})`);
            } else {
                lines.push(`- 🔄 **Shifted** \`${t.from}\` → \`${t.to}\` (${t.when.split("T")[0]})`);
            }
        }
    }

    if (dna.growth.snapshots.length > 1) {
        const first = dna.growth.snapshots[0];
        const last = dna.growth.snapshots[dna.growth.snapshots.length - 1];
        lines.push("", `_Tracking evolution from ${first.date.split("T")[0]} to ${last.date.split("T")[0]} across ${dna.growth.snapshots.length} scans._`);
    }

    return lines.join("\n");
}

// ─── Developer Manifesto Generator ────────────────────────────────────────────

import type { CorrectionPattern } from "./correction-map.js";
import type { Decision } from "./decision-journal.js";
import type { MemoryEntry } from "./twin-memory.js";

/**
 * Generate a narrative "Developer Manifesto" — a one-page document that
 * describes who you are as a developer, written in second person.
 * This isn't a config file. It's a soul.
 */
export function generateManifesto(
    dna: BehavioralDNA,
    memories: MemoryEntry[],
    patterns: CorrectionPattern[],
    decisions: Decision[],
    developerName: string | null,
): string {
    const name = developerName || "Developer";
    const lines: string[] = [
        `# The Developer Manifesto of ${name}`,
        `_Auto-generated from ${dna.scanCount} code scans, ${memories.length} memories, ${patterns.length} correction patterns, and ${decisions.length} recorded decisions._`,
        "",
    ];

    // ── Opening — Who you are ──
    lines.push("## Who You Are");
    lines.push("");

    const allTraits = [
        ...dna.instincts.controlFlow, ...dna.instincts.naming,
        ...dna.instincts.structure, ...dna.instincts.expressiveness,
        ...dna.values.quality, ...dna.values.complexity, ...dna.values.tradeoffs,
    ].filter(t => t.confidence > 0.5).sort((a, b) => b.confidence - a.confidence);

    if (allTraits.length === 0 && memories.length === 0) {
        lines.push("_Not enough data yet. Run `learn_from_codebase` on your projects and record some memories to build your manifesto._");
        return lines.join("\n");
    }

    // Build narrative paragraphs from traits
    const instinctNarrative = buildInstinctNarrative(dna);
    if (instinctNarrative) {
        lines.push(instinctNarrative, "");
    }

    const valuesNarrative = buildValuesNarrative(dna);
    if (valuesNarrative) {
        lines.push(valuesNarrative, "");
    }

    // ── Your Principles — from explicit memories ──
    const preferences = memories.filter(m => m.type === "preference" && m.confidence !== "low");
    const mistakes = memories.filter(m => m.type === "mistake");
    if (preferences.length > 0 || mistakes.length > 0) {
        lines.push("## Your Principles");
        lines.push("");
        if (preferences.length > 0) {
            lines.push("Things you believe in:");
            for (const p of preferences.slice(0, 8)) {
                lines.push(`- ${p.content}`);
            }
            lines.push("");
        }
        if (mistakes.length > 0) {
            lines.push("Lines you don't cross:");
            for (const m of mistakes.slice(0, 5)) {
                lines.push(`- Never: ${m.content}`);
            }
            lines.push("");
        }
    }

    // ── Your Relationship with AI — from correction patterns ──
    if (patterns.length > 0) {
        lines.push("## How You Work with AI");
        lines.push("");
        const highConf = patterns.filter(p => p.confidence > 0.5);
        if (highConf.length > 0) {
            lines.push("When an AI writes code for you, here's what you consistently change:");
            lines.push("");
            for (const p of highConf.slice(0, 6)) {
                lines.push(`- **${p.category}**: ${p.rule}`);
            }
            lines.push("");
        }
        const topCat = getTopCorrectionCategory(patterns);
        if (topCat) {
            lines.push(`You correct AI most often on **${topCat}** — this is where your standards are highest and where agents should be most careful.`);
            lines.push("");
        }
    }

    // ── Your Decision-Making Style — from decision journal ──
    const activeDecisions = decisions.filter(d => d.status === "active");
    if (activeDecisions.length > 0) {
        lines.push("## How You Make Decisions");
        lines.push("");
        const domains = [...new Set(activeDecisions.map(d => d.domain))];
        lines.push(`You've recorded ${activeDecisions.length} active decisions across ${domains.length} domain(s): ${domains.slice(0, 6).join(", ")}.`);
        lines.push("");

        // Extract decision-making style
        const avgOptions = activeDecisions.reduce((sum, d) => sum + d.options.length, 0) / activeDecisions.length;
        if (avgOptions > 3) {
            lines.push("You're thorough — you typically consider multiple options before committing. You weigh tradeoffs carefully.");
        } else if (avgOptions <= 2) {
            lines.push("You're decisive — you tend to narrow down to two options quickly and pick based on clear criteria.");
        }

        const withConsequences = activeDecisions.filter(d => d.consequences.length > 0);
        if (withConsequences.length > activeDecisions.length * 0.5) {
            lines.push("You explicitly acknowledge tradeoffs in your decisions — you don't pretend there are no downsides.");
        }
        lines.push("");
    }

    // ── Growth Story ──
    if (dna.growth.transitions.length > 0) {
        lines.push("## How You're Growing");
        lines.push("");
        const adopted = dna.growth.transitions.filter(t => t.from === "(none)").slice(-5);
        const dropped = dna.growth.transitions.filter(t => t.to === "(abandoned)").slice(-5);

        if (adopted.length > 0) {
            lines.push("Recently adopted:");
            for (const t of adopted) {
                lines.push(`- Started using \`${t.to}\` (${t.when.split("T")[0]})`);
            }
            lines.push("");
        }
        if (dropped.length > 0) {
            lines.push("Recently moved away from:");
            for (const t of dropped) {
                lines.push(`- Stopped \`${t.from}\` (${t.when.split("T")[0]})`);
            }
            lines.push("");
        }
    }

    // ── Closing ──
    lines.push("---");
    lines.push(`_This manifesto is a living document. It evolves every time you scan a codebase, record a decision, or correct an agent. Last updated: ${dna.lastUpdated.split("T")[0]}._`);

    return lines.join("\n");
}

function buildInstinctNarrative(dna: BehavioralDNA): string | null {
    const parts: string[] = [];

    const cf = dna.instincts.controlFlow.filter(t => t.confidence > 0.5);
    const nm = dna.instincts.naming.filter(t => t.confidence > 0.5);
    const st = dna.instincts.structure.filter(t => t.confidence > 0.5);
    const ex = dna.instincts.expressiveness.filter(t => t.confidence > 0.5);

    if (cf.length === 0 && nm.length === 0 && st.length === 0 && ex.length === 0) return null;

    // Control flow
    for (const t of cf) {
        if (t.signal === "early-return-preference") parts.push("You write with early returns and guard clauses — you get the edge cases out of the way first, then write the happy path clean.");
        else if (t.signal === "functional-iteration") parts.push("You reach for `.map()` and `.filter()` over `for` loops. Functional iteration is your default.");
        else if (t.signal === "imperative-iteration") parts.push("You prefer imperative loops — `for` and `while` are your workhorses. You like explicit control over iteration.");
        else if (t.signal === "guard-clause-pattern") parts.push("You validate inputs early and exit fast. Guard clauses are a reflex.");
        else if (t.signal === "ternary-comfort") parts.push("You're comfortable with ternaries for simple conditionals — you don't shy away from inline expressions.");
    }

    // Naming
    for (const t of nm) {
        if (t.signal === "camelCase-naming") parts.push("You name things in camelCase consistently.");
        else if (t.signal === "snake_case-naming") parts.push("You prefer snake_case naming.");
        else if (t.signal === "descriptive-naming") parts.push("You favor descriptive, self-documenting names — you'd rather a name be long and clear than short and cryptic.");
        else if (t.signal === "terse-naming") parts.push("You keep variable names short and tight. You trust context to fill in meaning.");
    }

    // Structure
    for (const t of st) {
        if (t.signal === "small-functions") parts.push("You write small, focused functions. Each one does one thing.");
        else if (t.signal === "large-functions") parts.push("You tend to keep related logic together in longer functions rather than splitting into many small ones.");
        else if (t.signal === "single-export-files") parts.push("You prefer one export per file — clean module boundaries.");
    }

    // Expressiveness
    for (const t of ex) {
        if (t.signal === "minimal-comments") parts.push("You let code speak for itself — comments are rare and intentional.");
        else if (t.signal === "heavy-commenter") parts.push("You comment generously — you write for the next person reading the code.");
        else if (t.signal === "type-conscious") parts.push("You take types seriously. Strict typing isn't optional for you.");
        else if (t.signal === "jsdoc-documenter") parts.push("You document your public APIs with JSDoc blocks.");
    }

    if (parts.length === 0) return null;
    return parts.join(" ");
}

function buildValuesNarrative(dna: BehavioralDNA): string | null {
    const parts: string[] = [];

    const allValues = [...dna.values.quality, ...dna.values.complexity, ...dna.values.tradeoffs]
        .filter(t => t.confidence > 0.5);

    if (allValues.length === 0) return null;

    for (const t of allValues) {
        if (t.signal === "error-handling-discipline") parts.push("You handle errors explicitly — you don't let exceptions fly silently.");
        else if (t.signal === "input-validation") parts.push("You validate inputs at the boundary. Schema validation is a habit, not an afterthought.");
        else if (t.signal === "abstraction-oriented") parts.push("You lean toward abstraction — interfaces and generics are tools you reach for naturally.");
        else if (t.signal === "concrete-pragmatist") parts.push("You prefer concrete, simple structures. You'd rather have a plain object than an abstract class hierarchy.");
        else if (t.signal === "pragmatic-debt-tracker") parts.push("You leave TODO markers — you acknowledge tech debt honestly rather than pretending it doesn't exist.");
        else if (t.signal === "assertion-driven") parts.push("You write assertions and tests. Code without verification makes you uncomfortable.");
    }

    if (parts.length === 0) return null;
    return parts.join(" ");
}

function getTopCorrectionCategory(patterns: CorrectionPattern[]): string | null {
    if (patterns.length === 0) return null;
    const catMap = new Map<string, number>();
    for (const p of patterns) {
        catMap.set(p.category, (catMap.get(p.category) ?? 0) + p.correctionIds.length);
    }
    let top = "";
    let topCount = 0;
    for (const [cat, count] of catMap) {
        if (count > topCount) { top = cat; topCount = count; }
    }
    return top || null;
}
