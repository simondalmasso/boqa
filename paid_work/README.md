# BOQA GitHub Actions Log Parser

`paid_work` is an additive Python 3.11+ utility for ORDER-001. It parses a single GitHub-hosted Actions run and emits deterministic structured failure information. It does not alter BOQA replay, evidence, verification, dashboard, Cloudflare, Oracle, or payment infrastructure.

## Prerequisites and installation

Python 3.11 or newer is required. The runtime uses only the Python standard library.

```bash
python -m venv .venv
. .venv/bin/activate        # POSIX
# .venv\Scripts\activate  # Windows PowerShell
python -m pip install pylint==4.0.6
```

## Usage

Accepted URL grammar is exactly `https://github.com/{owner}/{repo}/actions/runs/{numeric_run_id}`.

```bash
python -m paid_work.gha_log_parser https://github.com/OWNER/REPO/actions/runs/123456789
python -m paid_work.gha_log_parser https://github.com/OWNER/REPO/actions/runs/123456789 --pretty
python -m paid_work.gha_log_parser https://github.com/OWNER/REPO/actions/runs/123456789 --output result.json
```

For private repositories or public log endpoints that deny anonymous access, set `GITHUB_TOKEN` in the process environment. The token is used only for GitHub API requests and is never emitted in JSON or errors. Temporary GitHub log redirects are followed without forwarding the authorization header.

## JSON schema

Every successful parse has exactly these semantic fields:

```json
{
  "run_url": "string",
  "repository": "owner/repo",
  "run_id": 0,
  "job_id": 0,
  "job_name": "string",
  "failing_step_name": "string",
  "error_message": "string",
  "stack_trace": ["string"],
  "suggested_fix_category": "test_failure|build_error|lint_error|unknown"
}
```

Example:

```json
{
  "run_url": "https://github.com/example/project/actions/runs/123456789",
  "repository": "example/project",
  "run_id": 123456789,
  "job_id": 987654321,
  "job_name": "tests",
  "failing_step_name": "Run unit tests",
  "error_message": "FAILED tests/test_example.py::test_value - AssertionError",
  "stack_trace": ["Traceback (most recent call last):", "File \"tests/test_example.py\", line 12, in test_value"],
  "suggested_fix_category": "test_failure"
}
```

## Deterministic semantics

Failed jobs are ordered by `started_at`, then numeric job ID. The first failed step is ordered by step number. Classification priority is: pytest/Jest → `test_failure`; TypeScript/compiler signatures → `build_error`; pylint/ESLint/lint signatures → `lint_error`; otherwise `unknown`. No LLM inference is used. ANSI sequences and GitHub timestamp prefixes are removed for parsing. Error messages are bounded to 4096 UTF-8 bytes, stack traces to 50 lines, and log downloads to 10 MiB.

## Exit codes

- `0`: structured parse produced.
- `2`: usage or invalid URL.
- `3`: GitHub API, authentication, network, redirect, or bounded-log failure.
- `4`: no failed job or no failed step.

## Tests and acceptance

```bash
python -m unittest discover -s paid_work/tests -p 'test_*.py'
python -m pylint paid_work.gha_log_parser paid_work.workprotocol
python -m paid_work.tests.acceptance_gate
```

The suite is fully mocked for GitHub API behavior and enforces 100% annotations on public runtime functions/methods.

## WorkProtocol provider

The narrow mission provider exposes only:

```bash
python -m paid_work.workprotocol status --job-id f82a9ca9-4b7f-4bdf-91c1-b5ae0516b4eb
python -m paid_work.workprotocol register
python -m paid_work.workprotocol claim --job-id f82a9ca9-4b7f-4bdf-91c1-b5ae0516b4eb
python -m paid_work.workprotocol deliver --job-id f82a9ca9-4b7f-4bdf-91c1-b5ae0516b4eb --claim-id UUID --url https://github.com/simonkey888/boqa/pull/NUMBER
```

It has no payment, x402, wallet-signing, bridge, swap, or withdrawal methods. Authentication is read only from environment/runtime secret storage and credentials are never printed.

## Privacy and limitations

Secrets, authorization headers, wallet private material, cookies, and tokens are excluded from committed evidence. The parser supports only GitHub-hosted Actions run URLs and intentionally reports only the first deterministically selected failed job/step. It does not parse arbitrary CI providers or infer prose fixes.
