# Exact-head CI contract

Required workflow: `.github/workflows/boqa-real-docker-soak-v1.yml` (`BOQA Real Docker Soak V1`). Workflow files changed by R1: **0**.

Publication is a single final commit with message `BOQA: add reusable ATM worker readiness R1 [skip ci]`, followed by one Draft PR. No Cloudflare workflow dispatch is authorized. After publication, only the existing Docker soak may be explicitly dispatched against the exact branch/head.

The exact commit SHA and resulting run/artifact digest cannot be self-referentially embedded into the commit that creates that SHA. They are therefore remote verification facts to be recorded in the Issue #37 checkpoint and terminal ARQ return, without a second evidence-fixing push.

Required external final gate:

- `RUN_HEAD_SHA == exact Draft PR head`
- conclusion `success`
- artifact digest recorded exactly
- real Docker network-none test executed
- active-container cancellation executed
- real browser boundary executed (host Chromium or self-contained Playwright Docker fallback)
- G5 positive shadow executed against exact target SHA
- no Cloudflare version-producing workflow caused by R1
- production response/traffic unchanged
