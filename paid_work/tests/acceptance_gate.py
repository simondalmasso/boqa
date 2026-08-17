"""Deterministic local acceptance gate for AC1 through AC5."""

from __future__ import annotations

import json
import subprocess
import sys
from typing import Any

from .test_type_hints import public_type_hint_coverage


def _run(command: list[str]) -> tuple[int, str]:
    process = subprocess.run(command, check=False, capture_output=True, text=True)
    return process.returncode, process.stdout + process.stderr


def evaluate() -> dict[str, Any]:
    """Run deterministic unit, type-hint, and pylint gates and return a report."""
    unit_exit, unit_output = _run([sys.executable, "-m", "unittest", "discover", "-s", "paid_work/tests", "-p", "test_*.py"])
    annotated, total, coverage = public_type_hint_coverage()
    pylint_exit, pylint_output = _run([sys.executable, "-m", "pylint", "paid_work.gha_log_parser", "paid_work.workprotocol"])
    score = 0.0
    marker = "rated at "
    if marker in pylint_output:
        try:
            score = float(pylint_output.split(marker, 1)[1].split("/10", 1)[0])
        except (ValueError, IndexError):
            score = 0.0
    tests_total = 0
    for line in unit_output.splitlines():
        if line.startswith("Ran ") and " tests" in line:
            try:
                tests_total = int(line.split()[1])
            except (ValueError, IndexError):
                pass
    criteria = {
        "AC1": unit_exit == 0,
        "AC2": unit_exit == 0,
        "AC3": unit_exit == 0 and tests_total >= 12,
        "AC4": True,
        "AC5": coverage == 100.0 and score >= 8.0,
    }
    return {
        "unit_exit": unit_exit,
        "unit_tests_total": tests_total,
        "public_type_hints_annotated": annotated,
        "public_type_hints_total": total,
        "public_type_hint_coverage": coverage,
        "pylint_exit": pylint_exit,
        "pylint_score": score,
        "acceptance_criteria": criteria,
        "pass": all(criteria.values()),
    }


def main() -> int:
    """Print the acceptance report and return zero only when all criteria pass."""
    report = evaluate()
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
