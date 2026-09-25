# BOQA Turbo UI — rendered browser QA

Order: BOQA-UI-001-TURBO-PASCAL-PRODUCT-UI-V1  
Branch: `lab/boqa-turbo-ui-v1`  
Base: `0f756f682df915b8b97c84e38bcb8288b53d2009`

## Method

Rendered QA was executed with Playwright against Chromium `144.0.7559.96` using `page.set_content()`.

The harness was reconstructed from the current branch HTML/CSS/JS source because direct browser navigation to GitHub/local file URLs was blocked by the execution environment. It is therefore an equivalent rendered harness, not a claim of byte-identical direct branch navigation. Branch source content and scope were independently fetched from GitHub before the run.

The rendered mascot was a 256x256 transparent Adobe derivative of the official BOQA mascot. The canonical branch asset remains `prototype/turbo-ui/assets/boqa-mascot.png` at 1024x1024.

## Root-cause fixes found by rendering

Rendered QA exposed three mobile defects:

1. the shell declared three grid rows while mobile has four grid children, allowing the command bar to absorb free space;
2. the 360px command bar retained a 78px minimum width per button, clipping the fifth command;
3. the evidence table overflowed the 360px viewport.

All three were fixed only in `prototype/turbo-ui/styles.css`:

`e1037ef4ff5876a6dda086016330603e985e27de fix(ui): stabilize compact mobile layout`

No runtime, CUORE, Laya, ARQ1, ARQ2, deploy, merge, or production surface was touched.

## Required viewport matrix

| Viewport | Result | Document width | Console/page errors |
| --- | --- | ---: | --- |
| 1440x900 | PASS | 1440 | none |
| 1366x768 | PASS | 1366 | none |
| 390x844 | PASS | 390 | none |
| 360x800 | PASS | 360 | none |

Additional 360x800 surfaces also passed without horizontal overflow: Radar, Gates, Evidence, Help.

At 360px the compact command bar occupies exactly five 72px segments: Center, Radar, Gates, Evidence, Help.

## Interaction and keyboard QA

26/26 deterministic browser checks passed.

- F1 -> Help
- F2 -> Radar
- F3 -> Radar / opportunity
- F4 -> Gates
- F5 -> preview flash only; no navigation or external action
- F6 -> Evidence
- F7 -> Memory
- F8 -> Evidence
- F9 -> System
- F10 -> focuses File menu
- Escape -> Command Center
- Radar selection updates opportunity label/title/verdict/selection
- Approve/Deny remain PREVIEW-only and explicitly state no runtime/gate-bus/external state changed
- Submit remains disabled and labelled NOT CONNECTED
- AMBIGUOUS remains visually and textually distinct from success

## Accessibility / reduced motion

- first Tab focuses the skip link
- activating the skip link focuses `#workspace`
- visible focus treatment is present
- reduced-motion emulation computes preview animation to `none / 0s`
- verdict meaning is carried by text as well as color
- required mobile surfaces have no document-level horizontal overflow

This is a rendered interaction/accessibility pass, not a claim of full WCAG conformance or assistive-technology certification.

## Network / truthfulness

Required viewport runs emitted no non-data network requests.

The prototype continues to expose synthetic fixtures only and keeps unavailable actions visibly `PROTOTYPE`, `READ ONLY`, `PREVIEW`, `NOT CONNECTED`, or `N/D`.

## Screenshot evidence

The PNG captures were produced in the execution artifact workspace. GitHub connector access in this lane does not provide a direct container-binary upload bridge, so binaries are not falsely claimed as committed. Their SHA-256 values are recorded here:

- `desktop-1440x900.png` — `b628c8e06fddc7680985c2ab4fa5f974a6ee85a525dc25b61e56cce2939c2f89`
- `laptop-1366x768.png` — `caf1e7a9728472ff85a3eddd882928d9e54fbc1988fee92ca66fc5258cadca3f`
- `mobile-390x844.png` — `e5013b7bd2113e48f19dd2580a18c190f13f15e7d2ae164f7c2ec3ace97357b5`
- `mobile-360x800.png` — `f62e20c71974d48cbd742d6b053f02692bec784c47aaac57aabb490750eae396`
- `radar-360x800.png` — `3ad5035b420278676bc041b6281073bbc3c7eab35f8e1bed89d9564fcb20b302`
- `gates-360x800.png` — `5bb75ea79ee283be3d0797220bd00893a1ae155239ee5a74dcf53eda2f96df57`
- `evidence-360x800.png` — `6190b3bf36ee1f82e4109f055176d0b5dd0348bcec70e71668ebfaa61f74a542`
- `help-360x800.png` — `1552d4de68dc0c20da8381f038568e780b58ffa06d3d57dcd1857252632bd5fd`

Runtime QA JSON artifact SHA-256:
`2e2a1014e82535b38159e1085ee4f2f0f44e4a6460b3627bea9c163e37160071`

## Final statuses

`RENDERED_BROWSER_QA=PASS_EQUIVALENT_HARNESS`  
`REQUIRED_VIEWPORT_MATRIX=PASS`  
`KEYBOARD_INTERACTION_QA=PASS`  
`REDUCED_MOTION_QA=PASS`  
`ACCESSIBILITY_RENDERED_SMOKE=PASS`  
`NO_HORIZONTAL_OVERFLOW_REQUIRED_SURFACES=PASS`  
`NO_FAKE_STATE_PASS=true`  
`DIRECT_REPO_BROWSER_NAVIGATION=BLOCKED_ENVIRONMENT_POLICY_NON_BLOCKING`
