# Sparq Talent Intelligence — Engineering handoff

The approved design is **V4.2**. The design phase is closed, and this folder is the engineering reference.

| # | Document | What it answers |
|---|---|---|
| 01 | [Capability assessment & stack](01-capability-assessment.md) | What was built here, what needs an external environment, why Next.js |
| 02 | [Design system](02-design-system.md) | Tokens, typography, components, states, responsive rules, overlays, Build a Team canvas spec |
| 03 | [Functional specification](03-functional-spec.md) | Every module: goals, actions, inputs and outputs, navigation, rules, states, dependencies |
| 04 | [Data & domain](04-data-domain.md) | Entities, relationships, fictional dataset, real logic vs illustrative data, and the database design (ids, state transitions, allocation and availability, migration and seed strategy) |
| 05 | [Prototype-to-production gap analysis](05-gap-analysis.md) | Everything static, simulated, local-only or predefined in V4.2, and its production behavior |
| 06 | [Status & roadmap](06-roadmap.md) | Phase 1 delivered, phases 2–3 plan, definition of done |
| 07 | [Testing, environments & verification status](07-testing.md) | What was verified and how, the E2E isolation strategy, Playwright requirements, remaining limitations |
| 08 | [Authorization, evidence integrity, privacy & responsible discovery](08-authorization-and-evidence.md) | The authorization model, demo identity, assistant contract, evidence model and rules, interest privacy, assistant policy, the database access matrix and RLS verification results, remaining risks and phase 2C prerequisites |

**Visual references**
- `screenshots/v4.2-approved/`: 12 approved V4.2 screens captured in Play at 1440×900, downscaled to 800px wide.
- `screenshots/phase1-build/`: the phase-1 Next.js build rendered server-side, for side-by-side comparison.
- `../../design-reference/v4.2/`: V4.2 source files (**reference only, not runnable**).
- Live design canvas (private, ask the owner for access): `https://claude.ai/artifact/2KzK1wuPdSUkx6i8phpa7J` (Showcase: `#play-v4-show-cover`).

**Exclusions:** V1, V2 and V3 are not part of the implementation reference. They stay in the design project as history.
