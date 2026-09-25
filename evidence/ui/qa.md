# BOQA Turbo UI — QA evidence

Order: BOQA-UI-001-TURBO-PASCAL-PRODUCT-UI-V1

## Source integrity

Base: 0f756f682df915b8b97c84e38bcb8288b53d2009
Branch: lab/boqa-turbo-ui-v1
Allowed roots only: prototype/turbo-ui/**, research/ui/**, evidence/ui/**

Static checks:
- required 10-item desktop menu: PASS
- explicit PROTOTYPE / READ ONLY / NOT CONNECTED language: PASS
- no fetch/XMLHttpRequest/WebSocket/Cloudflare runtime use in app.js: PASS
- reduced-motion rule: PASS
- mobile breakpoints: PASS
- keyboard map: PASS
- semantic verdict set REPRODUCED / NOT_REPRODUCED / AMBIGUOUS: PASS
- AMBIGUOUS not success-styled: PASS
- Human Gate reason/risk/evidence/proposed action + PREVIEW approve/deny: PASS
- gate explicitly says unrelated work continues: PASS
- mascot integration in Command Center, Gate, Help: PASS
- skip link and visible focus: PASS
- fake hacking/scan/theatrics patterns: PASS

## Product Design QA

Attempted per design-qa workflow. Browser-rendered implementation capture is required to pass. The Opera Browser Connector returned "Browser not connected" and sandbox DNS could not resolve GitHub, so source-vs-rendered screenshot comparison is blocked. No false PASS is recorded.

PRODUCT_DESIGN_QA=BLOCKED_BROWSER_CAPTURE

## UX pressure test — equivalent

UX Pilot was used to model the required primary flow. It preserved:
Command Center/Radar -> opportunity -> policy/scope -> decision -> human gate if needed -> evidence -> submission status -> payout status,
with parallel radar research/verification access during a human gate. The implemented IA matches that model.

Highest-value safeguards:
1. unavailable external actions stay visibly NOT CONNECTED
2. human authorization is localized to dependent work
3. N/D is preferred to invented health/settlement state
4. verdict semantics remain inspectable without color
5. mobile retains a compact command strip rather than emulating 80x25 DOS

THOUGHTFULBITS_EQUIVALENT_REVIEW=PASS_STATIC
RUNTIME_ACTION_EFFICIENCY_REVIEW=BLOCKED_BROWSER_CAPTURE

## Superdesign

One bare CLI preflight was attempted with a 20s bound and timed out. Per Issue #51 this is non-blocking.

SUPERDESIGN_USED=false
SUPERDESIGN_BLOCKER=CLI_PREFLIGHT_TIMEOUT

## Screenshot matrix

1440x900: BLOCKED_BROWSER_CAPTURE
1366x768: BLOCKED_BROWSER_CAPTURE
390x844: BLOCKED_BROWSER_CAPTURE
360x800: BLOCKED_BROWSER_CAPTURE

Responsive CSS contract exists for desktop, <=900px and <=600px, but source inspection is not substituted for screenshot evidence.

## Result

No implementation blocker found in static inspection.
Release/integration is NOT authorized by this lane.
The only remaining evidence blocker is browser-rendered capture and interaction QA.
