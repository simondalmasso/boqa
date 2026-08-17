"""Mocked CLI contract tests."""

from __future__ import annotations

import io
import json
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

from paid_work.gha_log_parser.cli import main
from paid_work.gha_log_parser.github_api import GitHubApiError

RUN_URL = "https://github.com/o/r/actions/runs/1"


class CliTests(unittest.TestCase):
    @patch("paid_work.gha_log_parser.cli.fetch_job_log", return_value="ERROR boom")
    @patch("paid_work.gha_log_parser.cli.fetch_run_jobs")
    def test_cli_success_json_schema(self, jobs: object, log: object) -> None:
        del log
        jobs.return_value = [{"id": 2, "name": "job", "conclusion": "failure", "started_at": "2026-01-01T00:00:00Z", "steps": [{"number": 1, "name": "step", "conclusion": "failure"}]}]
        out = io.StringIO()
        with redirect_stdout(out):
            code = main([RUN_URL])
        self.assertEqual(code, 0)
        payload = json.loads(out.getvalue())
        self.assertEqual(set(payload), {"run_url", "repository", "run_id", "job_id", "job_name", "failing_step_name", "error_message", "stack_trace", "suggested_fix_category"})

    @patch("paid_work.gha_log_parser.cli.fetch_run_jobs", side_effect=GitHubApiError("GitHub API request failed HTTP 403"))
    def test_cli_api_failure_exit_3(self, mocked: object) -> None:
        del mocked
        self.assertEqual(main([RUN_URL]), 3)


if __name__ == "__main__":
    unittest.main()
