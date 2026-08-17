"""Mocked deterministic parser tests."""

from __future__ import annotations

import unittest

from paid_work.gha_log_parser.github_api import parse_run_url
from paid_work.gha_log_parser.parser import NoFailureError, classify_failure, normalize_log, parse_failure_log, select_failed_target


class ParserTests(unittest.TestCase):
    def setUp(self) -> None:
        self.ref = parse_run_url("https://github.com/simonkey888/boqa/actions/runs/30590791916")
        self.job = {"id": 10, "name": "job", "conclusion": "failure", "started_at": "2026-01-01T00:00:00Z", "steps": [{"number": 2, "name": "fail", "conclusion": "failure"}]}
        self.step = self.job["steps"][0]

    def test_t01_valid_url(self) -> None:
        self.assertEqual(self.ref.run_id, 30590791916)

    def test_t02_invalid_url(self) -> None:
        bad = ["http://github.com/a/b/actions/runs/1", "https://evil.example/a/b/actions/runs/1", "https://u:p@github.com/a/b/actions/runs/1", "https://github.com/a/b/actions/runs/nope", "https://github.com/a/b/actions/runs/1#x"]
        for value in bad:
            with self.subTest(value=value), self.assertRaises(ValueError):
                parse_run_url(value)

    def test_t04_no_failed_job(self) -> None:
        with self.assertRaises(NoFailureError):
            select_failed_target([{"id": 1, "conclusion": "success"}])

    def test_t05_pytest_failure(self) -> None:
        self.assertEqual(classify_failure(["pytest", "2 failed, 8 passed"]), "test_failure")

    def test_t06_jest_failure(self) -> None:
        self.assertEqual(classify_failure(["Jest", "Test Suites: 1 failed"]), "test_failure")

    def test_t07_typescript_failure(self) -> None:
        self.assertEqual(classify_failure(["src/a.ts(1,2): error TS2322: bad type"]), "build_error")

    def test_t08_compilation_failure(self) -> None:
        self.assertEqual(classify_failure(["Compilation failed with 2 errors"]), "build_error")

    def test_t09_pylint_failure(self) -> None:
        self.assertEqual(classify_failure(["pylint: missing-module-docstring"]), "lint_error")

    def test_t10_eslint_failure(self) -> None:
        self.assertEqual(classify_failure(["ESLint found 3 problems"]), "lint_error")

    def test_t11_multiline_stack_and_normalization(self) -> None:
        lines = ["Traceback (most recent call last):"] + [f"  File \"x.py\", line {i}, in f" for i in range(70)] + ["ValueError: boom"]
        summary = parse_failure_log(self.ref, self.job, self.step, "\n".join(lines))
        self.assertLessEqual(len(summary.stack_trace), 50)
        normalized = normalize_log("2026-01-01T00:00:00.000Z \x1b[31mERROR\x1b[0m\r\n")
        self.assertEqual(normalized[0], "ERROR")

    def test_t12_unknown_failure(self) -> None:
        summary = parse_failure_log(self.ref, self.job, self.step, "Process completed with exit code 1.")
        self.assertEqual(summary.suggested_fix_category, "unknown")
        self.assertTrue(summary.error_message)

    def test_t14_deterministic_target_selection(self) -> None:
        jobs = [
            {"id": 9, "name": "later", "conclusion": "failure", "started_at": "2026-01-02T00:00:00Z", "steps": [{"number": 1, "name": "x", "conclusion": "failure"}]},
            {"id": 7, "name": "first", "conclusion": "failure", "started_at": "2026-01-01T00:00:00Z", "steps": [{"number": 4, "name": "later step", "conclusion": "failure"}, {"number": 2, "name": "first step", "conclusion": "failure"}]},
        ]
        job, step = select_failed_target(jobs)
        self.assertEqual(job["id"], 7)
        self.assertEqual(step["number"], 2)

    def test_prior_successful_tests_do_not_misclassify_terminal_failure(self) -> None:
        log = "pytest 20 passed\nTest Suites: 5 passed\n##[error]Process completed with exit code 1."
        summary = parse_failure_log(self.ref, self.job, self.step, log)
        self.assertEqual(summary.suggested_fix_category, "unknown")

    def test_error_message_bound(self) -> None:
        summary = parse_failure_log(self.ref, self.job, self.step, "ERROR " + "x" * 10000)
        self.assertLessEqual(len(summary.error_message.encode("utf-8")), 4096)


if __name__ == "__main__":
    unittest.main()
