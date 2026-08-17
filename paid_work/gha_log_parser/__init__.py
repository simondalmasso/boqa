"""Deterministic GitHub Actions failure parser."""

from .models import FailureSummary, GitHubRunRef
from .parser import classify_failure, parse_failure_log, select_failed_target

__all__ = ["FailureSummary", "GitHubRunRef", "classify_failure", "parse_failure_log", "select_failed_target"]
