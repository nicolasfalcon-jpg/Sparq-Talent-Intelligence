# 02 · Design system specification (approved V4.2)

**Source of truth:** `design-reference/v4.2/screens/*.dc.html` (the V4.2 prototype source), the live design canvas, and the screenshots in `screenshots/v4.2-approved/`.
**Implemented as code:** `src/design-system/` (`tokens.css`, `primitives.tsx`, `overlays.tsx`, `icons.tsx`, `Portrait.tsx`).

Rule for engineers: **never** hard-code a hex value, radius or shadow in a feature. Use a token (`bg-surface-muted`, `rounded-card`, `shadow-card`…) or add one to `tokens.css` first.

The values below were copied from the V4.2 source. Where something isn't in the prototype, the text says so.

---

## 1. Design principles (to keep)

1. **Calm consumer surface, enterprise substance.** Warm off-white canvas, generous white cards, a single coral accent, light display type with a medium-weight emphasis word.
2. **Evidence, never scores.** People are described by documented evidence levels and availability. There are no percentages, ranks, stars or "match %" values about a person anywhere in the UI.
3. **AI is visibly AI.** Every Ask Sparq surface uses the peach gradient and the coral spark glyph. Every answer carries a provenance tag.
4. **Humans decide.** Copy repeats it in the flows where it matters: "nothing is ranked and people make the decision", "Nobody is assigned automatically".

## 2. Color tokens

| Token | Hex | Usage |
|---|---|---|
| `canvas` | `#FAFAFA` | Page background |
| `surface` | `#FFFFFF` | Cards, drawers, nav pill |
| `surface-muted` | `#F5F5F7` | Inputs, soft pills, tags, inner panels, export modal |
| `surface-hover` | `#EBEBF0` | Pill hover |
| `ink` | `#1D1D1F` | Primary text, ink buttons, active nav item, selected pills |
| `ink-hover` | `#2E2F32` | Ink button hover |
| `ink-soft` | `#333336` | Secondary dark controls (tour bar buttons) |
| `ink-2` | `#424245` | Secondary text, inactive nav label |
| `mute` | `#6E6E73` | Muted text, captions |
| `mute-2` | `#8E8E93` | "Not documented" text |
| `faint` | `#AEAEB2` | Tertiary text, placeholder dots |
| `line` | `#E8E8ED` | Hairlines; pill inset border `inset 0 0 0 1px` |
| `line-strong` | `#D2D2D7` | Empty evidence ring, underline decoration |
| `seat-empty` | `#C7C7CC` | Dashed empty seat circles |
| `coral` | `#F15B40` | Brand mark, spark badges, FAB, focus ring, bullets, "today" lines |
| `coral-strong` | `#CF4529` | **Coral buttons** (AA with white text), section eyebrow on documents |
| `coral-hover` | `#B83C23` | Coral button hover |
| `coral-soft` | `#FF8A70` | "+" glyph on ink, accents on dark |
| `coral-tint` | `#FFF1E9` | "I looked for" interpreted-criteria strip |
| `peach-1…4` | `#FFE2D4` `#FFEDE5` `#FFF8F5` `#FFF9F7` | AI gradients (see §6) |
| `ok` / `ok-bright` | `#3E9B6A` / `#34A065` | Available / confirmed dots |
| `ok-text` / `ok-bg` / `ok-bg-2` / `ok-ring` | `#1F7A4A` / `#E3F3E8` / `#EEF7F1` / `#BFE3CC` | Confirmed labels, "Live/Computed" tag, success panels, confirmed portrait ring |
| `warn` / `warn-text` / `warn-ring` | `#C98A1E` / `#8A5A12` / `#F1D4A0` | Pending availability (outlined dot), pending text, pending portrait ring |
| Planning extras (in source) | `#E3A33B` pending bar, `#E9F4EC` free bar | Used only by Planning and the Build a Team availability strip |

**Dark mode:** none in V4.2. The product is light-only. Don't add a dark theme until it has been designed.

## 3. Typography

- **Family:** Inter (variable, self-hosted via `@fontsource-variable/inter`), fallback `system-ui, -apple-system`.
- **Weights:** 300 (display/light), 400, 500 (emphasis, labels, buttons), 600 (brand wordmark, eyebrows).
- **Base:** 15px / 1.5, letter-spacing `-0.006em`, antialiased.
- **Display pattern:** a light (300) phrase plus a medium (500) emphasis span, e.g. `Find the right <b>expertise.</b>`.

