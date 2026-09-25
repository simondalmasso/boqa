# Laya qualification for BOQA

Mission: `BOQA-PARALLEL-001-LAYA-RADAR-SKILL-QUALIFICATION`
Lean base: `f734e229f442d83a873cd473a929883a846ec8c6`
Evidence timestamp: 2026-09-25T03:26:00Z

This is qualification evidence only. It does not integrate Laya into BOQA, authorize target requests, bids, submissions, wallet actions, merge, deploy, or production changes.

## Qualification verdict

- PRIMARY_RUNTIME: `@receptron/laya@0.1.2`
- PRIMARY_RUNTIME_SHA: `6478649e723122ca24bbf5fb69ed1010023c9750`
- PRIMARY_MODEL: `convaiinnovations/laya`, typed-decisions variant for the BOQA benchmark
- MODEL_SOURCE_REVISION: `55cf4c4ebb4ebe31b2550e8bdf3bd21b99753851`
- MODEL_LICENSE: Apache-2.0
- RUNTIME_LICENSE: MIT
- ZERO_COST: yes after local model acquisition/cache
- FINAL_AUTHORITY: no
- MODE: shadow/advisory only
- OPENJEV: challenger/benchmark only; no dual-stack
- WINDOWS_FEASIBILITY: feasible, but BOQA-host latency/RAM must be measured before admission

The Node/ONNX wrapper is the smallest BOQA-facing runtime because it matches the existing Node stack and removes Python from steady-state inference. Its documented default public ONNX bundle is the English checkpoint. BOQA should not silently substitute that for the typed-decisions candidate: export the pinned official typed-decisions checkpoint to ONNX, pin the resulting bundle, then parity-check it against the official implementation.

## Candidate matrix

| candidate | model/revision | runtime | size | RAM | CPU/GPU | Windows | Node | offline | network needed | API cost | supply-chain risk |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Official Laya | convaiinnovations/laya @ 55cf4c4ebb4ebe31b2550e8bdf3bd21b99753851 | Python/PyTorch/Transformers | published model repo approx 843 MB; variant-specific bytes must be pinned | NOT_MEASURED_BOQA | CPU possible; GPU optional | feasible via Python; not measured on BOQA host | indirect | yes after snapshot | first acquisition only | USD 0 | medium: Python/ML dependency tree |
| @receptron/laya 0.1.2 | runtime SHA 6478649e723122ca24bbf5fb69ed1010023c9750 | Node >=20 + onnxruntime-node | default English fp32 ONNX bundle approx 1.7 GB | author guidance approx 2 GB loaded + batch overhead | CPU provider supported | feasible on supported Node/ORT Windows x64; BOQA measurement required | direct | yes with pinned local modelDir/cache | first acquisition only | USD 0 | medium: native ORT + external model bundle |
| laya.cpp | e1c6e7832189d36903e90c6fe3b8b1fece7f6f17 | native C++20/ggml | model dependent | NOT_MEASURED_BOQA | optimized CUDA/Vulkan; native runtime | published Windows x64 CUDA/Vulkan releases | indirect HTTP/CLI | yes after model acquisition | first acquisition only | USD 0 | medium-high: native backend/build surface |
| NandhaKishorM/laya reference | 970dc8c5f63d7b886a68409493f37d569424f933 | Python reference/research | model dependent | NOT_MEASURED_BOQA | CPU/GPU | feasible via Python | no direct | yes after cache | first acquisition only | USD 0 | medium; reference implementation, not the leanest BOQA runtime |

## Runtime facts relevant to BOQA

`@receptron/laya` documents Node 20+, ONNX Runtime, CPU execution, local `modelDir`, revision pinning, and a default first-use download cached under `~/.cache/receptron-laya`. Its README budgets roughly 2 GB RAM for the loaded fp32 model plus batch overhead and reports about 140 ms for three batched questions on Apple silicon. Those latency numbers are not BOQA Windows measurements and MUST NOT be used as acceptance evidence.

A third-party Docker review of 0.1.2 measured a warm CPU answer around 452 ms after a 3.7 s load on 4 CPU cores, but that is challenger evidence only, not the BOQA benchmark.

`laya.cpp` has current Windows CUDA/Vulkan binaries and can serve a Jev-compatible HTTP endpoint. It is a performance challenger, not the primary integration, because it adds a native runtime/build surface that BOQA does not need unless the Node path fails resource gates.

## Admission gates after CORE001

1. Use the exact machine-readable fixtures in `evidence/qualification/laya-benchmark/fixtures.json`.
2. Run deterministic DecisionKernel baseline first and freeze its outputs.
3. Run Laya in shadow only; never let it override hard policy/scope/capability/payout/economic gates.
4. Measure on the actual BOQA Windows host:
   - cold startup latency
   - warm inference p50/p95
   - peak working set/RSS
   - CPU utilization
   - offline behavior after pinned cache
   - network attempts during offline inference
5. Fail admission if any output implies permission expansion, scope expansion, wallet authority, submit authority, or REPRODUCED.
6. Required quality comparison: decision accuracy, human-gate recall, false-admission rate, latency, RAM, CPU, and zero-cost operation.
7. Pin model + runtime revisions. Never ship `revision: main`.
8. If the Node typed-decisions export cannot be parity-checked, fall back to official Python for benchmark only; do not silently use the English ONNX bundle as the BOQA production candidate.

## Supply-chain notes

ToolCheck snapshots at qualification time:
- receptron/laya: 56/100, Caution, live.
- lkarlslund/laya.cpp: 60/100, Caution, live.
- NandhaKishorM/laya: 60/100, Caution, live.

No ToolCheck result constitutes admission. BOQA still needs source pinning, license capture, checksum manifest, deterministic tests, and the shadow benchmark.

## Primary evidence

- Hugging Face model: https://huggingface.co/convaiinnovations/laya
- Hugging Face ONNX bundle: https://huggingface.co/receptron/laya-onnx
- Node runtime: https://github.com/receptron/laya
- Native challenger: https://github.com/lkarlslund/laya.cpp
- Reference/research repo: https://github.com/NandhaKishorM/laya
- Model revision provenance witness: https://pirateface.co/convaiinnovations/laya
