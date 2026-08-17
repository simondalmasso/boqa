"""Sanitized local operational state persistence."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

STATE_DIR = Path(".boqa-paid-work")
STATE_PATH = STATE_DIR / "state.json"
FORBIDDEN_KEYS = {"apikey", "api_key", "authorization", "webhooksecret", "webhook_secret", "privatekey", "private_key", "seed", "seed_phrase"}


def write_sanitized_state(data: dict[str, Any]) -> None:
    """Persist only non-secret state in the gitignored mission directory."""
    for key in data:
        if key.lower() in FORBIDDEN_KEYS:
            raise ValueError("refused secret-bearing state key")
    STATE_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    STATE_PATH.chmod(0o600)


def read_sanitized_state() -> dict[str, Any]:
    """Load sanitized state if present, otherwise return an empty mapping."""
    if not STATE_PATH.exists():
        return {}
    value = json.loads(STATE_PATH.read_text(encoding="utf-8"))
    return value if isinstance(value, dict) else {}
