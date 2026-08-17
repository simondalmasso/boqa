"""Deterministic failure selection, normalization, extraction, and classification."""

from __future__ import annotations

import re
from typing import Any

from .models import FailureSummary, GitHubRunRef

ANSI_RE = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")
TIMESTAMP_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\s*")
TS_ERROR_RE = re.compile(r"\bTS\d{3,5}\b", re.IGNORECASE)


class NoFailureError(RuntimeError):
    """Raised when no failed job or failed step can be selected."""


def normalize_log(log_text: str) -> list[str]:
    """Normalize ANSI sequences, CRLF, and GitHub timestamp prefixes."""
    normalized = log_text.replace("\r\n", "\n").replace("\r", "\n")
    result: list[str] = []
    for raw_line in normalized.split("\n"):
        line = ANSI_RE.sub("", raw_line)
        line = TIMESTAMP_RE.sub("", line)
        result.append(line.rstrip())
    return result


def classify_failure(lines: list[str]) -> str:
    """Classify normalized log lines using the mandated deterministic priority."""
    text = "\n".join(lines).lower()
    if any(marker in text for marker in ("pytest", "failed assertions", "jest", "test suites:", "tests:") ) or re.search(r"\b\d+ failed(?:,|\s)", text):
        return "test_failure"
    if TS_ERROR_RE.search(text) or any(marker in text for marker in ("compilation failed", "compiler error", "build failed", "tsc --", "typescript")):
        return "build_error"
    if any(marker in text for marker in ("pylint", "eslint", "lint error", "linting failed")):
        return "lint_error"
    return "unknown"


def _job_sort_key(job: dict[str, Any]) -> tuple[str, int]:
    started = str(job.get("started_at") or "9999-12-31T23:59:59Z")
    try:
        job_id = int(job.get("id") or 0)
    except (TypeError, ValueError):
        job_id = 0
    return started, job_id


def _step_number(step: dict[str, Any]) -> int:
    try:
        return int(step.get("number") or 2**31 - 1)
    except (TypeError, ValueError):
        return 2**31 - 1


def select_failed_target(jobs: list[dict[str, Any]]) -> tuple[dict[str, Any], dict[str, Any]]:
    """Select first failed job by started_at/id and first failed step by number."""
    failed_jobs = [job for job in jobs if str(job.get("conclusion") or "").lower() == "failure"]
    if not failed_jobs:
        raise NoFailureError("no failed job")
    job = sorted(failed_jobs, key=_job_sort_key)[0]
    steps = job.get("steps")
    if not isinstance(steps, list):
        raise NoFailureError("no failed step")
    failed_steps = [step for step in steps if isinstance(step, dict) and str(step.get("conclusion") or "").lower() == "failure"]
    if not failed_steps:
        raise NoFailureError("no failed step")
    return job, sorted(failed_steps, key=_step_number)[0]


def _candidate_error(lines: list[str]) -> str:
    patterns = (
        re.compile(r"\berror(?:\s+TS\d+)?\b", re.IGNORECASE),
        re.compile(r"\bfailed\b", re.IGNORECASE),
        re.compile(r"\bfatal\b", re.IGNORECASE),
        re.compile(r"\bpylint\b", re.IGNORECASE),
        re.compile(r"\beslint\b", re.IGNORECASE),
    )
    candidates: list[str] = []
    for line in lines:
        clean = line.strip()
        if clean and any(pattern.search(clean) for pattern in patterns):
            candidates.append(clean)
    if candidates:
        value = candidates[-1]
    else:
        nonempty = [line.strip() for line in lines if line.strip()]
        value = nonempty[-1] if nonempty else "failure reported without a log message"
    return value.encode("utf-8")[:4096].decode("utf-8", errors="ignore")


def _stack_trace(lines: list[str]) -> list[str]:
    selected: list[str] = []
    capture = False
    for line in lines:
        clean = line.strip()
        if not clean:
            if capture and selected:
                continue
            continue
        if clean.startswith("Traceback (most recent call last):"):
            capture = True
        if capture or re.match(r"^(at\s+|File \"|Caused by:|During handling)", clean):
            selected.append(clean)
            if len(selected) >= 50:
                break
    return selected[:50]


def parse_failure_log(ref: GitHubRunRef, job: dict[str, Any], step: dict[str, Any], log_text: str) -> FailureSummary:
    """Build the exact output schema from selected metadata and bounded log text."""
    lines = normalize_log(log_text)
    try:
        job_id = int(job["id"])
    except (KeyError, TypeError, ValueError):
        raise NoFailureError("failed job missing numeric id") from None
    error_message = _candidate_error(lines)
    return FailureSummary(
        run_url=ref.run_url,
        repository=ref.repository,
        run_id=ref.run_id,
        job_id=job_id,
        job_name=str(job.get("name") or ""),
        failing_step_name=str(step.get("name") or ""),
        error_message=error_message,
        stack_trace=_stack_trace(lines),
        suggested_fix_category=classify_failure([error_message]),
    )
