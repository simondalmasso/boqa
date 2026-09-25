# BOQA Turbo UI — Future instrumentation plan

Planning only. No PostHog runtime dependency and no analytics write.

Candidate events if/when a real product project is explicitly authorized:
- boqa_view_opened {view, input}
- boqa_opportunity_selected {opportunity_id, decision_state}
- boqa_gate_previewed {gate_id, risk}
- boqa_gate_decision_preview {gate_id, decision}
- boqa_evidence_opened {evidence_ref, verdict}
- boqa_shortcut_used {key, destination}

Rules: never capture target URLs, raw evidence bodies, secrets, wallet data or private identifiers by default; prototype fixture IDs only in development; production project/retention/consent must be resolved before implementation; no event is necessary for prototype correctness.

PostHog tool discovery was attempted but the connected client did not expose the requested learn command; no write was attempted.
