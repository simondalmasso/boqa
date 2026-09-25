# BOQA — Handoff lean kernel restaurado

DATE=2026-09-24
ORDER_ID=BOQA-RESTORE-001-RECONCILE-PRUNE-LEAN-KERNEL-V1
REPOSITORY=https://github.com/simondalmasso/boqa
BASE_PR40_HEAD=34626bb2ee3f770babaf9ec2a7997f04872733cc
REMOTE_MAIN_AT_ORDER=f33015c55fe84508377528c2ff718f9c5b28efe7
BRANCH=restore/lean-kernel-v1
FINAL_HEAD=REPORTADO_EN_ARQ_BOQA_RESTORE001_LEAN_KERNEL_HANDOFF
NO_MERGE=true
NO_DEPLOY=true
PRODUCTION_TRAFFIC_CHANGE=false

## Canon reconciliado

- V4 patch SHA-256: `e144a17df03c1caf408920cd8a959e5c1f878624c116d0ed61556eebd227c1ef`.
- V4 evidence SHA-256: `1c9339b5d6d0903dd033cddfce1455c7f3cef95a210c67e795fd0f75da21afe1`.
- V4 bundle SHA-256: `f1ca789637b52035b30f5a7a2ee007dd3e1f9941bc555e50dc1f6351b0764371`.
- V4 proof: `20_PASS_0_FAIL`; vulnerable regression exit `1`; fixed exit `0`; rejected destination fetches `0`.
- BOQA006 source bundle SHA-256: `d133ec0058542da4b14d23d287eabd5135cb51c483e7060ae3b2c2cd8bc4624c`.
- BOQA006 proof: `4_PASS_0_FAIL`; A=`REPRODUCED` + regression; B=`NOT_REPRODUCED` + no regression; C=`AMBIGUOUS` + no regression.
- Exact BOQA006 source is reconciled under `kernel/verified-regression/`.

## Supported product contract

`STRICT_FINDING/EVIDENCE -> GROUNDED_CANDIDATE -> INDEPENDENT_REPRODUCTION -> SEMANTIC_ORACLE -> REPRODUCED | NOT_REPRODUCED | AMBIGUOUS -> STANDALONE_REGRESSION only when REPRODUCED -> HASH_BOUND_EVIDENCE`.

NOT_REPRODUCED and AMBIGUOUS remain fail-closed and produce no regression.

## Lean supported architecture

The supported kernel is now explicit instead of instantiating every historic generation:

- OPERATION/STATE: `server.js`, `bus.js`, `lib/hunter-runtime.js`.
- SCOPE_GUARD: `config/authorized-assets.json`, `lib/defensive-validation.js`, `lib/middleware.js`, V4 `destination-boundary.js`.
- CANDIDATE / REPRODUCTION / SEMANTIC_ORACLE / REGRESSION_COMPILER: `spike/boundary-proof/**` plus `kernel/verified-regression/**`.
- EVIDENCE_LEDGER: V4/006 hash manifests plus replay security/redaction primitives.
- BROWSER_EXECUTOR: `agent/playwright-runner.js` + `agent/instrumentation.js`; requires an explicit target and explicit allowed origins, rejects inherited CDP sessions, and has no default external target.
- REPLAY: `deterministic-replay-engine.js`, `replay-manifest-builder.js`, `replay-security-guard.js`, `replay-verification-engine.js`, `universal-session-recorder.js`.
- ADAPTER_BOUNDARY: `worker.js` exposes only the public edge contract; `routes/hunter-v1.js` is the only retained Node API route module.

## Supported runtime entrypoints

- `node server.js` — local backend/dashboard; browser execution is disabled until separately invoked with explicit scope.
- Cloudflare source entrypoint: `worker.js`; no deploy is authorized by this handoff.
- `node scripts/local-lab.js validate-config|run-once|status` — controlled local lab only.
- `node spike/boundary-proof/compile-boundary.js ...` — V4 compiler with loopback-only destination guard.
- `python kernel/verified-regression/run_three_cases.py` — BOQA006 controlled three-case evidence slice.
- `PlaywrightRunner` is a library adapter requiring `target` + `allowedOrigins`; CDP session inheritance is denied.
- Replay primitives are library entrypoints, not a network crawler or target-discovery system.

