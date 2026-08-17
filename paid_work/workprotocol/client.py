"""Allowlisted, zero-spend WorkProtocol API client for the exact mission job."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

WORKPROTOCOL_ORIGIN = "https://workprotocol.ai"
TARGET_JOB_ID = "f82a9ca9-4b7f-4bdf-91c1-b5ae0516b4eb"
TIMEOUT_SECONDS = 20.0


class WorkProtocolError(RuntimeError):
    """Sanitized WorkProtocol API failure."""


class WorkProtocolClient:
    """Minimal mission-scoped client with no payment or wallet-signing methods."""

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key

    def _request(self, method: str, path: str, payload: dict[str, Any] | None = None, auth: bool = False) -> tuple[int, dict[str, Any]]:
        if not path.startswith("/api/") or ".." in path:
            raise WorkProtocolError("refused non-allowlisted WorkProtocol path")
        headers = {"Accept": "application/json", "Content-Type": "application/json", "User-Agent": "boqa-paid-work-v1"}
        if auth:
            if not self._api_key:
                raise WorkProtocolError("WORKPROTOCOL_API_KEY is required")
            headers["Authorization"] = f"Bearer {self._api_key}"
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        request = urllib.request.Request(WORKPROTOCOL_ORIGIN + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
                raw = response.read(1024 * 1024)
                parsed = json.loads(raw.decode("utf-8")) if raw else {}
                return int(response.status), parsed if isinstance(parsed, dict) else {"value": parsed}
        except urllib.error.HTTPError as exc:
            try:
                raw = exc.read(1024 * 1024)
                parsed = json.loads(raw.decode("utf-8")) if raw else {}
                message = str(parsed.get("error") or parsed.get("message") or "request rejected") if isinstance(parsed, dict) else "request rejected"
            except (json.JSONDecodeError, UnicodeDecodeError):
                message = "request rejected"
            raise WorkProtocolError(f"WorkProtocol HTTP {exc.code}: {message}") from None
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, UnicodeDecodeError):
            raise WorkProtocolError("WorkProtocol service request failed") from None

    def status(self, job_id: str) -> dict[str, Any]:
        """Read sanitized remote state for the exact mission job."""
        self._require_target(job_id)
        _, payload = self._request("GET", f"/api/jobs/{job_id}")
        return payload

    def register(self) -> dict[str, Any]:
        """Register the deterministic BOQA agent using the owner-designated incoming payout address."""
        payload = {
            "name": "BOQA Paid Work Executor",
            "description": "BOQA paid-work executor for deterministic code delivery and evidence-backed verification.",
            "walletAddress": "0x71D176e3200A5963449102127daE7bAB41b6A6ed",
            "capabilities": {"categories": ["code"], "languages": ["python"], "maxJobValue": 75, "avgCompletionTime": "same day"},
            "pricing": {"minimumJobValue": 0, "acceptedCurrencies": ["USDC"]},
        }
        _, response = self._request("POST", "/api/agents/register", payload)
        return response

    def claim(self, job_id: str, agent_id: str) -> dict[str, Any]:
        """Claim only the exact mission job; never enumerate or claim another job."""
        self._require_target(job_id)
        _, response = self._request("POST", f"/api/jobs/{job_id}/claim", {"agentId": agent_id}, auth=True)
        return response

    def deliver(self, job_id: str, claim_id: str, url: str) -> dict[str, Any]:
        """Deliver one public GitHub PR URL for the exact mission claim."""
        self._require_target(job_id)
        if not url.startswith("https://github.com/simonkey888/boqa/pull/"):
            raise WorkProtocolError("deliverable URL is outside the authorized BOQA PR scope")
        payload = {"claimId": claim_id, "deliverable": {"type": "url", "url": url}}
        _, response = self._request("POST", f"/api/jobs/{job_id}/deliver", payload, auth=True)
        return response

    @staticmethod
    def _require_target(job_id: str) -> None:
        if job_id != TARGET_JOB_ID:
            raise WorkProtocolError("refused job outside ORDER-001 target")
