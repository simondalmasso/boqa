"""Mission-scoped WorkProtocol command interface."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Sequence

from .client import TARGET_JOB_ID, WorkProtocolClient, WorkProtocolError
from .state import read_sanitized_state, write_sanitized_state


def build_parser() -> argparse.ArgumentParser:
    """Build the narrow provider command surface."""
    parser = argparse.ArgumentParser(description="BOQA ORDER-001 WorkProtocol provider")
    sub = parser.add_subparsers(dest="command", required=True)
    status = sub.add_parser("status")
    status.add_argument("--job-id", required=True)
    sub.add_parser("register")
    claim = sub.add_parser("claim")
    claim.add_argument("--job-id", required=True)
    deliver = sub.add_parser("deliver")
    deliver.add_argument("--job-id", required=True)
    deliver.add_argument("--claim-id", required=True)
    deliver.add_argument("--url", required=True)
    return parser


def _secret_store_path() -> Path:
    return Path.home() / ".config" / "boqa" / "workprotocol.env"


def _store_registration_secrets(response: dict[str, Any]) -> str:
    agent = response.get("agent") if isinstance(response.get("agent"), dict) else response
    agent_id = str(agent.get("id") or response.get("agentId") or "")
    api_key = response.get("apiKey")
    webhook_secret = response.get("webhookSecret")
    if not agent_id or not api_key:
        raise WorkProtocolError("registration response missing required identity or credential")
    path = _secret_store_path()
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    content = f"WORKPROTOCOL_AGENT_ID={agent_id}\nWORKPROTOCOL_API_KEY={api_key}\n"
    if webhook_secret:
        content += f"WORKPROTOCOL_WEBHOOK_SECRET={webhook_secret}\n"
    path.write_text(content, encoding="utf-8")
    path.chmod(0o600)
    return agent_id


def _print_json(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False))


def main(argv: Sequence[str] | None = None) -> int:
    """Execute the narrow WorkProtocol provider without exposing credentials."""
    args = build_parser().parse_args(argv)
    api_key = os.environ.get("WORKPROTOCOL_API_KEY") or None
    client = WorkProtocolClient(api_key)
    try:
        if args.command == "status":
            _print_json(client.status(args.job_id))
            return 0
        if args.command == "register":
            response = client.register()
            agent_id = _store_registration_secrets(response)
            write_sanitized_state({"agent_id": agent_id, "job_id": TARGET_JOB_ID, "registered": True})
            _print_json({"agent_id": agent_id, "registered": True})
            return 0
        state = read_sanitized_state()
        agent_id = str(os.environ.get("WORKPROTOCOL_AGENT_ID") or state.get("agent_id") or "")
        if args.command == "claim":
            if not agent_id:
                raise WorkProtocolError("WORKPROTOCOL_AGENT_ID is required")
            response = client.claim(args.job_id, agent_id)
            _print_json(response)
            return 0
        if args.command == "deliver":
            response = client.deliver(args.job_id, args.claim_id, args.url)
            _print_json(response)
            return 0
    except WorkProtocolError as exc:
        print(str(exc), file=sys.stderr)
        return 3
    return 2


raise SystemExit(main())
