"""Enforce public type-hint coverage across paid-work runtime modules."""

from __future__ import annotations

import importlib
import inspect
import unittest

MODULES = [
    "paid_work.gha_log_parser.models",
    "paid_work.gha_log_parser.github_api",
    "paid_work.gha_log_parser.parser",
    "paid_work.gha_log_parser.cli",
    "paid_work.workprotocol.client",
    "paid_work.workprotocol.state",
]


def public_type_hint_coverage() -> tuple[int, int, float]:
    """Return annotated public callable count, total count, and percentage."""
    total = 0
    annotated = 0
    for module_name in MODULES:
        module = importlib.import_module(module_name)
        callables: list[object] = []
        for name, obj in inspect.getmembers(module):
            if name.startswith("_"):
                continue
            if inspect.isfunction(obj) and getattr(obj, "__module__", None) == module_name:
                callables.append(obj)
            elif inspect.isclass(obj) and getattr(obj, "__module__", None) == module_name:
                for method_name, method in inspect.getmembers(obj, inspect.isfunction):
                    if not method_name.startswith("_"):
                        callables.append(method)
        for func in callables:
            total += 1
            signature = inspect.signature(func)
            params_ok = all(param.annotation is not inspect.Signature.empty for name, param in signature.parameters.items() if name not in {"self", "cls"})
            return_ok = signature.return_annotation is not inspect.Signature.empty
            if params_ok and return_ok:
                annotated += 1
    coverage = (100.0 * annotated / total) if total else 100.0
    return annotated, total, coverage


class TypeHintTests(unittest.TestCase):
    def test_public_type_hints_100_percent(self) -> None:
        annotated, total, coverage = public_type_hint_coverage()
        self.assertGreater(total, 0)
        self.assertEqual(annotated, total)
        self.assertEqual(coverage, 100.0)


if __name__ == "__main__":
    unittest.main()
