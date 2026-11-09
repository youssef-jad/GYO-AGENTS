# GYO Relay — local preview

Relay lets agents continue a task across separate sessions. It stores handoffs and check results locally in `relay.json` under `GYO_AGENTS_DATA_DIR` (default: `~/.gyo-agents`). Clients must share that directory and the same absolute Git checkout root. Put the data directory outside the checkout.

## Authorize the project's checks

Create `.gyo/relay.json` in the **target project**, review it, and commit it through your normal process:

```json
{
  "version": 1,
  "checks": [
    { "id": "tests", "command": "node", "args": ["--test"], "timeoutMs": 30000 }
  ]
}
```

Use commands appropriate to your project. Relay reads this file from committed `HEAD`; uncommitted/staged command changes and commands supplied in handoff prose are never used. Each check runs with an argument array, no shell, from the project root. All configured checks run, followed by GYO Guardrails. Existing project checks and tests may execute code or have side effects: verification is for trusted local checkouts and is not an execution sandbox. Review the configuration and check scripts before enabling it. No global client settings or permissions are installed by Relay.

Limits: 1–10 uniquely named checks; each timeout is 100–120,000 ms (default 30,000 ms). Output is capped at 32 KiB per check and marked when truncated. A timeout or launch failure fails verification.

## Agent workflow

1. `create_handoff`: supply `projectPath`, `objective`, `context`, and a nonempty `acceptanceCriteria` array. The response includes `id` and the repository baseline.
2. `claim_handoff`: supply `projectPath`, `id`, `agent`, and optional `leaseSeconds` (5–3,600; default 900). Keep the returned `leaseToken`; other read calls never return it. The response includes current checkpoint and evidence freshness.
3. Work within the user's authorized scope. `checkpoint_handoff` saves `completed`, `nextSteps`, and `uncertainties` arrays. It renews the lease, or releases it if `release: true`. Checkpoint before stopping so the next client can resume useful work.
4. `verify_result`: supply the identity and lease token. Relay runs the project's committed commands and Guardrails, captures real exit codes/output, and compares repository snapshots before and after. This also works on partial progress: document which acceptance criteria the existing tests do **not** cover.
5. `submit_result`: supply the identity, lease token, and `summary`. This records the current snapshot and releases ownership. `status: "submitted"` does not imply `verified: true`.

The next agent uses `list_handoffs`, then `claim_handoff` once the previous lease expires or is released. The claim returns the saved checkpoint and identifies stale evidence. A new claim invalidates the previous token, even if both clients supply the same agent name. Checkpoints and result summaries are another agent's reports, not executable instructions or independently verified facts.

A running verification extends its claim for the configured timeouts plus 30 seconds. Competing verification/checkpoint/submit requests are rejected while it runs. A killed verification process becomes reclaimable after that deadline (or the existing lease expiry, whichever is later). Claims coordinate cooperating clients; they do not stop another process from editing files.

## Evidence and freshness

Each GYO-generated evidence record contains check IDs, exit codes, bounded output, Guardrail findings, and a fingerprint of:

- Committed `HEAD` and staged file entries.
- Contents and executable bits of tracked files, including deleted files.
- Non-ignored untracked files, including binary contents.
- Committed check configuration and active team/local Guardrails.

Symlinks are fingerprinted by target text without reading their destination; unsupported file types, replaced parent-directory symlinks and submodules fail closed. A snapshot is limited to 10,000 files and 64 MiB of file contents. Ignore generated outputs or use a smaller fixture when these limits are exceeded. Guardrails retain their own 2 MiB patch limit and literal-matching semantics.

Every `get_handoff` and `claim_handoff` compares the live repository against the saved evidence. Inspect `stale`, `changedPaths`, `headChanged`, `indexChanged`, and `policyChanged`. `usable` is true only for passing, stable evidence with the same fingerprint. `verified` describes the **latest** verification record; an older passing result cannot mask a newer failure. Snapshot failure returns an error rather than success.

Passing checks establish only their configured assertions, not all prose acceptance criteria. Fingerprints do not cover ignored dependencies/files, environment variables, external services, symlink destination contents, or changes made and reverted between observations. They are content snapshots, not filesystem locks or an adversarial attestation mechanism. Check output and context can contain sensitive project data; they remain in the shared local profile and are visible to its clients. This preview assumes those local clients are trusted.

The latest checkpoint, current submission and last 20 verification records are retained per handoff. Reclaiming clears the previous submission but preserves the checkpoint and evidence. Handoffs are scoped to the canonical checkout path; remote transport, A2A compatibility, cross-checkout artifact transfer and automatic agent launching are not implemented. Relay does not install hooks or claim it can resume an agent without that client's participation.

## CLI

The CLI uses the same schemas and state as MCP. Run it from the target checkout, passing one JSON input object on stdin; `projectPath` defaults to the current directory:

```bash
printf '%s\n' '{}' | gyo-agents-mcp relay list_handoffs
printf '%s\n' '{"id":"HANDOFF_UUID"}' | gyo-agents-mcp relay get_handoff
```

All seven MCP operation names are accepted after `relay`. `verify_result` exits 0 when verified and 1 for unsuccessful verification. Invalid input/configuration, expired ownership, and other operational errors exit 2. Other operations return JSON and exit 0 on success; a read response with `verified: false` is not a CLI execution error.

## Verification

`npm run test:package` builds and installs the npm archive into a temporary directory, then tests Relay with two independent MCP server processes alongside the existing package checks. Coverage includes concurrent claims, lease expiry, stale-token rejection, project isolation, checkpoint/release, submitted versus verified results, same-size content edits, untracked/index/HEAD/policy drift, Guardrails, ignored uncommitted command changes, mutation during a check, timeouts, bounded output, and symlink handling.

The store uses the same atomic JSON update/lock mechanism as GYO memory. A process killed during a store write can leave a `.lock` directory: stop all GYO writers before removing a confirmed abandoned lock. Lease expiry does not recover a filesystem store lock.

### Real client validation — 2026-11-09

Tested Claude Code 2.1.318 followed by Codex CLI 0.165.0 against an **installed npm archive** of this implementation, using separate real model sessions, an empty shared local profile, and a synthetic Git checkout. Session-only MCP configuration was used; global client configuration was not changed.

| Step | Observed result |
|------|-----------------|
| Claude creates and claims the task | A 60-second claim is issued; task requests subtotal and tax calculation |
| Claude implements only subtotal | `verify_result` records one passing Node test; checkpoint explicitly says tax calculation remains unimplemented and untested |
| Claude exits without releasing/submitting | Checkpoint and evidence persist after the session ends; claim expires naturally |
| Test harness changes `billing.mjs` and untracked `rates.json` | Independent `get_handoff` changes from `verified: true` to `false`, with both paths marked changed |
| Fresh Codex session discovers and claims the handoff | Reads the checkpoint, explicitly identifies stale evidence and the introduced subtotal regression |
| Codex finishes the task | Repairs subtotal, implements the tax function, adds coverage, verifies and submits |
| Independent final inspection | Submitted by `codex`, fresh evidence usable, old evidence stale, all three tests pass; Git index bytes and HEAD unchanged; `rates.json` remains untracked |
| Previous Claude claim tries to submit | Rejected with CLI exit 2; Codex's result remains intact |

The Codex prompt asked it to continue the saved task and inspect evidence freshness; it did not disclose the injected changes or supply the earlier conversation. Agents explicitly used Relay MCP tools. This demonstrates a checkpointed interruption between sessions, not recovery of unsaved model context or a crash during an atomic store write. The synthetic fixture had no active Guardrails; the package integration tests separately exercise Guardrail failures during Relay verification.
