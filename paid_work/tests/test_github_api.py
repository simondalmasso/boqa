"""Mocked GitHub client tests."""

from __future__ import annotations

import io
import unittest
import urllib.error
from unittest.mock import MagicMock, patch

from paid_work.gha_log_parser.github_api import GitHubApiError, fetch_job_log, fetch_run_jobs, parse_run_url


class _Response:
    def __init__(self, data: bytes, status: int = 200) -> None:
        self._data = io.BytesIO(data)
        self.status = status

    def read(self, size: int = -1) -> bytes:
        return self._data.read(size)

    def __enter__(self) -> "_Response":
        return self

    def __exit__(self, exc_type: object, exc: object, tb: object) -> None:
        return None


class GitHubApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.ref = parse_run_url("https://github.com/o/r/actions/runs/1")

    @patch("urllib.request.urlopen")
    def test_t03_network_error_sanitized(self, mocked: MagicMock) -> None:
        mocked.side_effect = urllib.error.URLError("secret-token-value")
        with self.assertRaises(GitHubApiError) as caught:
            fetch_run_jobs(self.ref, "secret-token-value")
        self.assertNotIn("secret-token-value", str(caught.exception))

    @patch("urllib.request.urlopen")
    def test_jobs_payload(self, mocked: MagicMock) -> None:
        mocked.return_value = _Response(b'{"jobs":[{"id":1}]}')
        self.assertEqual(fetch_run_jobs(self.ref), [{"id": 1}])

    @patch("urllib.request.urlopen")
    @patch("urllib.request.OpenerDirector.open")
    def test_t13_redirect_never_forwards_token(self, first_open: MagicMock, redirected_open: MagicMock) -> None:
        headers = {"Location": "https://example-storage.invalid/log.txt"}
        first_open.side_effect = urllib.error.HTTPError("x", 302, "Found", headers, None)
        redirected_open.return_value = _Response(b"ERROR boom")
        self.assertEqual(fetch_job_log(self.ref, 99, "super-secret-token"), "ERROR boom")
        request = redirected_open.call_args.args[0]
        self.assertNotIn("Authorization", request.headers)
        self.assertNotIn("super-secret-token", str(request.headers))


if __name__ == "__main__":
    unittest.main()
