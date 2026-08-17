"""Command-line interface for the BOQA GitHub Actions log parser."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Sequence

from .github_api import GitHubApiError, fetch_job_log, fetch_run_jobs, parse_run_url
from .parser import NoFailureError, parse_failure_log, select_failed_target


def build_parser() -> argparse.ArgumentParser:
    """Build the deterministic argparse command surface."""
    parser = argparse.ArgumentParser(description="Extract structured failure data from one GitHub Actions run.")
    parser.add_argument("run_url", help="https://github.com/{owner}/{repo}/actions/runs/{numeric_run_id}")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON output")
    parser.add_argument("--output", type=Path, help="Write JSON to this path instead of stdout")
    return parser


def run(run_url: str, pretty: bool = False) -> dict[str, object]:
    """Fetch and parse one validated GitHub Actions run into structured output."""
    ref = parse_run_url(run_url)
    token = os.environ.get("GITHUB_TOKEN") or None
    jobs = fetch_run_jobs(ref, token)
    job, step = select_failed_target(jobs)
    log_text = fetch_job_log(ref, int(job["id"]), token)
    return parse_failure_log(ref, job, step, log_text).to_dict()


def main(argv: Sequence[str] | None = None) -> int:
    """Execute CLI and return documented process exit code."""
    parser = build_parser()
    try:
        args = parser.parse_args(argv)
        payload = run(args.run_url, args.pretty)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    except GitHubApiError as exc:
        print(str(exc), file=sys.stderr)
        return 3
    except NoFailureError as exc:
        print(str(exc), file=sys.stderr)
        return 4
    indent = 2 if args.pretty else None
    rendered = json.dumps(payload, indent=indent, sort_keys=True, ensure_ascii=False) + "\n"
    if args.output:
        args.output.write_text(rendered, encoding="utf-8")
    else:
        sys.stdout.write(rendered)
    return 0
