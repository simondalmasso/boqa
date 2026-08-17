"""Data models for deterministic GitHub Actions parsing."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True)
class GitHubRunRef:
    """Validated identity extracted from a GitHub Actions run URL."""

    run_url: str
    owner: str
    repo: str
    run_id: int

    @property
    def repository(self) -> str:
        """Return owner/repository in canonical display form."""
        return f"{self.owner}/{self.repo}"


@dataclass(frozen=True)
class FailureSummary:
    """Exact structured output contract for one failed GitHub Actions target."""

    run_url: str
    repository: str
    run_id: int
    job_id: int
    job_name: str
    failing_step_name: str
    error_message: str
    stack_trace: list[str]
    suggested_fix_category: str

    def to_dict(self) -> dict[str, Any]:
        """Return a JSON-serializable dictionary."""
        return asdict(self)
