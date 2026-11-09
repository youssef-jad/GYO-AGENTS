import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const npm = process.env.npm_execpath;
const git = (cwd, ...args) => execFileSync("git", args, { cwd, stdio: "pipe" });

test("installed package release checks", { timeout: 180_000 }, async t => {
    const root = mkdtempSync(join(tmpdir(), "gyo-package-test-"));
    const clients = [];
    t.after(async () => {
        await Promise.allSettled(clients.map(client => client.close()));
        rmSync(root, { recursive: true, force: true });
    });

    const installRoot = join(root, "install");
    const dataRoot = join(root, "data");
    mkdirSync(installRoot);
    mkdirSync(dataRoot);
    const packageInfo = JSON.parse(execFileSync(process.execPath, [
        npm, "pack", "--json", "--pack-destination", root,
    ], { cwd: packageRoot, encoding: "utf-8", timeout: 60_000 }))[0];
    execFileSync(process.execPath, [
        npm, "install", "--ignore-scripts", "--no-audit", "--no-fund", join(root, packageInfo.filename),
    ], { cwd: installRoot, stdio: "pipe", timeout: 60_000 });

    const memoryPath = join(dataRoot, "twin-memory.json");
    const date = new Date().toISOString();
    writeFileSync(memoryPath, JSON.stringify({
        version: 1, developerName: "Fixture",
        memories: [{
            id: "legacy-id", type: "preference", topic: "legacy", content: "legacy-global-marker",
            projectScope: null, tags: [], createdAt: date, updatedAt: date, useCount: 0,
            lastUsedAt: date, confidence: "high",
        }],
    }));

    const installedEntry = join(installRoot, "node_modules", packageInfo.name, "dist", "index.js");

    async function connect(name) {
        const client = new Client({ name, version: "1.0.0" });
        clients.push(client);
        await client.connect(new StdioClientTransport({
            command: process.execPath,
            args: [installedEntry],
            cwd: root,
            env: { GYO_AGENTS_DATA_DIR: dataRoot },
            stderr: "pipe",
        }));
        return client;
    }

    const [first, second] = await Promise.all([connect("client-a"), connect("client-b")]);
    async function call(client, name, args = {}) {
        const result = await client.callTool({ name, arguments: args });
        const output = result.content.map(item => item.text).join("\n");
        assert.equal(result.isError ?? false, false, `${name}: ${output}`);
        return output;
    }

    await t.test("all 11 templates are available from the installed package", async () => {
        const listed = (await first.listTools()).tools.filter(tool => tool.name.startsWith("get_prompt_"));
        assert.equal(listed.length, 11);
        const { contents } = await first.readResource({ uri: "gyo-agents://tools" });
        const manifest = JSON.parse(contents[0].text);
        assert.equal(manifest.totalTools, 11);
        assert.deepEqual(manifest.tools.map(tool => tool.mcpToolName).sort(), listed.map(tool => tool.name).sort());
        for (const tool of listed) {
            const prompt = await call(first, tool.name, { includeUsageHints: false });
            assert.match(prompt, /generate/i, tool.name);
            assert.ok(prompt.length > 1000, tool.name);
            if (tool.name === "get_prompt_claudecode") {
                assert.doesNotMatch(prompt, /Bash\((?:make|php artisan)\*\)/);
            }
        }
    });

    const projectA = join(root, "project-a");
    const projectB = join(root, "project-b");
    mkdirSync(projectA);
    mkdirSync(projectB);

    await t.test("two active clients preserve concurrent writes, deletes, and legacy data", async () => {
        const remember = (client, topic, content, projectScope) =>
            call(client, "memorize", { type: "preference", topic, content, projectScope });
        const search = (client, projectScope) => call(client, "search_memory", { query: "", projectScope });

        const writes = Array.from({ length: 12 }, (_, i) =>
            remember(i % 2 === 0 ? first : second, `note-${i}`, `concurrent-marker-${i}-end`)
        );
        await Promise.all(writes);
        for (const client of [first, second]) {
            const output = await search(client);
            for (let i = 0; i < writes.length; i++) assert.match(output, new RegExp(`concurrent-marker-${i}-end`));
            assert.match(output, /legacy-global-marker/);
        }

        const [savedA, savedB] = await Promise.all([
            remember(first, "scope", "same-scoped-marker", projectA),
            remember(second, "scope", "same-scoped-marker", projectB),
        ]);
        const memoryId = result => result.match(/^ID: (.+)$/m)[1];
        assert.notEqual(memoryId(savedA), memoryId(savedB));
        assert.equal(memoryId(await remember(second, "scope", "same-scoped-marker", projectA + "/")), memoryId(savedA));
        await Promise.all([
            call(first, "forget_memory", { id: memoryId(savedA) }),
            remember(second, "later", "later-global-marker"),
        ]);

        assert.doesNotMatch(await search(second, projectA), /same-scoped-marker/);
        assert.match(await search(first, projectB), /same-scoped-marker/);
        assert.match(await search(first), /later-global-marker/);
        assert.doesNotMatch(await search(first), /same-scoped-marker/);
    });

    await t.test("automatic context includes global and current project entries only", async () => {
        await call(second, "memorize", {
            type: "preference", topic: "private topic", content: "project-b-private-marker", projectScope: projectB,
        });
        const result = await call(first, "memorize", {
            type: "preference", topic: "private topic", content: "project-a-private-marker", projectScope: projectA,
        });
        assert.doesNotMatch(result, /project-b-private-marker/);
        await Promise.all([first, second].map((client, i) => call(client, "record_decision", {
            context: "Storage boundary", domain: "data", chosen: `project-decision-${i}`, reasoning: "Fixture rationale",
            options: [{ name: "Fixture", prosConsidered: [], consConsidered: [] }],
            projectScope: i === 0 ? projectA : projectB,
        })));
        const correction = {
            category: "style", context: "Fixture", agentSuggested: "unsafe sample snippet", developerChose: "safe sample snippet",
            lesson: "project-b-correction-marker should never appear elsewhere", language: "typescript", projectScope: projectB,
        };
        await Promise.all([first, second].map(client => call(client, "record_correction", correction)));
        // The system prompt surfaces only patterns above its confidence threshold.
        const reinforced = await call(first, "record_correction", correction);
        assert.match(reinforced, /Occurrences: 3/);

        for (const [tool, args] of [
            ["get_twin_system_prompt", { projectPath: projectA }],
            ["get_digital_twin_profile", { projectPath: projectA }],
            ["generate_full_agent_context", { projectPath: projectA }],
            ["generate_manifesto", { projectScope: projectA, outputFormat: "json" }],
        ]) {
            const output = await call(first, tool, args);
            assert.match(output, /project-a-private-marker/);
            assert.match(output, /legacy-global-marker/);
            assert.doesNotMatch(output, /project-b-private-marker|project-decision-1|project-b-correction-marker/);
        }
        const projectBPrompt = await call(first, "get_twin_system_prompt", { projectPath: projectB });
        assert.match(projectBPrompt, /project-b-private-marker/);
        assert.match(projectBPrompt, /project-b-correction-marker/);
        assert.match(projectBPrompt, /project-decision-1/);
        assert.doesNotMatch(projectBPrompt, /project-a-private-marker|project-decision-0/);
        const { contents } = await second.readResource({ uri: "gyo-agents://twin-system-prompt" });
        assert.match(contents[0].text, /legacy-global-marker/);
        assert.doesNotMatch(contents[0].text, /project-[ab]-private-marker|project-decision-|project-b-correction-marker/);
    });

    await t.test("shell metacharacters remain literal and scans stay in the project", async () => {
        git(projectA, "init", "--quiet");
        git(projectA, "config", "--local", "user.name", "Fixture");
        git(projectA, "config", "--local", "user.email", "fixture@example.test");
        git(projectA, "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", "commit", "--allow-empty", "-qm", "Fixture");
        const style = await call(first, "analyze_git_style_on_the_fly", { projectPath: projectA, outputFormat: "json" });
        assert.equal(JSON.parse(style).totalCommits, 1);
        git(projectA, "config", "--local", "user.email", '$(touch git-marker; printf fixture@example.test)');
        const literal = await call(first, "analyze_git_style_on_the_fly", { projectPath: projectA, outputFormat: "json" });
        assert.equal(JSON.parse(literal).totalCommits, 0);
        assert.equal(existsSync(join(projectA, "git-marker")), false);

        const app = join(projectA, "app", "Orders");
        mkdirSync(app, { recursive: true });
        writeFileSync(join(app, "Orders.php"), "<?php\nnamespace App\\Orders;\nreturn response()->json('inside-marker');");
        mkdirSync(join(projectA, "routes"));
        writeFileSync(join(projectA, "routes", "api.php"), "<?php\nOrders::register();");
        writeFileSync(join(projectB, "outside.php"), "<?php\nreturn response()->json('outside-marker');");
        symlinkSync(projectB, join(projectA, "external"), "dir");
        const domain = await call(first, "get_domain_context", { projectPath: projectA, domain: "Orders", outputFormat: "json" });
        assert.deepEqual(JSON.parse(domain).routeFiles, [join("routes", "api.php")]);
        assert.deepEqual(JSON.parse(domain).namespaces, ["App\\Orders"]);
        await call(first, "get_domain_context", { projectPath: projectA, domain: "$(touch domain-marker)" });
        assert.equal(existsSync(join(projectA, "domain-marker")), false);

        const scan = await call(first, "validate_api_response", { projectPath: projectA, scope: "app" });
        assert.match(scan, /inside-marker/);
        assert.doesNotMatch(await call(first, "validate_api_response", { projectPath: projectA }), /outside-marker/);
        for (const scope of ["../project-b", "external"]) {
            for (const name of ["validate_api_response", "check_cache_usage"]) {
                const result = await first.callTool({ name, arguments: { projectPath: projectA, scope } });
                assert.equal(result.isError, true, `${name} accepted ${scope}`);
            }
        }

        const literalPath = join(root, 'project-a$(touch watcher-marker)');
        mkdirSync(literalPath);
        await call(first, "snapshot_config", { projectPath: literalPath });
        assert.equal(existsSync(join(root, "watcher-marker")), false);
    });

    await t.test("local and team guardrails agree across MCP, hooks, the working tree and CI", async () => {
        const project = join(root, "guardrail-project");
        const otherProject = join(root, "guardrail-other");
        const service = "app/Services/Billing/New service.php";
        const controller = "app/Http/Controller.php";
        const forbiddenLiteral = "use Illuminate\\Support\\Facades\\Cache;";
        const lesson = "Use the project cache wrapper in service code.";
        const original = `<?php\n// existing: ${forbiddenLiteral}\n\n// remove: ${forbiddenLiteral}\n`;

        for (const path of [project, otherProject]) {
            mkdirSync(path);
            git(path, "init", "--quiet");
        }
        mkdirSync(join(project, "app", "Services", "Billing"), { recursive: true });
        mkdirSync(join(project, "app", "Http"));
        writeFileSync(join(project, service), original);
        writeFileSync(join(project, controller), "<?php\n");
        git(project, "add", "app");
        git(project, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test",
            "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", "commit", "-qm", "Fixture");

        const cli = (cwd, args, input) => spawnSync(process.execPath, [installedEntry, "guardrail", ...args], {
            cwd, input, encoding: "utf-8", timeout: 10_000,
            env: { ...process.env, GYO_AGENTS_DATA_DIR: dataRoot },
        });
        const diff = () => git(project, "-c", "core.quotePath=false", "diff", "--no-color", "--no-ext-diff",
            "--no-textconv", "--src-prefix=a/", "--dst-prefix=b/", "HEAD").toString("utf-8");
        const recorded = await call(first, "record_correction", {
            category: "pattern", context: "Cache in services", agentSuggested: forbiddenLiteral,
            developerChose: "Use the project cache wrapper", lesson, language: "php", projectScope: project,
        });
        const correctionId = recorded.match(/^ID: (.+)$/m)[1];
        const proposal = { projectPath: project, correctionId, pathPattern: "app/Services/**/*.php", forbiddenLiteral };
        const rule = JSON.parse(await call(first, "propose_guardrail", proposal));
        assert.equal(rule.correctionId, correctionId);
        assert.equal(rule.approvedAt, null);
        assert.equal(JSON.parse(await call(second, "propose_guardrail", proposal)).id, rule.id);
        assert.deepEqual(JSON.parse(cli(project, ["list"]).stdout).map(draft => draft.id), [rule.id]);
        assert.deepEqual(JSON.parse(cli(project, ["export"]).stdout).rules, []);
        assert.equal(cli(otherProject, ["approve", rule.id]).status, 2);

        const wrongScope = await second.callTool({
            name: "propose_guardrail", arguments: { ...proposal, projectPath: otherProject },
        });
        assert.equal(wrongScope.isError, true);

        const taskRules = async (projectPath, paths = [service]) =>
            JSON.parse(await call(second, "get_task_rules", { projectPath, paths })).rules;
        const check = async (projectPath, patch) => JSON.parse(await call(second, "check_changes", { projectPath, patch }));
        writeFileSync(join(project, service), `<?php\n// existing: ${forbiddenLiteral}\n\n${forbiddenLiteral}`);
        writeFileSync(join(project, controller), `<?php\n${forbiddenLiteral}\n`);
        const patch = diff();
        assert.ok(patch.includes("diff --git"));
        assert.deepEqual(await taskRules(project), []);
        assert.equal((await check(project, patch)).violationCount, 0);

        const approval = cli(project, ["approve", rule.id]);
        assert.equal(approval.status, 0, approval.stderr);
        assert.ok(JSON.parse(approval.stdout).approvedAt);
        assert.deepEqual((await taskRules(project)).map(active => active.id), [rule.id]);
        assert.equal((await taskRules(project, ["app/Services/Top.php"])).length, 1);
        assert.deepEqual(await taskRules(project, [controller]), []);
        assert.deepEqual(await taskRules(otherProject), []);
        assert.equal((await check(otherProject, patch)).violationCount, 0);

        const expected = [{ ruleId: rule.id, path: service, line: 4, lesson }];
        const rejected = await check(project, patch);
        assert.equal(rejected.violationCount, 1);
        assert.deepEqual(rejected.violations, expected);
        const checked = cli(project, ["check"], patch);
        assert.equal(checked.status, 1, checked.stderr);
        assert.deepEqual(JSON.parse(checked.stdout), rejected);

        const hook = (cwd, active = false) => {
            const output = cli(project, ["hook"], JSON.stringify({
                cwd, hook_event_name: "Stop", stop_hook_active: active,
            }));
            assert.equal(output.status, 0, output.stderr);
            return JSON.parse(output.stdout);
        };
        const blocked = hook(join(project, "app", "Services"));
        assert.equal(blocked.decision, "block");
        assert.ok(blocked.reason.includes(`${service}:4 [${rule.id}]`));
        const unresolved = hook(project, true);
        assert.equal(unresolved.decision, undefined);
        assert.match(unresolved.systemMessage, /found 1 violation/);
        assert.deepEqual(hook(otherProject), {});

        const exported = cli(project, ["export"]);
        assert.equal(exported.status, 0, exported.stderr);
        assert.equal(JSON.parse(exported.stdout).rules[0].projectPath, undefined);
        const ruleFile = join(root, "exported-guardrails.json");
        writeFileSync(ruleFile, exported.stdout);
        const portable = cli(otherProject, ["check", "--rules", ruleFile], patch);
        assert.equal(portable.status, 1, portable.stderr);
        assert.deepEqual(JSON.parse(portable.stdout), rejected);

        writeFileSync(join(project, service), `<?php\n// existing: ${forbiddenLiteral}\n\nuse App\\CacheWrapper;\n`);
        const fixed = cli(project, ["check"], diff());
        assert.equal(fixed.status, 0, fixed.stderr);
        assert.equal(JSON.parse(fixed.stdout).violationCount, 0);
        assert.deepEqual(hook(project, true), {});
        const incomplete = cli(project, ["check"], patch.slice(0, patch.lastIndexOf("+")));
        assert.equal(incomplete.status, 2, incomplete.stdout);
        assert.equal(cli(project, ["remove", rule.id]).status, 0);
        assert.deepEqual(await taskRules(project), []);

        const policyPath = ".gyo/guardrails.json";
        mkdirSync(join(project, ".gyo"));
        writeFileSync(join(project, policyPath), exported.stdout);
        writeFileSync(join(project, ".gitignore"), "ignored.php\n");
        git(project, "add", "--", policyPath, ".gitignore");
        assert.deepEqual(await taskRules(project), []);
        git(project, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test",
            "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", "commit", "-qm", "Share team policy");

        const teammate = join(root, "teammate-checkout");
        git(root, "clone", "--quiet", "--", project, teammate);
        const teammateProfile = join(root, "teammate-profile");
        const teammateCli = (args, input) => spawnSync(process.execPath, [installedEntry, "guardrail", ...args], {
            cwd: teammate, input, encoding: "utf-8", timeout: 10_000,
            env: { ...process.env, GYO_AGENTS_DATA_DIR: teammateProfile },
        });
        assert.deepEqual((await taskRules(teammate)).map(({ id, source }) => ({ id, source })), [
            { id: rule.id, source: "team" },
        ]);
        assert.deepEqual(JSON.parse(teammateCli(["export"]).stdout).rules, []);
        assert.deepEqual(JSON.parse(teammateCli(["list"]).stdout).map(active => active.source), ["team"]);

        const newService = "app/Services/Billing/Untracked service.php";
        const teamFinding = { ruleId: rule.id, path: newService, line: 2, lesson };
        writeFileSync(join(teammate, newService), `<?php\n${forbiddenLiteral}`);
        writeFileSync(join(teammate, "app/Services/ignored.php"), forbiddenLiteral);
        writeFileSync(join(teammate, "app/Services/binary.php"), `\0${forbiddenLiteral}`);
        const outside = join(root, "outside-guardrail.php");
        writeFileSync(outside, forbiddenLiteral);
        symlinkSync(outside, join(teammate, "app/Services/link.php"));
        writeFileSync(join(teammate, policyPath), '{"version":1,"rules":[]}');
        git(teammate, "add", "--", policyPath);

        const index = readFileSync(join(teammate, ".git", "index"));
        const working = teammateCli(["check", "--working-tree"]);
        assert.equal(working.status, 1, working.stderr);
        assert.deepEqual(JSON.parse(working.stdout).violations, [teamFinding]);
        const teamHook = teammateCli(["hook"], JSON.stringify({
            cwd: teammate, hook_event_name: "Stop", stop_hook_active: false,
        }));
        assert.equal(teamHook.status, 0, teamHook.stderr);
        assert.equal(JSON.parse(teamHook.stdout).decision, "block");
        assert.match(JSON.parse(teamHook.stdout).reason, /Untracked service.php:2/);
        assert.deepEqual(readFileSync(join(teammate, ".git", "index")), index);

        git(teammate, "add", "--", newService);
        const teamPatch = git(teammate, "-c", "core.quotePath=false", "diff", "--no-color",
            "--no-ext-diff", "--no-textconv", "--src-prefix=a/", "--dst-prefix=b/", "HEAD", "--").toString("utf-8");
        const ci = teammateCli(["check", "--rules", ruleFile], teamPatch);
        assert.equal(ci.status, 1, ci.stderr);
        assert.deepEqual(JSON.parse(ci.stdout), JSON.parse(working.stdout));
        assert.deepEqual((await check(teammate, teamPatch)).violations, [teamFinding]);

        writeFileSync(join(teammate, newService), "<?php\nuse App\\CacheWrapper;\n");
        const cleaned = teammateCli(["check", "--working-tree"]);
        assert.equal(cleaned.status, 0, cleaned.stderr);
        assert.equal(JSON.parse(cleaned.stdout).violationCount, 0);

        writeFileSync(join(teammate, policyPath), "{ broken JSON");
        git(teammate, "add", "--", policyPath);
        git(teammate, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test",
            "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", "commit", "-qm", "Invalid team policy");
        const invalid = teammateCli(["check", "--working-tree"]);
        assert.equal(invalid.status, 2, invalid.stdout);
        assert.match(invalid.stderr, /Invalid committed \.gyo\/guardrails\.json/);
    });

    await t.test("malformed existing storage is preserved and writers fail closed", async () => {
        const broken = '{"version":1,"memories":';
        writeFileSync(memoryPath, broken);
        const failed = await second.callTool({
            name: "memorize",
            arguments: { type: "preference", topic: "fixture", content: "fixture" },
        });
        assert.equal(failed.isError, true);
        assert.equal(readFileSync(memoryPath, "utf-8"), broken);
        assert.equal(existsSync(memoryPath + ".lock"), false);
    });
});