| Role | Size / line-height | Weight | Tracking | Where |
|---|---|---|---|---|
| Hero name | 64 / 1.0 | 300 + 500 | -0.045em | Passport hero |
| Display XL | 56 / 1.02 | 300 + 500 | -0.04em | Home greeting |
| Display L | 52 / 1.05 | 300 + 500 | -0.035em | People, Opportunities |
| Stat | 44 / 1.0 | 300 | -0.045em | Home stats |
| Section | 36 | 300 + 500 | -0.03em | Passport sections |
| Feature prompt | 34 / 1.15 | 300 + 500 | -0.03em | Home Ask card |
| Card title L | 32 / 1.1 | 300 | -0.03em | Opportunity card, drawer title |
| Drawer greeting | 28 / 1.2 | 300 | -0.025em | Ask Sparq empty state |
| Card title | 24–26 / 1.2 | 400 | -0.02em | Teams in the making, work items |
| Answer | 22 / 1.3 | 300 | -0.02em | Home Ask answer |
| Lead | 21 / 1.5 | 300 | -0.012em | Passport summary |
| Body L | 17 | 400 | -0.01em | Subtitles, card names |
| Body | 15–16 | 400 | | Default |
| Label | 14 | 500 | | Buttons, nav |
| Caption | 13 | 400 | | Meta, evidence detail |
| Micro | 11–12 | 500–600 | | Tags, provenance chips, eyebrows (`letter-spacing .04–.08em`) |

Responsive type: below 960px, display sizes step down (52→40, 56→44, 64→48). This is an implementation decision; V4.2 only tested display sizes down to 800px with wrapping.

## 4. Spacing, layout and radii

- **Page container:** max-width **1360px** (passport **1240px**), side padding **40px** (**20px** ≤1180px), top padding 12–24px, bottom 96–120px (room for the FAB).
- **Header:** 84px tall, 3 zones (brand flex-1 · nav pill · actions flex-1).
- **Grid gaps:** 8 / 12 / 14 / 16 / 18 / 20 / 24 / 32 / 44 / 56px. Card inner padding: 18–22px for small cards, 26–32px for large cards, 48px for the passport hero.
- **Home:** Ask card column `flex: 1 1 380px; max-width: 440px; min-height: 640px`, content column `flex: 999 1 560px`, gap 32.
- **People:** results grid 3 columns, or 2 columns when the 380px preview aside is open (`position: sticky; top: 16px`).

| Radius token | px | Used for |
|---|---|---|
| `pill` | 999 | Buttons, chips, nav, inputs, search bar |
| `sm` | 12 | Menu rows |
| `md` | 16 | Answer refs, notification rows |
| `lg` | 20 | Option rows, inner panels |
| `xl` | 22 | Role rows in drawers, AI summary strips |
| `card` | 24 | People cards, small surfaces |
| `surface` | 28 | Default white surface (`.sf`), Home team cards |
| `panel` | 32 | Opportunity cards, drawers, people preview |
| `feature` | 36 | Home Ask Sparq card, export modal |
| `hero` | 40 | Passport hero |

## 5. Elevation

| Token | Value | Used for |
|---|---|---|
| `shadow-card` | `0 1px 2px rgba(0,0,0,.03), 0 12px 32px rgba(0,0,0,.045)` | All white cards |
| `shadow-card-hover` | `0 2px 4px rgba(0,0,0,.03), 0 20px 44px rgba(0,0,0,.07)` + `translateY(-3px)` | Home cards (`.lift`) |
| `shadow-card-lift` | `0 14px 36px rgba(24,25,27,.07)` + `translateY(-2px)` | People/opportunity cards |
| `shadow-nav` | `0 1px 2px rgba(0,0,0,.04), 0 6px 20px rgba(0,0,0,.04)` | Nav pill, round header buttons |
| `shadow-search` | `0 8px 30px rgba(24,25,27,.05)` | People search bar |
| `shadow-popover` | `0 24px 64px rgba(0,0,0,.14)` | Header menus |
| `shadow-drawer` | `0 30px 80px rgba(24,25,27,.22)` | Drawers, modal |
| `shadow-toast` | `0 16px 40px rgba(24,25,27,.25)` | Toast, compare tray |
| `shadow-coral` | `0 6px 16px rgba(241,91,64,.35)` | Coral badges and send buttons |
| `shadow-fab` | `0 10px 28px rgba(241,91,64,.35), 0 2px 6px rgba(0,0,0,.08)` | Ask Sparq FAB |
| `shadow-ai-card` | `0 1px 2px rgba(241,91,64,.06), 0 20px 50px rgba(241,91,64,.10)` | Home Ask card |

Overlay scrims: drawers `rgba(24,25,27,.24)`, Ask Sparq `rgba(0,0,0,.14)`, export modal `rgba(0,0,0,.3)`.

## 6. Signature gradients & illustration

