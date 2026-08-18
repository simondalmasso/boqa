# ATM integration handoff contract

```text
WORKER_ID=boqa
WORKER_REPO=https://github.com/simonkey888/boqa
WORKER_SOURCE_SHA=RESOLVE_TO_EXACT_ACCEPTED_DRAFT_PR_HEAD
WORKER_ENTRYPOINT=node atm-worker/cli.js run --job <job.json> --run-root <dir>
WORKER_PROTOCOL_VERSION=boqa_atm_job_v1/boqa_atm_result_v1
CAPABILITIES_CANDIDATE=QA_REPRODUCTION,PLAYWRIGHT_E2E,BROWSER_WORKFLOW_TESTING,REGRESSION_TESTING,CI_TRIAGE,DETERMINISTIC_REPLAY,EVIDENCE_GENERATION,FIX_VERIFICATION,SMALL_BOUNDED_CODE_FIX
INSTALL_PREPARE_COMMANDS=npm ci --ignore-scripts; explicit allowlisted runtime/browser image hydration only
NETWORK_POLICY=hostile execution network-none; dependency hydration allowlisted by frozen origins; browser approved loopback/frozen origins only
BROWSER_POLICY=controlled origins; unexpected cross-origin/file/metadata/private blocked; downloads confined; uploads unsupported R1
EXPECTED_ARTIFACTS=result.json,receipts.jsonl,artifacts/* with SHA-256 references
MAX_CONCURRENCY_RECOMMENDATION=1
COST_CEILING_USD=0
FINANCIAL_AUTHORITY=0
CLAIM_AUTHORITY=0
SUBMISSION_AUTHORITY=0
MODEL_AUTHORITY=0
PROJECT_CORE_CONTINUES=YES
```

Only capabilities that complete the exact-head soak may be handed to ATM as proven. ATM activation/source pin remains a separate ATM authority.
