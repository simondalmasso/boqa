"""WorkProtocol provider safety tests."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from paid_work.workprotocol.client import TARGET_JOB_ID, WorkProtocolClient, WorkProtocolError


class WorkProtocolTests(unittest.TestCase):
    def test_refuses_other_job(self) -> None:
        with self.assertRaises(WorkProtocolError):
            WorkProtocolClient("x").claim("other", "agent")

    def test_deliver_refuses_unrelated_url(self) -> None:
        with self.assertRaises(WorkProtocolError):
            WorkProtocolClient("x").deliver(TARGET_JOB_ID, "claim", "https://evil.example/pull/1")

    @patch.object(WorkProtocolClient, "_request", return_value=(201, {"claim": {"id": "c"}}))
    def test_claim_payload_exact(self, mocked: object) -> None:
        response = WorkProtocolClient("x").claim(TARGET_JOB_ID, "agent-id")
        self.assertEqual(response["claim"]["id"], "c")
        args = mocked.call_args.args
        self.assertEqual(args[0], "POST")
        self.assertEqual(args[1], f"/api/jobs/{TARGET_JOB_ID}/claim")
        self.assertEqual(args[2], {"agentId": "agent-id"})


if __name__ == "__main__":
    unittest.main()
