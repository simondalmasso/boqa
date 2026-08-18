# Exact-head CI contract

Workflow: `.github/workflows/boqa-real-docker-soak-v1.yml` (`BOQA Real Docker Soak V1`)
Trigger: existing `workflow_dispatch` only, against `feat/atm-worker-readiness-r1` after the single final `[skip ci]` publication commit.
Required: run head SHA equals Draft PR head SHA; conclusion `success`; artifact `boqa-real-docker-soak-<head>` digest recorded externally in Issue #37 final ARQ checkpoint.

This committed file intentionally cannot contain its own future commit SHA or post-publication run ID without creating a new head. No post-PR evidence push is permitted.