- `--gradient-ai-card` (Home Ask card), `--gradient-ai-soft` (inline AI strips, "Build a team" tiles), `--gradient-ai-drawer` (Ask Sparq drawer), `--gradient-ai-min` (minimized Ask card). All defined in `tokens.css`.
- **Orbit illustration:** coral radial glow, a sphere with a linear gradient `#FFE0D2 → #FF9B7C → #F15B40`, three rotated (-18°) ellipses at 18/24/30% stroke opacity, and small coral dots. It appears on the Home Ask card (`HomeAskCard.tsx`), the Ask Sparq drawer, Fill a role and the Showcase cover. Treat it as a brand asset and reuse the SVGs as they are.
- **Spark glyph:** `M12 2.5l2 6 6 2-6 2-2 6-2-6-6-2 6-2z`, filled white on a coral circle. Sizes: 30 (inline), 34 (header), 40–46 (cards), 52 (FAB). Exported as `public/sparq-mark.svg` and `src/app/icon.svg`.

## 7. Iconography

24×24 outline icons, stroke 1.6–1.8, round caps and joins (`src/design-system/icons.tsx`). The set: home, people, opportunities, planning, insights, me, passport, bell, arrowUpRight (card affordance), arrowUp (send), minus, expand, collapse, chevronUp, target, plus the role and team glyphs. **Don't mix in another icon library's style.** If you need a new icon, draw it to the same grid and stroke.

## 8. Portraits (illustrated, fictional)

`Portrait.tsx` holds 13 parametric SVG portraits (skin, hair, back and front hair shapes, shirt, background, optional beard). Sizes used: 32, 36, 38, 40, 44, 60, 72, 84, 96 and 148px.
- Each person card wraps the portrait in an availability ring: `0 0 0 3px #fff, 0 0 0 5px <ok-ring | warn-ring>`.
- Standalone SVGs are served by `GET /portraits/<id>` for exports and design tools.
- **Policy:** illustrated portraits only, in demo mode. Real photos come only with consent and only in production.

## 9. Components (implemented ↔ V4.2 source)

| Component | Variants / states | Code | V4.2 class |
|---|---|---|---|
| Pill button | default · ink · coral · soft · glass; sizes sm 34 / md 40 / lg 44 / xl 46; pressed → ink; disabled 50% | `Pill`, `PillLink`, `pillClass` | `.pill .p-ink .p-coral .p-soft .p-glass .p-sm` |
| Icon button | 36px circle ✕ | `IconButton` | `.pill.p-sm` w/ width 36 |
| Tag | 28 / 30px tall | `Tag` | `.tag` |
| Info chip | grey dot + 12px text | `InfoChip` | snapshot chip |
| Evidence dot | professional (filled ink) · independent (ink ring) · training (dashed grey ring) · emerging (coral) · not documented (light ring) | `EvidenceDot`, `EvidenceLegend` | `.d-p .d-i .d-t .d-e` |
| Skill chip | dot + label + optional "new" + remove | `SkillChip` | `.sk` |
| Availability dot | confirmed (filled green) · pending (white with amber ring) | `AvailabilityDot` | inline |
| Surface / card | white, radius 28, shadow-card; lift on hover | `Surface`, `liftCard` | `.sf .wh .card .oc .lift` |
| AI surface | peach gradient + spark badge | `AiSurface`, `SparqBadge` | inline |
| Display title | light + strong | `DisplayTitle` | h1 pattern |
| Skeleton line | coral shimmer gradient | `Skeleton` | loading bars |
| Drawer | right, inset 16, radius 32, widths 440 / 480 / 500 / 540 | `Drawer` (Radix Dialog) | `aside role=dialog` |
| Modal | centered, radius 36, two columns (330px controls + preview) | `Modal` | export modal |
| Toast | top 100px, center, ink capsule | `Toast` | toast |
| Header | nav pill, New-opportunity chooser, notifications, account and workspace switch | `AppHeader` | `v4-nav` |
| Ask Sparq | FAB · drawer (440 / 900 wide) · minimized card · empty / loading / answer / error | `AskSparqPanel`, `AnswerCard` | `v4-nav` |
| Compare tray | bottom center, ink capsule, stacked portraits | `CompareTray` | People tray |

**Not yet built (phase 2+), spec lives in the V4.2 source:** segmented stage stepper (Fill a role), seat card plus canvas (Build a Team), coverage meter, availability timeline (Planning and Team), capability dot matrix (Insights), Now/Next cards and interest sheet (My Space), the showcase tour bar.

## 10. Interaction states

- **Hover:** pill → `surface-hover`; ink → `ink-hover`; coral → `coral-hover`. Cards lift 2–3px with a larger shadow. Arrow circles invert to ink on card hover.
- **Focus:** `2px solid coral` outline with 3px offset on every focusable element. Never remove it.
- **Selected / pressed:** pills turn ink (`aria-pressed` / `aria-current`). The selected person card gets a 2px ink ring.
- **Disabled:** 50% opacity, `not-allowed` cursor (for example "Word document export is planned").
- **Loading:** inline copy ("Reading documented skills and availability…") plus coral skeleton lines. Never show a spinner alone.
- **Empty:** a white surface with a one-line headline and a muted hint ("No documented matches yet. / Remove a criterion or try another capability.").
- **Error:** inline `role="alert"` text plus a "Try again" soft pill. The route-level `error.tsx` uses the same style.
- **Motion:** 150–250ms ease-out (transform, box-shadow, background, width of the AI drawer). `prefers-reduced-motion` disables it.

