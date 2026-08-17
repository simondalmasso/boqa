"""Minimal GitHub REST client for workflow jobs and bounded job logs."""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from .models import GitHubRunRef

GITHUB_API_ORIGIN = "https://api.github.com"
GITHUB_WEB_ORIGIN = "https://github.com"
API_VERSION = "2026-03-10"
MAX_LOG_BYTES = 10 * 1024 * 1024
TIMEOUT_SECONDS = 20.0


class GitHubApiError(RuntimeError):
    """Sanitized GitHub API/auth/network failure."""


class LogTooLargeError(GitHubApiError):
    """Raised when a job log exceeds the configured memory bound."""


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req: urllib.request.Request, fp: Any, code: int, msg: str, headers: Any, newurl: str) -> None:
        return None


def parse_run_url(run_url: str) -> GitHubRunRef:
    """Validate and parse the only accepted GitHub Actions run URL grammar."""
    parsed = urllib.parse.urlsplit(run_url)
    if parsed.scheme != "https" or parsed.hostname != "github.com":
        raise ValueError("invalid GitHub Actions run URL")
    if parsed.username or parsed.password or parsed.port is not None:
        raise ValueError("invalid GitHub Actions run URL")
    if parsed.query or parsed.fragment:
        raise ValueError("invalid GitHub Actions run URL")
    parts = [part for part in parsed.path.split("/") if part]
    if len(parts) != 5 or parts[2:4] != ["actions", "runs"]:
        raise ValueError("invalid GitHub Actions run URL")
    owner, repo, run_id_text = parts[0], parts[1], parts[4]
    if not owner or not repo or not run_id_text.isdecimal():
        raise ValueError("invalid GitHub Actions run URL")
    run_id = int(run_id_text)
    if run_id <= 0:
        raise ValueError("invalid GitHub Actions run URL")
    canonical = f"{GITHUB_WEB_ORIGIN}/{owner}/{repo}/actions/runs/{run_id}"
    if run_url != canonical:
        raise ValueError("invalid GitHub Actions run URL")
    return GitHubRunRef(canonical, owner, repo, run_id)


def _headers(token: str | None = None) -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": API_VERSION,
        "User-Agent": "boqa-paid-work-v1",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _read_json(url: str, token: str | None = None) -> dict[str, Any]:
    request = urllib.request.Request(url, headers=_headers(token))
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            payload = response.read(2 * 1024 * 1024)
            if len(payload) >= 2 * 1024 * 1024:
                raise GitHubApiError("GitHub API response exceeded safe bound")
            value = json.loads(payload.decode("utf-8"))
            if not isinstance(value, dict):
                raise GitHubApiError("GitHub API returned unexpected JSON")
            return value
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        status = getattr(exc, "code", None)
        suffix = f" HTTP {status}" if status else ""
        raise GitHubApiError(f"GitHub API request failed{suffix}") from None


def fetch_run_jobs(ref: GitHubRunRef, token: str | None = None) -> list[dict[str, Any]]:
    """Fetch up to 100 jobs for a validated workflow run."""
    url = f"{GITHUB_API_ORIGIN}/repos/{ref.owner}/{ref.repo}/actions/runs/{ref.run_id}/jobs?per_page=100"
    payload = _read_json(url, token)
    jobs = payload.get("jobs")
    if not isinstance(jobs, list):
        raise GitHubApiError("GitHub jobs response missing jobs array")
    return [job for job in jobs if isinstance(job, dict)]


def _validate_redirect(location: str) -> str:
    parsed = urllib.parse.urlsplit(location)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise GitHubApiError("GitHub log redirect was not a safe HTTPS URL")
    return location


def _bounded_read(response: Any) -> str:
    data = response.read(MAX_LOG_BYTES + 1)
    if len(data) > MAX_LOG_BYTES:
        raise LogTooLargeError("GitHub job log exceeds 10 MiB limit")
    try:
        return data.decode("utf-8", errors="replace")
    except UnicodeError:
        raise GitHubApiError("GitHub job log could not be decoded") from None


def fetch_job_log(ref: GitHubRunRef, job_id: int, token: str | None = None) -> str:
    """Download one job log, stripping credentials before any temporary redirect."""
    url = f"{GITHUB_API_ORIGIN}/repos/{ref.owner}/{ref.repo}/actions/jobs/{job_id}/logs"
    request = urllib.request.Request(url, headers=_headers(token))
    opener = urllib.request.build_opener(_NoRedirect())
    try:
        response = opener.open(request, timeout=TIMEOUT_SECONDS)
    except urllib.error.HTTPError as exc:
        if exc.code not in {301, 302, 303, 307, 308}:
            raise GitHubApiError(f"GitHub log request failed HTTP {exc.code}") from None
        location = exc.headers.get("Location")
        if not location:
            raise GitHubApiError("GitHub log redirect missing location") from None
        redirect_url = _validate_redirect(location)
        redirected = urllib.request.Request(redirect_url, headers={"User-Agent": "boqa-paid-work-v1"})
        try:
            with urllib.request.urlopen(redirected, timeout=TIMEOUT_SECONDS) as redirected_response:
                return _bounded_read(redirected_response)
        except (urllib.error.URLError, TimeoutError) as redirect_exc:
            status = getattr(redirect_exc, "code", None)
            suffix = f" HTTP {status}" if status else ""
            raise GitHubApiError(f"GitHub redirected log download failed{suffix}") from None
    except (urllib.error.URLError, TimeoutError) as exc:
        status = getattr(exc, "code", None)
        suffix = f" HTTP {status}" if status else ""
        raise GitHubApiError(f"GitHub log request failed{suffix}") from None
    with response:
        return _bounded_read(response)
