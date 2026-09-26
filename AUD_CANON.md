# AUD_CANON — BOQA

PROJECT=BOQA  
PURPOSE=Autonomous, legally bounded browser-QA / verification worker: discover valuable work → understand → decide → execute only inside proven authority → verify → produce hash-bound evidence → submit/get paid later → learn from verified outcomes.  
REPO=https://github.com/simondalmasso/boqa  
LIVE=https://boqa.simondalmasso44.workers.dev/

LAST_VERIFIED=2026-09-25T22:05-03:00  
IMPLEMENTATION_CANON_BRANCH=feat/boqa-cuore-radar-v1  
IMPLEMENTATION_CANON_HEAD=0f756f682df915b8b97c84e38bcb8288b53d2009  
MAIN_RUNTIME_BASE_BEFORE_CANON_DOCS=f33015c55fe84508377528c2ff718f9c5b28efe7  
MAIN_RUNTIME_IS_CURRENT_IMPLEMENTATION=false

## CANONICAL LINKS
- Control log: https://github.com/simondalmasso/boqa/issues/37
- Current authority/order: LOG67 https://github.com/simondalmasso/boqa/issues/37#issuecomment-5839142602
- ARQ2 accepted qualification: LOG66 https://github.com/simondalmasso/boqa/issues/37#issuecomment-5839050359
- Canon rebuild handoff: https://github.com/simondalmasso/boqa/issues/53
- Lean kernel PR49: https://github.com/simondalmasso/boqa/pull/49
- CORE001 PR50: https://github.com/simondalmasso/boqa/pull/50
- Turbo UI lane: https://github.com/simondalmasso/boqa/issues/51
- Meta hackathon radar record: https://github.com/simondalmasso/boqa/issues/52

## CURRENT STATE
- OWNER_OPERATING_MODEL=ONE_ARQ_ONLY. Previous ARQ2/ARQ3 lanes are now parked inputs, not active workers.
- Lean kernel accepted at f734e229f442d83a873cd473a929883a846ec8c6; PR49 open draft, unmerged.
- CORE001 accepted terminal PASS at 0f756f682df915b8b97c84e38bcb8288b53d2009; PR50 open draft, unmerged.
- Accepted CORE001: OperationState, Opportunity, ProgramPolicyManifest, deterministic DecisionKernel, EconomicScorer, HumanGateBus, OutcomeMemory, SkillRegistry schema, receive-only PayoutRegistry schema, read-only radar fixtures, protected HumanGate read.
- ARQ2 qualification pack accepted as READ-ONLY INPUT at 6549675a7b43ba25d4433b5dac866ab3280922e7. It qualifies Laya typed-decisions, radar sources, policy fixtures and skill candidates; it is not runtime authority.
- ARQ3 Turbo UI static candidate at 84af24ae1fd9e0a06149c8105ed4c60dec456b95 is accepted only as static candidate. Browser/render QA remains open; it is not integrated or deployed.
- LOG67 active order: BOQA-CORE-002-LAYA-SHADOW-DECISION-BENCHMARK-V1.
- No branch named feat/boqa-laya-shadow-decision-benchmark-v1 was observed during this refresh; create it only when the single ARQ starts LOG67.
- Live production was last positively observed in LOG67 as historical BOQA UI/health; no accepted lean/CORE/UI branch deployment was observed. This refresh could not independently re-fetch live because browser connector/DNS access was unavailable.

## DONE
- GitHub restoration/reconciliation.
- Overengineering/dead-code prune: 87 root JS modules → 8; ~2.48MB runtime JS → ~350KB; 127 dead/superseded/duplicate JS removed; dependencies 6 → 3.
- V4 20/20 and BOQA006 4/4 preserved.
- CORE001 independently replayed PASS x2; exact-head Browser CI and Docker CI SUCCESS.
- ARQ2 qualification pack accepted: 14 held-out Laya cases, 13 policy fixtures, 8 radar sources, curated skill dispositions.
- ARQ3 isolated Turbo Pascal/MS-DOS UI implemented with zero runtime coupling.

## ACTIVE WORK
ONE_ARQ only: execute LOG67 / LAYA_SHADOW_DECISION_BENCHMARK_V1 from CORE001 head 0f756f... using ARQ2 qualification SHA 6549675... read-only.

## PENDING
1. Prove or kill Laya typed-decisions as SHADOW_ONLY BRAIN on the real BOQA Windows host.
2. Close ARQ3 browser/render QA; no redesign unless evidence requires it.
3. Later: bounded live metadata radar adapter; still no target scanning from cron.
4. Later: explicit execute/submit/payout rails, each behind policy + HumanGate.
5. Decide merge/deploy strategy for accepted chain; main remains historical until explicitly reconciled.
6. Economic milestone remains FIRST_REAL_EXTERNAL_TASK → verified delivery → accepted → settled → net positive.

## BLOCKERS / RISKS
- Laya typed-decisions Node/ONNX bundle is not yet admitted: must be exported, pinned, checksummed and parity-proven.
- Real Windows cold/warm latency, p50/p95, RAM, CPU, offline/network behavior remain unmeasured.
- Any hard-gate false admission is a critical failure.
- UI render/accessibility runtime evidence remains incomplete.
- Main is stale relative to accepted implementation branches.
- Live site is historical; no current accepted branch deployment is canon.
- External Grok transcript supplied by owner is only a preliminary cross-check; it did not contain the required final handoff/branch/ZIP in the supplied material.

## DO_NOT_TOUCH
- Do not rebuild cleanup or CORE001.
- Do not resurrect the deleted engine zoo.
- Do not mutate lab/boqa-next-qualification-v1 or lab/boqa-turbo-ui-v1; consume them as evidence/input only.
- No main runtime edits, merge, deploy, Cloudflare writes, live target scans, bids, submissions, wallet signing/writes, spend, withdrawal, or secret storage without a later explicit gate.
- Do not add LangChain/AutoGen/CrewAI/etc. as a second CUORE/orchestrator without a measured requirement.

## AUTHORITIES / GATES
VERIFY>ASSUME. EVIDENCE>CLAIM. CURRENT_STATE>HISTORY. PRESERVE>REBUILD.  
DISCOVERY!=AUTHORIZATION. MODEL_OUTPUT!=AUTHORIZATION.  
CUORE=deterministic authority. BRAIN=replaceable advisory intelligence. SEMANTIC_ORACLE=independent truth.  
Model/BRAIN cannot expand scope, override policy/HumanGate, promote REPRODUCED, sign/spend, or submit where human review is required.  
Semantic chain: evidence → grounded candidate → independent reproduction → semantic oracle → REPRODUCED|NOT_REPRODUCED|AMBIGUOUS → standalone regression only when justified → hash-bound evidence.

## NEXT EXACT ACTION
Open ONE ARQ only. Read this file + LOG67. Create feat/boqa-laya-shadow-decision-benchmark-v1 from exact 0f756f682df915b8b97c84e38bcb8288b53d2009 and execute LOG67 only. Consume ARQ2 qualification SHA 6549675a7b43ba25d4433b5dac866ab3280922e7 read-only. Return one evidence-bound Laya benchmark handoff; no merge/deploy.
