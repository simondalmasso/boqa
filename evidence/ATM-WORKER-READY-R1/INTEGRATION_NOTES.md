# ATM integration handoff

WORKER_ID=boqa
WORKER_REPO=https://github.com/simonkey888/boqa
WORKER_ENTRYPOINT=node atm-worker/cli.js run --job <job.json> --run-root <dir>
WORKER_PROTOCOL_VERSION=boqa_atm_job_v1/boqa_atm_result_v1
INSTALL_PREPARE_COMMANDS=npm ci --ignore-scripts (target hydration only when frozen runtime profile requires npm and exact lock validation passes)
NETWORK_POLICY=hostile execution network-none; browser loopback/frozen approved origins only; hydration separately constrained by validated lock origins
EXPECTED_ARTIFACTS=result.json,state.json,receipts.jsonl,artifacts/* plus committed readiness evidence
MAX_CONCURRENCY_RECOMMENDATION=1
COST_CEILING_USD=0
FINANCIAL_AUTHORITY=0
CLAIM_AUTHORITY=0
SUBMISSION_AUTHORITY=0
MODEL_AUTHORITY=0
PROJECT_CORE_CONTINUES=YES
ATM_ONLINE_REQUIRED_FOR_PRODUCT=false
