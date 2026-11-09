import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export async function relayChecks(t, { root, first, second, connect }) {
    const repo = join(root, "relay-project");
    const other = join(root, "relay-other");
    const git = (...args) => execFileSync("git", args, { cwd: repo, stdio: "pipe" });
    const config = checks => writeFileSync(join(repo, ".gyo/relay.json"), JSON.stringify({ version: 1, checks }));
    const commit = () => { git("add", "."); git("-c", "user.name=Relay Test", "-c", "user.email=relay@example.invalid", "commit", "-qm", "fixture"); };
    mkdirSync(join(repo, ".gyo"), { recursive: true });
    mkdirSync(other);
    git("init", "-q");
    execFileSync("git", ["init", "-q"], { cwd: other });
    execFileSync("git", ["-c", "user.name=Relay Test", "-c", "user.email=relay@example.invalid", "commit", "--allow-empty", "-qm", "fixture"], { cwd: other });
    config([{ id: "smoke", command: process.execPath, args: ["smoke.cjs"] }]);
    writeFileSync(join(repo, "smoke.cjs"), 'const assert = require("node:assert/strict"); assert.equal(require("node:fs").readFileSync("value.txt", "utf8"), "good"); console.log("smoke passed");');
    writeFileSync(join(repo, "value.txt"), "good");
    writeFileSync(join(repo, ".gyo/guardrails.json"), JSON.stringify({ version: 1, rules: [{
        id: "97307687-6df5-4776-aa5b-01bbbc44d125", correctionId: "fixture", lesson: "Do not add forbidden-marker",
        pathPattern: "*.txt", forbiddenLiteral: "forbidden-marker",
    }] }));
    commit();
    async function raw(client, name, args) {
        const result = await client.callTool({ name, arguments: { projectPath: repo, ...args } });
        const output = result.content.map(item => item.text).join("\n");
        return { error: result.isError ?? false, output };
    }
    async function call(client, name, args = {}) {
        const result = await raw(client, name, args);
        assert.equal(result.error, false, result.output);
        return JSON.parse(result.output);
    }
    const make = () => call(first, "create_handoff", { objective: "Repair calculation", context: "Synthetic fixture", acceptanceCriteria: ["Smoke passes"] });
    let id, token;
    const own = () => ({ id, leaseToken: token });

    await t.test("packaged MCP clients coordinate ownership and reject stale tokens", async () => {
        ({ id } = await make());
        const claims = await Promise.all([raw(first, "claim_handoff", { id, agent: "claude", leaseSeconds: 5 }), raw(second, "claim_handoff", { id, agent: "codex", leaseSeconds: 5 })]);
        assert.equal(claims.filter(item => !item.error).length, 1);
        token = JSON.parse(claims.find(item => !item.error).output).leaseToken;
        const visible = await call(second, "get_handoff", { id });
        assert.ok(!JSON.stringify(visible).includes(token));
        assert.equal(visible.leaseToken, undefined);
        const cp = await call(first, "checkpoint_handoff", { ...own(), completed: ["Inspected input"], nextSteps: ["Fix remainder"], uncertainties: ["Boundary not tested"] });
        assert.equal(cp.checkpoint.nextSteps[0], "Fix remainder");
        assert.equal((await raw(second, "get_handoff", { id, projectPath: other })).error, true);
        await delay(5100);
        const claimed = await call(second, "claim_handoff", { id, agent: "codex" });
        assert.equal(claimed.checkpoint.completed[0], "Inspected input");
        assert.equal((await raw(first, "submit_result", { ...own(), summary: "Late writer" })).error, true);
        token = claimed.leaseToken;
    });

    await t.test("evidence is executed, survives restart and detects code, index, HEAD and untracked drift", async () => {
        const beforeIndex = readFileSync(join(repo, ".git/index"));
        let result = await call(second, "verify_result", own());
        assert.equal(result.verified, true);
        assert.match(result.evidence.at(-1).checks[0].output, /smoke passed/);
        assert.deepEqual(readFileSync(join(repo, ".git/index")), beforeIndex);
        const fresh = await connect("relay-fresh-process");
        const persisted = await call(fresh, "get_handoff", { id });
        assert.equal(persisted.verified, true);
        assert.equal(persisted.checkpoint.completed[0], "Inspected input");
        await fresh.close();
        writeFileSync(join(repo, "value.txt"), "evil"); // Same-length edit must invalidate evidence.
        result = await call(first, "get_handoff", { id });
        assert.equal(result.verified, false);
        assert.ok(result.evidence.at(-1).changedPaths.includes("value.txt"));
        assert.equal(result.evidence.at(-1).stale, true);
        result = await call(second, "verify_result", own());
        assert.equal(result.verified, false);
        assert.notEqual(result.evidence.at(-1).checks[0].exitCode, 0);
        writeFileSync(join(repo, "value.txt"), "good");
        await call(second, "verify_result", own());
        writeFileSync(join(repo, "new.txt"), "new");
        assert.equal((await call(first, "get_handoff", { id })).verified, false);
        await call(second, "verify_result", own());
        git("add", "new.txt");
        result = await call(first, "get_handoff", { id });
        assert.equal(result.verified, false);
        assert.equal(result.evidence.at(-1).indexChanged, true);
        await call(second, "verify_result", own());
        commit();
        result = await call(first, "get_handoff", { id });
        assert.equal(result.evidence.at(-1).headChanged, true);
        await call(second, "verify_result", own());
    });

    await t.test("Guardrails failure, checkpoint release and unverified submissions stay distinguishable", async () => {
        writeFileSync(join(repo, "violation.txt"), "forbidden-marker");
        let result = await call(second, "verify_result", own());
        assert.equal(result.verified, false);
        assert.equal(result.evidence.at(-1).guardrails.violationCount, 1);
        unlinkSync(join(repo, "violation.txt"));
        result = await call(second, "checkpoint_handoff", { ...own(), completed: ["First part"], nextSteps: ["Verify remainder"], uncertainties: [], release: true });
        assert.equal(result.lease, null);
        assert.equal((await raw(second, "submit_result", { ...own(), summary: "Old token" })).error, true);
        ({ leaseToken: token } = await call(first, "claim_handoff", { id, agent: "next" }));
        await call(first, "verify_result", own());
        result = await call(first, "submit_result", { ...own(), summary: "Finished" });
        assert.equal(result.verified, true);
        assert.equal(result.status, "submitted");
        assert.equal(result.lease, null);
        const unverified = await make();
        const claimed = await call(second, "claim_handoff", { id: unverified.id, agent: "new" });
        const submitted = await call(second, "submit_result", { id: unverified.id, leaseToken: claimed.leaseToken, summary: "Claimed success" });
        assert.equal(submitted.verified, false);
    });

    await t.test("only committed commands execute; changed policy and edits during verification fail closed", async () => {
        ({ leaseToken: token } = await call(first, "claim_handoff", { id, agent: "checker" }));
        config([{ id: "unreviewed", command: process.execPath, args: ["-e", "throw new Error('unreviewed command ran')"] }]);
        let result = await call(first, "verify_result", own());
        assert.equal(result.evidence.at(-1).checks[0].id, "smoke");
        // MCP SDKs may strip unknown keys before dispatch. They must never become commands.
        const extra = await raw(first, "verify_result", { ...own(), command: "echo injected" });
        if (!extra.error) assert.equal(JSON.parse(extra.output).evidence.at(-1).checks[0].id, "smoke");
        config([{ id: "mutates", command: process.execPath, args: ["-e", "require('fs').writeFileSync('during.txt', 'mutation')"] }]);
        commit();
        result = await call(first, "get_handoff", { id });
        assert.equal(result.evidence.at(-1).policyChanged, true);
        result = await call(first, "verify_result", own());
        assert.equal(result.verified, false);
        assert.equal(result.evidence.at(-1).stable, false);
        assert.ok(result.evidence.at(-1).changedPaths.includes("during.txt"));
    });

    await t.test("bounded output, timeout, concurrent verifier exclusion and symlink handling", async () => {
        config([{ id: "timeout", command: process.execPath, args: ["-e", "console.log('x'.repeat(100000)); setTimeout(() => {}, 60000)"], timeoutMs: 800 }]);
        commit();
        const running = call(first, "verify_result", own());
        await delay(200);
        const competing = await raw(second, "checkpoint_handoff", { ...own(), completed: [], nextSteps: [], uncertainties: [] });
        assert.equal(competing.error, true);
        const result = await running;
        assert.equal(result.verified, false);
        const check = result.evidence.at(-1).checks[0];
        assert.equal(check.truncated, true);
        assert.ok(Buffer.byteLength(check.output) <= 32768);
        assert.match(check.error, /timed out/);
        symlinkSync(join(root, "nonexistent-external-secret"), join(repo, "external-link"));
        assert.equal((await call(first, "get_handoff", { id })).evidence.at(-1).stale, true);
        mkdirSync(join(repo, "nested"));
        writeFileSync(join(repo, "nested/file.txt"), "tracked");
        commit();
        unlinkSync(join(repo, "nested/file.txt"));
        const { rmdirSync } = await import("node:fs");
        rmdirSync(join(repo, "nested"));
        symlinkSync(other, join(repo, "nested"));
        assert.equal((await raw(first, "get_handoff", { id })).error, true);
    });
}
