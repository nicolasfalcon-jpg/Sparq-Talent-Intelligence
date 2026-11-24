# V4.2 design reference (approved)

These files are the **source of the approved V4.2 prototype**, built in Claude Design. They are here so engineers can read exact values (spacing, copy, SVG paths, state logic), not run them.

- They depend on the Claude Design runtime (`support.js`, `<x-dc>`, `{{ }}` holes, `sc-if`/`sc-for`, `DCLogic`), which is **not included** and won't run in a browser on its own.
- `screens/`: the 11 product screens plus the shared nav/Ask Sparq (`v4-nav`) and the portrait component.
- `wrappers/`: prototype-only wrappers (showcase pages, tour bar, staged states of Fill a Role, Build a Team and Ask Sparq). They hold demo navigation, **not** product architecture.
- `canvas-v4.2.json`: the canvas index, filtered to the V4.2 and Showcase pages.
- Session state in these files uses `localStorage` keys `sti42.*`. See `docs/handoff/05-gap-analysis.md` for what replaces each one.

Excluded on purpose: V1, V2 and V3. They're kept in the design project only.

**Reading tip:** each file's `<script data-dc-script>` holds the fixture data and state machine. The markup above it is the layout with inline styles, which map 1:1 to the tokens in `src/design-system/tokens.css`.