## 11. Responsive behavior

V4.2 was validated at 1440, 1280, 1024 and 800px. It is desktop-first and wasn't designed for phones.

| Breakpoint | Behavior |
|---|---|
| ≥1180 | Full labels in the nav and on "New opportunity" |
| ≤1180 (`max-xl`) | Nav and "New opportunity" collapse to icons (labels stay as `aria-label` and `title`). Page padding drops to 20px. Home "ready" grid → 3 columns. |
| ≤960 (`max-lg`) | Display sizes step down. People preview aside is hidden in favor of opening the passport. Grids drop a column. |
| ≤900 (`max-md`) | 2-column grids → 1 column. Build a Team seats shrink to 170px (per V4.2). |
| <800 | **Not designed.** Needs a mobile design pass before shipping to phones. |

## 12. Navigation structure

- **Staff workspace** (Staffing Lead): Home `/` · People `/people` (→ passport `/people/[id]`, compare `/compare`) · Opportunities `/opportunities` (drawer `?open=<id>`, new role `/opportunities/new/role`, new team `/opportunities/new/team`) · Planning `/planning` · Insights `/insights`.
- **Personal workspace** (Engineer): My space `/me` · My passport `/me/passport`.
- **Header actions:** New opportunity (chooser: Fill a role / Build a team), Notifications, Account (workspace switch + passport link).
- **Global:** the Ask Sparq FAB on every page, context-aware by route.
- Every V4.2 drawer state that can be shared is URL-addressable in the app (`?open=`, `?sel=`, `?q=`, `?disc=`, `?soon=`).

## 13. Overlays & dialogs inventory

| Overlay | Trigger | Width | Notes |
|---|---|---|---|
| Opportunity details | card click | 540 | AI summary strip, team roles, footer "See availability" / "Build the team" |
| Edit profile | "Edit my passport", "+ Add experience" | 480 | Tabs About / Skills / Experience / Interests |
| Preview & export | "Preview profile" / "Preview & export" | max 1080 | Format list, hide client names, document preview (600px A4-like card) |
| Ask Sparq | FAB | 440 / 900 | Minimize to a 380px card, Escape minimizes |
| Header popovers | New opportunity / bell / avatar | 360 / 350 / 280 | radius 24–26 |
| Seat drawer (Team) | seat click | 500 | phase 2 |
| Proposal review (Team) | "Review & propose" | | phase 2 |
| Interest sheet (My Space) | "I'm interested" | | phase 2 |

## 14. Build a Team canvas (phase 2 spec)

From `design-reference/v4.2/screens/v4-team.dc.html`:
- **Canvas:** white, height 600px, radius 28, dotted grid `radial-gradient(#E8E8ED 1.2px, transparent 1.2px) 0 0 / 24px 24px`.
- **Center node:** the project card, 250px, ink background, radius 30, padding 22. It shows the industry, the project name, kick-off and duration, and a 4px-tall progress segment per seat.
- **Seats:** 212px white cards (170px ≤900px), radius 26, padding 16, `translate(-50%,-50%)`, placed on an ellipse. Seat *i* of *n* sits at angle `-90° + i·360/n`, with `x = 50 + cos·33 %` and `y = 50 + sin·34 %`. Connectors run from the center to each seat: solid when the seat is filled, dashed when it's open.
- **Seat content:** role title, person (portrait + name) or "Open seat · <seniority>", state chip (Confirmed / Proposed / Open), capability tags, availability dot (green = free before kick-off, amber = pending or late, coral = overlaps another team).
- **Legend:** bottom left, 13px muted.
- **Below the canvas:** a Coverage panel (documented / training-only / not documented / waiting on open seat), Availability conflicts, and a timeline strip with a kick-off marker.
- **Implementation recommendation:** React Flow (`@xyflow/react`) with custom node types (`projectNode`, `seatNode`), fixed layout (no free dragging in v1, pan and zoom disabled), and edges styled solid or dashed. Keep the same elliptical layout function so it matches the approved visual.

## 15. Product Showcase assets

`design-reference/v4.2/wrappers/v4-show-*.dc.html`, `v4-tour.dc.html` and `screenshots/v4.2-approved/12-showcase-cover.jpg`. These pages exist for presenting the concept: a cover, a guided journey and a 10-step tour bar. **They are not product features.** If a demo mode is needed in production, rebuild it as a separate `/demo` route group on seeded data, never on real tenants.
