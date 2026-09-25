# BOQA Turbo UI Design System

## Tokens

Workspace #0000A8 → #000070; chrome #C0C0C0; content #D8D8D8; title #000080 → #0000AA; cyan #55FFFF; success #55FF55; caution/human/ambiguity #FFFF55; failure/skip/rejected #FF5555; black #000; white #FFF.

## Typography

Local system monospace stack only: Courier New, Consolas, monospace. No remote font dependency.

## Geometry

2px high-contrast edges; 6px hard black shadow on major panels; minimal/no rounded corners; dense 7–14px spacing; clear table rules.

## Verdict semantics

REPRODUCED: green left rule + text. NOT_REPRODUCED: red left rule + text. AMBIGUOUS: yellow left rule + gray surface + text. Color is always paired with text.

## Motion

Normal interaction target <=180ms. Only preview feedback uses a short flash. prefers-reduced-motion: reduce disables animation.

## Accessibility

Semantic headings/tables/nav/status; skip link; keyboard shortcuts; visible focus; disabled unavailable actions; no color-only verdicts; meaningful mascot alt text; decorative repeated mascot empty-alt.
