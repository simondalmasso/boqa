# ARQ_CANON — BOQA

PROJECT=BOQA  
PURPOSE=Continue BOQA as one lean implementation lane toward a specialized autonomous worker that can discover → decide → execute authorized work → verify/prove → later submit/get paid, without becoming a generic bounty agent.  
REPO=https://github.com/simondalmasso/boqa  
LIVE=https://boqa.simondalmasso44.workers.dev/

LAST_VERIFIED=2026-09-25T22:05-03:00  
WHERE_TO_RESUME=LOG67 https://github.com/simondalmasso/boqa/issues/37#issuecomment-5839142602  
BASE_BRANCH=feat/boqa-cuore-radar-v1  
BASE_HEAD=0f756f682df915b8b97c84e38bcb8288b53d2009  
CREATE_WORK_BRANCH=feat/boqa-laya-shadow-decision-benchmark-v1  
QUALIFICATION_INPUT_SHA=6549675a7b43ba25d4433b5dac866ab3280922e7  
OPERATING_MODEL=ONE_ARQ_ONLY

## CANONICAL LINKS
- Control log: https://github.com/simondalmasso/boqa/issues/37
- LOG67 active order: https://github.com/simondalmasso/boqa/issues/37#issuecomment-5839142602
- LOG66 accepted qualification: https://github.com/simondalmasso/boqa/issues/37#issuecomment-5839050359
- Current reboot/canon handoff: https://github.com/simondalmasso/boqa/issues/53
- CORE001 PR50: https://github.com/simondalmasso/boqa/pull/50
- Lean PR49: https://github.com/simondalmasso/boqa/pull/49
- UI candidate Issue #51: https://github.com/simondalmasso/boqa/issues/51

## CURRENT STATE
- Cleanup is DONE/AUD-accepted. Do not repeat it.
- CORE001 is DONE/AUD-terminal-PASS at 0f756f... with deterministic CUORE + HumanGate + economic/radar/memory/skill/payout schemas.
- ARQ2 work is DONE and accepted as qualification input at 6549675...; branch is parked/read-only.
- ARQ3 work is DONE as a static UI candidate at 84af24ae...; branch is parked/read-only; render QA remains pending.
- Main is historical/stale and is not the implementation base.
- No accepted lean/CORE/UI deployment is current production.

## DONE
- Lean prune/reconciliation.
- CORE001 implementation + independent replay + exact-head CI.
- Laya/radar/policy/skill qualification research pack.
- Turbo Pascal UI prototype static implementation.

## ACTIVE WORK
ORDER=BOQA-CORE-002-LAYA-SHADOW-DECISION-BENCHMARK-V1  
GOAL=Prove or kill Laya typed-decisions as local SHADOW_ONLY BRAIN without changing CUORE authority.

## WHAT TO DO NOW
1. Resolve exact BASE_HEAD=0f756f... and QUALIFICATION_INPUT_SHA=6549675...; STOP on drift.
2. Create feat/boqa-laya-shadow-decision-benchmark-v1 from exact BASE_HEAD.
3. Consume qualification pack by exact SHA without writing its branch.
4. Freeze deterministic DecisionKernel outputs on the accepted held-out fixtures.
5. Export/materialize the exact typed-decisions candidate; pin model/runtime revisions and SHA256; record licenses.
6. Prove parity against official implementation on a bounded parity set. Do NOT substitute the default English ONNX bundle.
7. Run Laya SHADOW_ONLY; deterministic DecisionKernel remains final authority.
8. Benchmark on the real BOQA Windows host: cold/warm load, inference p50/p95, peak RAM/working set, CPU, offline behavior, network attempts.
9. Prove warm cached inference NETWORK_ATTEMPTS=0.
10. Measure decision accuracy, HumanGate recall, false-admission rate, false-skip rate, latency, RAM, CPU and $0 status.
11. Persist commands/results/provenance/hashes and return one handoff.

## WHAT NOT TO REPEAT
- Do not redo dead-code cleanup.
- Do not redo CORE001.
- Do not redo ARQ2 qualification.
- Do not redesign the Turbo UI.
- Do not research/import a generic agent stack.
- Do not revive removed autonomy/decision/engine modules.
- Do not create a dual Laya/OpenJev runtime. OpenJev is challenger-only if explicitly useful for benchmark.
- Do not touch main, ARQ2 branch, ARQ3 branch, production, Cloudflare, wallets or third-party targets.

## PENDING AFTER THIS ORDER
- Browser/render QA for Turbo UI.
- One bounded live metadata radar adapter.
- Later authorized execute/submit/get-paid rails.
- Merge/deploy decision only after AUD accepts the next exact head.

## BLOCKERS / RISKS
- typed-decisions Node/ONNX export/pin/parity is not yet proven.
- Real-host Windows performance/offline metrics are not yet captured.
- Any false admission on scope/policy/prohibited-action/wallet/signature/spend hard-gate case kills the candidate.
- Main and live production remain behind accepted branch state.

## AUTHORITIES / GATES
CUORE=deterministic authority; Laya/BRAIN=advisory only; Semantic Oracle=truth.  
Laya may rank/classify/suggest only. It cannot expand scope, override policy/HumanGate, declare REPRODUCED, submit, sign or spend.  
TARGET_NETWORK_REQUESTS=0 for this order.  
NO live radar, auto-bid, auto-submit, wallet write, spend, Cloudflare write, merge, deploy or production change.

## ACCEPTANCE / STOP CONDITIONS
SUCCESS only if:
- typed-decisions bundle provenance + pin + SHA256 + parity are proven;
- HARD_GATE_FALSE_ADMISSIONS=0;
- WARM_CACHED_NETWORK_ATTEMPTS=0;
- real Windows metrics are captured;
- evidence is hash-bound and reproducible;
- existing CORE001/V4/BOQA006/scope/replay gates remain green.

STOP / FAIL_CLOSED if:
- base or qualification SHA drift;
- typed-decisions cannot be exported/pinned/parity-proven;
- real-host measurement cannot be completed;
- any hard-gate false admission occurs;
- satisfying the benchmark would require weakening deterministic gates or silently substituting another model.

RETURN=ARQ_BOQA_LAYA_SHADOW_BENCHMARK_HANDOFF
NO_MERGE=true
NO_DEPLOY=true
NO_PRODUCTION_CHANGE=true
