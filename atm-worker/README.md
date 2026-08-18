# BOQA ATM worker mode

Additive worker mode. Standalone BOQA remains unchanged and ATM is not required for normal BOQA operation.

Entrypoints:

```text
node atm-worker/cli.js run --job <job.json> --run-root <dir>
node atm-worker/cli.js resume --run-root <dir>
node atm-worker/cli.js cancel --run-root <dir>
node atm-worker/cli.js inspect --run-root <dir>
```

The worker accepts only `boqa_atm_job_v1`, recomputes the canonical scope hash, persists RECEIVE/VALIDATE/ACK before target effects, executes hostile target commands in a restricted Docker boundary, enforces `allowed_paths`, sanitizes bounded artifacts, and emits `boqa_atm_result_v1`. It has no marketplace, payment, wallet, deploy, merge, or model authority.