## Removed / superseded surface

`evidence/restore001/REACHABILITY_PREPRUNE.json` classifies the pre-prune JS graph. `evidence/restore001/PRUNED_JS_FILES.txt` contains the exact removed JS list.

The cleanup removes:

- historical v0.x-v1.5 API route generations except `hunter-v1`;
- the all-generations `lib/init.js` / pipelines / shutdown orchestration path;
- historical discovery, forecast, economic, decision, autonomy, target/scheduler/worker-pool engine families not in the restored contract;
- monolithic `agent.js` in favor of the explicit scoped Playwright adapter;
- duplicate `agent/event-bus.js` in favor of `bus.js`;
- old Pages catch-all API function in favor of the configured Worker edge boundary;
- orphan recovery/scaffold scripts;
- historical tests whose only purpose was the removed versioned architecture.

No module was deleted from `UNKNOWN`; post-prune graph has `UNKNOWN=0` and `UNREACHABLE=0`.

## External-target sanitation

- Removed `npm run demo` and the hard-coded `https://ripio.com` shortcut.
- Removed the historical CI runner/config whose default target was Ripio production.
- Retained runtime URL literals are loopback/local only.
- Browser adapter has no default target and requires explicit origin allowlist.
- Browser adapter rejects inherited CDP/user-session reuse.
- Defensive validation admits only explicitly configured authorized local/owned assets and currently contains a local fixture.
- No discovered host/subdomain becomes authorized automatically.
- No bounty, wallet, payment, Laya, market-adapter, or autonomous-hunting feature was added.

## Measurements

Measurement base is exact PR40 + accepted V4 + accepted BOQA006 source, before pruning.

- FILES_BEFORE=221
- JS_FILES_BEFORE=184
- RUNTIME_JS_BEFORE=151
- RUNTIME_BYTES_BEFORE=2479403
- ROOT_RUNTIME_MODULES_BEFORE=87
- PACKAGE_SCRIPTS_BEFORE=35
- DEPENDENCIES_BEFORE=6
- ROOT_RUNTIME_MODULES_AFTER=8
- PACKAGE_SCRIPTS_AFTER=13
- DEPENDENCIES_AFTER=3
- DEAD_OR_SUPERSEDED_DUPLICATE_JS_REMOVED=127
- HISTORICAL_ROUTE_MODULES_REMOVED=10
- EXTERNAL_DEFAULT_TARGETS=0

Final file/JS/runtime-byte counts are recorded in `evidence/restore001/LEAN_KERNEL_SUMMARY.json` and the external ARQ terminal handoff.

## Verification commands

Primary gate:

```text
npm ci --ignore-scripts --offline
npm test
```

`npm test` runs the supported JS characterization suite, V4 20-test suite, and BOQA006 4-test suite.

Additional focused gates:

```text
node test/test-browser-scope-guard.js
node test/test-replay-kernel.js
node test/test-hunter-runtime-v1.js
node test/test-public-private-boundary.js
node scripts/local-lab.js validate-config
```

Browser smoke uses only loopback fixtures. Local browser execution may require Playwright system libraries; remote CI verification must use an exact-head, non-Cloudflare workflow path and is reported externally without changing this commit.

## Governance finding

At LOG57 issuance, `main` was unprotected. This is a governance finding only; this order does not modify repository settings.

## Evidence

- `evidence/restore001/CANON_RECONCILIATION.json`
- `evidence/restore001/REACHABILITY_PREPRUNE.json`
- `evidence/restore001/REACHABILITY_POSTPRUNE.json`
- `evidence/restore001/PRUNED_JS_FILES.txt`
- `evidence/restore001/LEAN_KERNEL_SUMMARY.json`
- `evidence/restore001/TEST_RESULTS.txt`

## Next safe seam

Independent review should first accept this lean kernel and its exact-head CI. Only afterward may separate orders add browser-backed execution or other layers. Laya, bounty/payment features, UI redesign, deploy, merge, and production changes are explicitly outside this handoff.
