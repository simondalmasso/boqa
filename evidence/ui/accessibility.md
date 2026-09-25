# BOQA Turbo UI — Accessibility pass

Scope: static prototype source on lab/boqa-turbo-ui-v1.

## Static checks — PASS

- skip link exists and targets #workspace
- semantic nav/main/section/article/table/headings present
- all primary buttons are native buttons
- meaningful BOQA mascot usage has alt text; repeated gate mascot is decorative
- visible :focus-visible treatment exists
- keyboard routes implemented for F1/F2/F3/F4/F5/F6/F7/F8/F9/F10/Escape
- unavailable submit action is disabled and labeled NOT CONNECTED
- verdicts pair color with explicit text
- AMBIGUOUS uses caution styling, not success styling
- prefers-reduced-motion disables animation
- mobile command strip preserves access to primary surfaces

## Runtime accessibility status

Browser-rendered keyboard/focus/overflow/AX-tree validation could not be completed in this session because the browser connector was not connected and the execution sandbox had no network path to GitHub. Therefore this file does not claim WCAG conformance.

STATIC_ACCESSIBILITY_PASS=true
RUNTIME_ACCESSIBILITY_PASS=BLOCKED_BROWSER_CONNECTOR
