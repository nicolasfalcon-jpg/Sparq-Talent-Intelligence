# 03 · Functional specification — Sparq Talent Intelligence (V4.2)

| | |
|---|---|
| **Source of truth** | Approved prototype V4.2, `design-reference/v4.2/v4-*.dc.html` + `v3-portrait.dc.html` (Claude Design format) |
| **Audience** | Engineers rebuilding the product in Next.js (App Router) + Supabase |
| **Companion doc** | `05-gap-analysis.md` (what is fake in the prototype and how to build it for real) |
| **Status** | Handoff draft · November 2026 |

## 0. How to read this document

- Everything described as **"Prototype"** is observed behavior in the V4.2 source. File names are cited in `code` style.
- Everything labelled **"Proposed"** is a recommendation for production. It is not in the prototype and needs product sign-off.
- Where a state does not exist in V4.2 the spec says **"Not designed in V4.2 — needs design"** and gives a proposed behavior.
- UI copy is quoted exactly, including curly quotes and the middle dot `·`. Keep the copy as-is unless product/UX changes it.
- The prototype is pinned to a fictional "today" of **Tuesday, November 24, 2026**. Internally, dates are day offsets from Nov 1, 2026 (e.g. `23` = Nov 24 = "now", `65` = Jan 5, `72` = Jan 12 kick-off, `91` = Jan 31). Production must use real dates.

### 0.1 Non-negotiable product principles (apply to every module)

| # | Principle | Where it shows in the prototype |
|---|---|---|
| P1 | **Fictional data only** in demos; no real people, clients or projects. | Cover: "All people, clients, projects and AI responses are fictional"; export footer "Internal use only · fictional prototype data". |
| P2 | **No scoring or ranking of people.** Show documented evidence; "nothing is ranked and people make the decision". | People subtitle "matched on documented experience, never on scores."; Compare subtitle; Role: "I show where experience is documented. I don’t rank or decide."; Insights "Never a performance measure." |
| P3 | **Evidence levels**: Professional · Independent · Training · Emerging · Not documented. | Passport legend; Role/Team/Compare cells (filled / half-filled / empty). |
| P4 | **Human review before any assignment.** "Nobody is assigned automatically." Proposing ≠ assigning. | Role: "Proposing isn’t assigning…"; Team: "nothing is assigned automatically"; sent banners "Nobody has been assigned." |
| P5 | **Availability is either Confirmed or Pending confirmation** (plus "Proposed for a team" as an overlay). | People preview, Planning legend, Team conflicts. |
| P6 | **The engineer owns their passport and interests**; interests are "never used to evaluate you". | My space, Edit passport, Interests tab. |

### 0.2 Personas

| Persona | Mode | Prototype identity | Sees |
|---|---|---|---|
| **Staffing Lead** | `staff` | **Laura Gómez**, "Staffing Lead" | Home, People, Opportunities, Planning, Insights, staff passport view, Fill a role, Build a team, Compare. "New opportunity" button. |
| **Engineer** | `personal` | **Ana Ruiz**, "Senior Mobile Engineer" | My space, My passport only. No "New opportunity" button. |
| Delivery lead (reviewer) | — (not a logged-in persona in V4.2) | **Rafael Ortiz** (Vela Bank, Terra Foods), **Inés Vidal** (Cobalt, Nimbus, Kestrel team reviewer) | Only referenced as reviewer/confirmer. **Proposed:** needs its own review inbox (not designed). |

The prototype switches persona via the account menu ("Staffing" / "My space"). **Proposed:** in production persona = authenticated user's role(s); a user holding both roles may switch, others may not.

### 0.3 Evidence levels (canonical model)

| Level | Prototype code | Visual | Meaning in copy |
|---|---|---|---|
| Professional | `p` | filled dark dot | "Professional project experience recorded in a passport." |
| Independent | `i` | (passport legend dot) | Self-driven / open-source work, e.g. "Independent project · self-reported". |
| Training | `t` | half-filled dot | "Learning is documented, client project experience is not yet." |
| Emerging | `e` | (passport legend dot) | Early interest, e.g. "LLM on mobile — Emerging". |
| Not documented | absent | empty outlined dot | "It may be a real gap or simply undocumented: ask the people involved." |

**Important inconsistency:** only the Passport uses all five levels. People, Fill a role, Build a team and Compare collapse levels to three (`p` / `t` / none); Insights uses "Professional" vs "Growing". **Proposed:** store all five in the database; matching screens may group Independent+Training+Emerging under "Training or partial" visually but must keep the source level in the evidence tooltip.

### 0.4 Availability model

| State | Prototype copy | Rule |
|---|---|---|
| Available now | "Available now" / "Free now" | availability date ≤ today |
| Available from date, confirmed | "Available from Jan 5" + "Confirmed"; "free Jan 5 · confirmed" | `ok = true` |
| Pending confirmation | "Pending confirmation"; "Pending · Feb 2"; dashed amber bar | `ok = false` — current project end date not confirmed by the delivery lead |
| Proposed for a team | "Proposed · Vela Bank"; "Proposed for Vela Bank from Jan 12" | Person is in a submitted/pending proposal for another opportunity |
| After kick-off | "Free from Jan 19 · after kick-off" | availability date > the opportunity kick-off |

### 0.5 Route map (prototype file → proposed Next.js route)

| Prototype file | Proposed route | Notes |
|---|---|---|
| `v4-home` | `/` (alias `/home`) | Staff landing. Personal users redirect to `/me`. |
| `v4-people` | `/people` | Preview drawer → `/people?selected=[id]` (Proposed, shareable). |
| `v4-passport` (mode staff) | `/people/[id]` | Prototype only has Ana (`/people/ana-ruiz`). |
| `v4-mypassport` (passport mode personal) | `/me/passport` | Same component as `/people/[id]` with `mode="personal"`. |
| `v4-me` | `/me` | Engineer landing. |
| `v4-opportunities` | `/opportunities` | Drawer → `/opportunities/[id]` (Proposed, as intercepting route/modal). |
| `v4-role` (+ `v4-role-review/-people/-sent`) | `/opportunities/new/role` | Stages are state, not routes. Proposed: once drafted, persist as `/opportunities/new/role?draft=[draftId]`. |
| `v4-team` (+ `v4-team-canvas/-position/-proposal`) | `/opportunities/new/team` | Seat drawer `?seat=[seatId]`, proposal modal `?review=1` (Proposed). |
| `v4-compare` | `/compare?ids=a,b,c&role=[roleRef]` | Max 3 ids. `role` = role/seat id or encoded capability list. `from` → `?from=` for the back link. |
| `v4-planning` | `/planning` | Proposed query params `?view=weeks|months&disc=Mobile&sel=[personId]:[barKind]`. |
| `v4-insights` | `/insights` | Proposed `?cap=mobile&sub=React%20Native`. |
| `v4-nav` | Layout component (`app/(app)/layout.tsx`) | Header + Ask Sparq panel; no route. |
| `v4-ai-*` | — | Static state fixtures for Ask Sparq → Storybook stories / visual tests. |
| `v4-show-cover`, `v4-show-journey` | `/showcase`, `/showcase/journey` (Proposed, demo tenant only) | |
| `v4-show-*` step wrappers, `v4-tour` | `/showcase/step/[n]` overlay or `?tour=n` (Proposed, demo tenant only) | |
| `v3-portrait` | `<Avatar>` component | Illustrated portraits for 13 fictional people; production uses uploaded photos or initials. |

### 0.6 Shared session state (`localStorage`, prefix `sti42.`)

All keys are JSON. The Showcase cover ("Start the guided demo →") deletes every `sti42.*` key. In production each becomes server-side data (see gap analysis).

| Key | Shape (prototype) | Written by | Read by | Proposed production home |
|---|---|---|---|---|
| `sti42.passport` | `{ summary: string, extra: Experience[] }` | `v4-passport` (summary save, add experience) | `v4-passport`, `v4-me` ("Recently added" lists `extra`) | `passports.summary`, `experiences` |
| `sti42.ints` | `{ [interestLabel]: boolean }` | `v4-passport` (Interests tab), `v4-me` ("What I’m looking for") | `v4-passport`, `v4-me` | `person_interests` |
| `sti42.skillsAdded` | `[{ n: string, t: 'p'\|'i'\|'t'\|'e' }]` | `v4-passport` (Skills tab), `v4-me` ("Add a skill…", always `t:'p'`) | `v4-passport`, `v4-me` | `person_skills` (+ `evidence_level`, `source`) |
| `sti42.shortlist` | `string[]` person ids | `v4-people`, `v4-passport` (Ana only), `v4-compare` | `v4-people`, `v4-passport`, `v4-role` (badge), `v4-team` (badge), `v4-compare` (count) | `shortlists` / `shortlist_items` per staffing lead |
| `sti42.me` | `{ interested, curious, gql, outDone, outcome, bonus, plan }` | `v4-me` | `v4-me` only | `opportunity_interests`, `growth_interests`, `learning_plan_items`, passport fields |
| `sti42.team` | `{ roles: Seat[], sent, saved, n, stage }` | `v4-team` | `v4-team`, `v4-opportunities` (drafts list) | `opportunity_drafts`, `seats`, `proposals` |
| `sti42.role` | `{ reqs, level, alloc, qa, prop, st }` | `v4-role` | `v4-role`, `v4-opportunities` (drafts list) | `opportunity_drafts`, `requirements`, `proposals` |
| `sti42.compare` | `{ ids: string[], role: { title, caps[] }, from: { href, label } }` | `v4-people`, `v4-passport`, `v4-role`, `v4-team` (on "Compare" click) | `v4-compare` | URL query params (no storage) |

Not shared/persisted (component state only, lost on navigation): People search/filter/compare tray, Planning selection and "Ask … to confirm" requests, Opportunities tab, Insights selection, Ask Sparq conversation, notifications read state, "Open to new opportunities" toggle, share-interest note text, reviewer note text.

---

## 1. App shell & navigation (`v4-nav`)

**Purpose & goals.** One consistent header for both personas, a "New opportunity" entry point for staffing, notifications, an account/persona menu, and a context-aware Ask Sparq assistant available on every page.

**Personas.** Both; content differs by `mode`.

**Primary actions & UI.**

| Element | Staff (Laura) | Personal (Ana) |
|---|---|---|
| Logo "Sparq" | → Home `/` | → My space `/me` |
| Primary nav | "Home", "People", "Opportunities", "Planning", "Insights" | "My space", "My passport" |
| "+ New opportunity" (menu) | "Fill a role" — "Find documented expertise for one position" → `/opportunities/new/role`; "Build a team" — "Compose a multidisciplinary project team" → `/opportunities/new/team` | Hidden |
| Bell (unread dot) → "Recent activity" + "Mark read" | Daniel Okafor "availability from Feb 2 is pending confirmation" (1 hour ago → `/planning`); Lucía Fernández "updated her Talent Passport" (Yesterday → `/people`); Ana Ruiz "shared interest in Vela Bank" (Yesterday → `/opportunities`) | Laura Gómez "viewed your passport for a mobile team" (Yesterday → `/me/passport`) |
| Avatar menu | Name + role; segmented "Staffing" / "My space"; link "Sample passport: Ana Ruiz" → `/people/ana-ruiz` | Name + role; same switch; link "My Talent Passport" → `/me/passport` |
| Ask Sparq FAB (✦) | `aria-label="Ask Sparq about {context}"` | same |

Active nav item: `aria-current="page"`, dark pill. Passport staff view highlights "People"; Fill a role / Build a team / Compare highlight "Opportunities". Below 1180 px wide, nav labels and "New opportunity" label hide (icons only).

**Business rules.** Only one of New-opportunity menu / bell / account menu is open at a time; opening Ask Sparq closes all three. "Mark read" clears the unread dot (session only).

**Prototype states.** Menus open/closed; unread/read. Notifications are static.

**Empty / loading / error.** Notifications empty state: *Not designed in V4.2 — needs design.* Proposed: "You’re all caught up." Loading: Proposed skeleton rows. Error: Proposed inline "Couldn’t load activity. Retry".

**Dependencies.** Auth/roles (persona), notifications service, Ask Sparq.

**Acceptance criteria.**
- [ ] Staff sees 5 nav items + "New opportunity"; personal sees 2 items and no "New opportunity".
- [ ] Logo target depends on persona.
- [ ] Only one header popover open at a time; Esc/outside click closes (Proposed).
- [ ] Bell shows unread indicator until "Mark read"; each notification deep-links.
- [ ] Persona switch only offered to users entitled to both modes (Proposed).

---

## 2. Home (`v4-home`) → `/`

**Purpose & goals.** Staffing Lead's starting point: start something new, see teams being formed and people becoming free.

**Personas.** Staffing Lead (Laura).

**Layout & copy.**
- Left: Ask Sparq card, header "Ask Sparq", heading "What should we **build today?**", shortcuts "Fill a role" ("Find documented expertise for one position"), "Build a team" ("Compose a whole project team"), suggestion "Who’s free for mobile work in January?", input "Ask anything…".
- Right header: "Tuesday, November 24", chip "Illustrative organizational snapshot · not updated by this session", H1 "Good morning, **Laura.**"; stats "4 Opportunities", "10 Open seats", "6 Free in 60 days".
- "Teams in the making" + "All opportunities": 4 cards (client, name, kick-off day/month, seat avatars filled/dashed, label e.g. "2 of 4 seats proposed" / "3 open seats").
- "Ready for their next team" + "All people": 5 people cards (portrait, name, role, availability e.g. "Free now", "Dec 8", "Jan 5").

**Primary actions & navigation.**

| Action | Target |
|---|---|
| "Fill a role" | `/opportunities/new/role` |
| "Build a team" | `/opportunities/new/team` |
| Stat "Opportunities" / "Open seats" | `/opportunities` |
| Stat "Free in 60 days" | `/planning` |
| Opportunity card, "All opportunities" | `/opportunities` (Proposed: `/opportunities/[id]`) |
| Person card | Ana → `/people/ana-ruiz`; others → `/people` (Proposed: `/people/[id]`) |
| "All people" | `/people` |
| Ask Sparq answer person refs / actions | see below |

**Inline Ask Sparq (Home card) — prototype rules.** Submitting text routes by keyword (regex, case-insensitive):

| Pattern | Answer |
|---|---|
| `team\|project\|build\|staff` | "That sounds like a new team. I can draft the roles and find people with documented experience for each one." → "Build a team", "Just one role" |
| `react\|ios\|swift\|mobile skill` | "Ana Ruiz is the only one with professional experience in both. Two others cover one of them." + 3 people refs → "Open Ana’s passport", "Search in People" |
| `free\|availab\|january\|who can` | "Three engineers with documented mobile experience are free in January, all confirmed." + Ana/Javier (Jan 5), Ethan (Jan 19) → "Build a team with them", "Open Planning" |
| anything else | "I can answer questions about skills, availability and open roles. Try one of these, or build a team." → "Build a team", "Browse people" |

Loading text "Looking through documented profiles…" (≈850 ms). Answer footer "From documented skills and availability · illustrative". "New question" resets.

**Business rules.** Home data is a static snapshot: proposals, shortlists and interests made in the session do **not** update it (stated by the chip). **Proposed:** in production Home is live; remove the chip once data is real, or keep a "Last updated" timestamp.

**States.** Fresh / thinking / answered. Empty: *Not designed in V4.2 — needs design* (Proposed: "No opportunities yet — start one with Fill a role or Build a team"; "Nobody becomes free in the next 60 days"). Loading: Proposed skeleton cards. Error: Proposed per-section error with retry; Ask Sparq error "I couldn’t answer that right now. Try again." (Proposed).

**Dependencies.** Opportunities, People/Availability, Ask Sparq gateway.

**Acceptance criteria.**
- [ ] Greeting uses the signed-in user's first name and current date.
- [ ] Stats link to Opportunities / Planning; counts match the underlying data.
- [ ] "Teams in the making" shows proposed vs open seat avatars and the "{x} of {n} seats proposed" / "{n} open seats" label.
- [ ] "Ready for their next team" lists people ordered by availability date (Prototype order: Free now, Dec 8, Dec 15, Jan 5, Jan 5) — never by any score.
- [ ] Ask Sparq answers cite people with evidence and offer the two follow-up actions.

---

## 3. Talent Explorer / People (`v4-people`) → `/people`

**Purpose & goals.** Find people by documented experience in plain language; preview a profile; shortlist; select up to 3 to compare.

**Personas.** Staffing Lead.

**Copy.** H1 "Find the right **expertise.**"; subtitle "12 professionals · matched on documented experience, never on scores."; search label "Describe who you are looking for", placeholder "Describe who you’re looking for…", default value "Engineers with React Native and native iOS experience"; buttons "Search", "Clear".

**Primary actions.**

| Action | Behavior |
|---|---|
| "Search" / Enter | Sets searched, shows "Reading documented skills and availability…" (~800 ms), then the criteria row "I looked for" with removable chips "React Native", "Native iOS" and note "Ordered by documented matches, then availability". |
| "Try" chips (before first search) | "React Native and native iOS" (runs search); "AI engineers free soon" (discipline AI + Available by January); "Mobile, free by January" (Mobile + Available by January). |
| Discipline chips | "All", "Mobile", "Frontend", "Backend", "AI", "Data", "Cloud", "Architecture", "Quality" (single select). |
| "Available by January" toggle | Keeps people available on/before Jan 31. |
| "Clear filters ✕" | Shown when a discipline ≠ All or the toggle is on. |
| Click a card | Opens "Profile preview" aside; click again or "✕" closes. |
| Preview: "Show more experience" / "Show less" | Reveals "Recent projects". |
| Preview: "Open Talent Passport" | Only for Ana → `/people/ana-ruiz`. Others show "Full passport in this prototype: Ana Ruiz". **Proposed:** every person has a passport at `/people/[id]`. |
| Preview: "Add to shortlist" ↔ "✓ On your shortlist" | Toggles shortlist (persisted). |
| Preview: "Add to compare" ↔ "✓ Added to compare" | Toggles compare tray (max 3). |
| Compare tray | Portraits, "{n} selected", "Clear", "Compare" → `/compare?ids=…&role=…&from=people`. |

**Inputs / outputs.** Input: query text, criteria chips, discipline, availability toggle, selection. Output: result count "{n} people" or "{n} people with documented matches", cards (portrait, name, role, top 3 skills, match chips, availability dot + text), preview (name, role · location, availability + Confirmed/Pending confirmation, summary, "Documented experience" list).

**Business rules.**
- **Search interpretation (prototype):** the text is ignored; search always applies the two criteria React Native + Native iOS. **Proposed:** parse free text server-side into capability criteria (LLM extraction + skills taxonomy), show them as removable chips under "I looked for".
- **Matching filter:** after a search, keep people with at least one criterion documented at Professional or Training level (Native iOS counts only at Professional). If all criteria are removed, no criterion filter applies.
- **Ordering:** by number/strength of documented matches (Professional > Training), then earliest availability. This is an ordering, not a score; never display numeric values. Without a search, prototype order is static.
- **Match chips:** Professional = filled; Training = outline with "· training" suffix; not documented = grey.
- **Availability text:** "Available now" if free now, else "Available from {date}"; sub-label "Confirmed" or "Pending confirmation".
- **Compare max 3:** adding a 4th is silently ignored in the prototype. **Proposed:** disable "Add to compare" and show "You can compare up to 3 people".
- **Compare payload:** ids (or Ana/Javier/Ethan fallback if empty) and capabilities = union of the selected people's top skills (max 6); back link label "People".

**States.** Pre-search with suggestions; searching; results with criteria; preview open/closed; "more" expanded; compare tray visible when ≥1 selected.
- Empty (exists): "No documented matches yet." / "Remove a criterion or try another capability."
- Loading (exists): "Reading documented skills and availability…".
- Error: *Not designed in V4.2 — needs design.* Proposed: "Search isn’t available right now. You can still filter by discipline." with retry.

**Dependencies.** Skills/evidence data, availability, Shortlist, Compare, Passport, Ask Sparq (`context=people`).

**Acceptance criteria.**
- [ ] Search turns natural language into visible, removable criteria; removing one re-filters instantly.
- [ ] Discipline and availability filters combine with search (AND).
- [ ] Results never show a numeric score or rank number.
- [ ] Preview shows Confirmed vs Pending confirmation explicitly.
- [ ] Shortlist toggle persists across pages and sessions for the signed-in lead.
- [ ] Compare tray never exceeds 3 people and links to `/compare` with ids and capabilities.

---

## 4. Talent Passport — staff view (`v4-passport`, mode `staff`) → `/people/[id]`

**Purpose & goals.** See the person behind the skills: documented skills by evidence level, selected work with evidence and confirmer, journey, certifications, what they want next. Shortlist, compare, ask Ask Sparq for a targeted summary, preview the shareable profile.

**Personas.** Staffing Lead (read-only).

**Copy & sections.**
- Back link "← People". Hero: portrait with availability ring, "Ana **Ruiz**", "Senior Mobile Engineer", summary, facts "Medellín, Colombia · 9 years · At Sparq since 2019 · English · Spanish".
- Availability block: "Availability" / "From Jan 5, 2027" / "Confirmed · on Meridian Health until Dec 19".
- Staff buttons: "Add to shortlist" ↔ "✓ On your shortlist"; "Compare"; "Preview profile".
- Ask Sparq card: "Ask Sparq can summarize Ana’s documented experience for a specific need" + "For a mobile lead role" / "For an AI product".
- "What Ana **does best**" — 3 groups: "Mobile engineering" (Cross-platform and native), "Web & APIs" (The layer beneath the app), "Applied AI" (Growing focus); legend Professional / Independent / Training / Emerging; each skill chip tooltip = evidence (e.g. "5 projects"); new skills show "new".
- "Selected **work**": cards (period, client · role, title, summary, tags) with "Show evidence" ↔ "Hide evidence" listing ✓ evidence lines and source, e.g. "Confirmed by Rafael Ortiz, delivery lead · Nov 2026", "Independent project · self-reported".
- "The **journey**" timeline; "Learning & certifications"; "Looking forward to" (active interests) + "Open to travel up to 20% · enjoys teams of 4–8".
- Footer: "Updated Nov 18, 2026 by Ana · project evidence confirmed by delivery leads · 86% complete".

**Primary actions & navigation.**

| Action | Result |
|---|---|
| "← People" | `/people` |
| Shortlist toggle | Adds/removes this person in shortlist (persisted). |
| "Compare" | `/compare?ids=ana,javier,ethan&role=mobile-lead&from=/people/ana-ruiz` — prototype hard-codes peers Javier, Ethan and caps React Native, Swift, TypeScript, LLM integration, Accessibility, title "a mobile lead role". **Proposed:** pre-fill with current person + people from the lead's shortlist / active role. |
| Ask Sparq option | ~900 ms skeleton, then a summary + 3 evidence cards; "Add Ana to a team" → `/opportunities/new/team`; "Close"; footer "From documented projects · illustrative". |
| "Preview profile" | Opens the Preview & export dialog (§14). |

**Ask Sparq summaries (prototype, predefined).**
- Mobile lead: "Ana has led React Native delivery with native iOS modules on two regulated products, with documented offline-first architecture and accessibility work." (Meridian Health; Helix Insurance; Accessibility)
- AI product: "Ana’s AI experience is emerging: on-device text recognition in production, plus an independent LLM prototype and a RAG course. No production LLM project is documented yet." — note the explicit statement of what is **not** documented. Production answers must keep this honesty.

**Business rules.** Read-only for staff. Interests visible to staff are those the engineer toggled on. No ratings or performance data are shown ("No ratings, scores or performance data." — Ask Sparq, mypassport context).

**States.** Summary none/loading/ready; evidence expanded per work item (Meridian open by default); share dialog.
- Person not found / no access: *Not designed in V4.2 — needs design.* Proposed: "This passport isn’t available" with back link.
- Loading: Proposed skeleton for hero + sections.
- Incomplete passport: Proposed: show sections with "Not documented yet" rather than hiding.

**Dependencies.** People, Shortlist, Compare, Build a team, Ask Sparq, Export.

**Acceptance criteria.**
- [ ] Every skill shows its evidence level and evidence source on hover/focus.
- [ ] Every work item shows who confirmed it, or "self-reported"/"awaiting confirmation".
- [ ] Availability shows date + Confirmed/Pending + current project end.
- [ ] Staff cannot edit; no edit controls rendered.
- [ ] Ask Sparq summary cites the projects it used and states documented gaps.

---

## 5. Personal Passport (`v4-mypassport` → `v4-passport` mode `personal`) → `/me/passport`

**Purpose & goals.** Ana owns and maintains her passport: edit description, skills, experience, interests; preview and export what others see.

**Personas.** Engineer (Ana).

**Differences from staff view.** Nav is personal ("My passport" active); back link "← My space"; buttons "Edit my passport", "Preview & export", "+ Add experience"; Ask Sparq header "See how Ask Sparq would describe you to a staffing lead"; no "Add Ana to a team" button in the summary.

**Edit profile drawer.** Title "Edit profile", sub "Editing as Ana Ruiz · changes are visible to staffing leads"; tabs "About", "Skills", "Experience", "Interests"; footer "Cancel" / "Save changes".

| Tab | Inputs | Behavior |
|---|---|---|
| About | "How you describe your work" (textarea) | Saved on "Save changes". |
| Skills | Chips with ✕; "Add a skill" (placeholder "e.g. Core ML") + level "Professional / Independent / Training / Emerging" + "Add" (Enter works) | Added skill gets evidence "Added by Ana", flag "new". Emerging goes to "Applied AI" group; all others to "Mobile engineering" (prototype simplification). |
| Experience | Note "Document a project in a few words. Your delivery lead can confirm it later."; "Project", "Your role", "What you did"; "Add to my passport" | Creates a work card dated "Nov 2026", client "Sparq", source "Added by Ana · awaiting confirmation by a delivery lead"; closes drawer; toast. |
| Interests | Note "Used only to surface opportunities for you."; toggles: Applied AI in mobile, Technical leadership, Healthcare, Fintech, Mentoring, Native iOS depth, Client discovery | Toggles immediately. |

Toast (save/add): "✓ Passport updated · new skills are now searchable".

**Business rules.**
- Prototype quirk: skill and interest changes apply immediately and persist even if the user presses "Cancel"; only the About text waits for "Save changes". **Proposed:** all tabs are a single draft; "Cancel" discards; "Save changes" commits atomically and writes an audit entry.
- Removing a pre-existing skill is not persisted in the prototype. **Proposed:** removal persists; removing a delivery-lead-confirmed item requires a confirmation dialog (needs design).
- Self-added experience starts as **unconfirmed** and must be confirmable by a delivery lead (Proposed workflow; not designed).
- "86% complete" in the footer is static here but dynamic in My space. **Proposed:** single computed completeness value (see §6).

**States.** Edit drawer open per tab; toast; share dialog. Validation: prototype silently ignores empty skill name / empty project name. **Proposed:** inline "Add a name for this skill/project". Save error: *Not designed — needs design.* Proposed: keep drawer open, show "Couldn’t save. Your changes are still here." with retry.

**Dependencies.** My space (shared keys `passport`, `ints`, `skillsAdded`), People search index, Export, Notifications (delivery lead confirmation).

**Acceptance criteria.**
- [ ] Only the passport owner sees edit controls.
- [ ] New skills require an evidence level and become searchable after save.
- [ ] Self-added experience is labelled "awaiting confirmation by a delivery lead" until confirmed.
- [ ] Interests are only used for opportunity suggestions, never shown as evaluation.
- [ ] Cancel discards unsaved changes (Proposed fix).

---

## 6. My Space (`v4-me`) → `/me`

**Purpose & goals.** The engineer's home: current and next assignment, opportunities that fit, raising a hand, growth interests, keeping the passport current, learning plan.

**Personas.** Engineer (Ana).

**Copy & sections.**
- H1 "Hi, **Ana.**", sub "Three opportunities fit what you do and what you want to do next."
- Now card: "Now" / "Meridian Health · Mobile lead" / "Patient companion app · until Dec 19". Next card: "Next" / "Free from January 5" / "Confirmed by Rafael Ortiz · holidays Dec 22 – Jan 2".
- Sidebar: "My Talent Passport" + "View" (→ `/me/passport`); completion ring "{pct}% complete"; "Your next chapter starts **January 5.**"; "Meridian Health wraps up Dec 19. Your availability is confirmed, and staffing leads can see what you’re looking for."; "Update from my CV" (§14).
- "What I’m looking for" (interest chips, shows "Saved ✓" after a change) + checkbox "Open to new opportunities".
- "Recently added" (new experience, skills added today, then static items).
- "My goals" / "Set by you" (3 goals with % progress, static).
- "Opportunities that fit you": Vela Bank · Senior Mobile Engineer; Cobalt Mobility · Mobile Tech Lead; Cobalt Mobility · iOS Engineer — each with "{client} · starts {date} · {duration}", description, "Why you’re seeing this" tags (skills; "Your interest: …" tags highlighted).
- "Explore beyond your title" — "Tell staffing which technical areas you’d like to grow into. It’s never used to evaluate you." Cards: AI engineering, Platform & cloud, Technical leadership — "I’m curious →" ↔ "✓ Interest shared with staffing".
- "Keep your passport current": "How many years of GraphQL?" ("Your CV says 3, your passport says 4." → "3 years"/"4 years" → "✓ Saved: {x}"); "Add a skill you’ve been using" (input + "Add", shows "+ {skill}"); "Document your Meridian Health work" (textarea + "Save" → quote + "✓ Added to your passport").
- "Learning for where you’re heading": 3 items, "Add to my plan" ↔ "✓ In my plan".

**Express interest flow.**
1. "I’m interested" → dialog "Share your interest in **{title}**" with client, editable note (prefilled "I finish Meridian Health on Dec 19 and would love to bring my React Native experience to an AI product."), "Your availability" "From Jan 5 · confirmed", disclaimer "Only Laura Gómez and the delivery lead will see this. It’s not a commitment, and you can withdraw anytime."
2. "Share interest" → toast "✓ Interest shared with Laura Gómez"; card shows "✓ Interest shared" + "Withdraw"; section "Interests you’ve shared" appears ("Only Laura Gómez and the delivery lead can see these"; row "{client} · shared today", "Laura will follow up", "Withdraw").
3. "Cancel" closes without change. "Withdraw" removes it immediately (no confirmation).

**Business rules.**
- Completeness % = min(100, 86 + CV bonus (2 per kept CV item, max 6) + 2 if GraphQL answered + 4 if outcome saved + min(4, 2 × skills added)). **Proposed:** compute server-side from passport fields with a documented rubric; never present it as a performance metric.
- Visibility: shared interests visible only to the staffing lead and the opportunity's delivery lead.
- Prototype gaps: the note text is not stored; the shared interest is not read by Opportunities/Fill a role (Ana's "Shared interest" badge there is hard-coded); "Open to new opportunities" is not persisted and has no effect; GraphQL answer and Meridian outcome don't change the passport page. **Proposed:** all of these persist and propagate (see gap analysis).
- Ask Sparq on this page has a "Live from this page" item "What have I shared so far?" computed from shared interests and curiosity areas.

**States.** Interest dialog open; per-opportunity shared/not; curious on/off; toasts (2.6 s). Empty: "Interests you’ve shared" hidden when none (exists); no matching opportunities — *Not designed — needs design* (Proposed: "No open opportunities match yet. Update your interests to see more."). Error on share: *Not designed* (Proposed: dialog stays open with "Couldn’t share your interest. Try again.").

**Dependencies.** Personal passport, Opportunities, Notifications (to Laura), CV import, Learning catalogue (Proposed), Ask Sparq (`context=me`).

**Acceptance criteria.**
- [ ] Opportunities listed with explicit "Why you’re seeing this" reasons from skills and stated interests.
- [ ] Sharing interest requires the confirmation dialog and states who can see it.
- [ ] Shared interest appears for the staffing lead (Opportunities detail, Fill a role "Shared interest" badge, bell notification).
- [ ] Withdraw removes visibility immediately.
- [ ] Curiosity areas and goals are never shown to staff as ratings.

---

## 7. Opportunities (`v4-opportunities`) → `/opportunities`

**Purpose & goals.** See demand: opportunities waiting for a team, their roles and staffing progress; jump into Fill a role / Build a team.

**Personas.** Staffing Lead.

**Copy.** H1 "Work that’s **waiting for a team.**"; sub "4 opportunities · 10 open roles · first kick-off on Jan 12"; CTAs "Fill a role" / "Build a team"; tabs "All 4", "Staffing 1", "Open 2", "Upcoming 1".

**Cards.** Client initials, client, industry, status pill ("Staffing" / "Open" / "Upcoming"), name, short description, capability tags, "Starts {date}", "Team · {proposed}/{n} proposed" with filled/empty dots.

**Data (prototype).** Vela Bank — AI-assisted onboarding (Staffing, Jan 12, 6 months, Rafael Ortiz; AI Engineer → Lucía, Senior Mobile Engineer open, Backend Engineer open, QA Automation → Camila). Cobalt Mobility — Fleet driver app rebuild (Open, Jan 19, 9 months, Inés Vidal; iOS, Android, Mobile Tech Lead). Terra Foods — Snowflake data platform (Open, Feb 9, 5 months; 2 Data Engineers, Cloud Engineer). Nimbus Health — AWS cloud migration (Upcoming, Mar 2, 8 months; Solutions Architect, DevOps Engineer).

**"Your drafts in this session".** Shown when a team or role draft exists in session state:
- "Kestrel Travel · team" — "{n} roles · {f} proposed" — status "Sent for review" (green) / "Draft saved" / "In progress" → `/opportunities/new/team`.
- "Vela Bank · Senior Mobile Engineer" — "One person proposed" / "Requirements drafted" — "Sent for review" / "In progress" → `/opportunities/new/role`.

**Detail drawer.** "{client} · {industry}", name, ✕; Ask Sparq button "Summarize the requirements" → "Reading the opportunity…" (~800 ms) → "Ask Sparq · summary" with 3 computed lines: "{n} roles, {open} still open", "Key capabilities: …", "Kick-off {date} · {duration} · delivery lead {name}". Description; Kick-off / Duration / Delivery lead; "The team" list (proposed person chip, or "Fill this role" → `/opportunities/new/role`); interest line (e.g. "1 engineer has expressed interest in the mobile role.", "Visible to engineers in their personal workspace.", "No expressions of interest yet.", "Opens to expressions of interest on Dec 15."); footer "See availability" → `/planning`, "Build the team" → `/opportunities/new/team`.

**Business rules.**
- Tab filter by status; counts per status.
- Prototype: "Fill this role" always opens the Vela Bank Senior Mobile Engineer flow, and "Build the team" always opens the Kestrel Travel team. **Proposed:** both carry the opportunity/role id (`/opportunities/new/role?opportunity=[id]&role=[roleId]`, `/opportunities/new/team?opportunity=[id]`).
- Prototype: proposals made in Fill a role/Build a team don't update the opportunity cards (only the drafts strip). **Proposed:** cards reflect live proposals.
- Opportunity creation itself (the record) is not designed: the brief is typed inside Fill a role / Build a team. **Proposed:** creating a draft creates an opportunity in status "Draft".

**States.** Tab; drawer open; summary none/loading/ready; drafts present/absent. Empty tab: *Not designed — needs design* (Proposed: "No {status} opportunities."). Error: *Not designed* (Proposed: page-level retry).

**Dependencies.** Fill a role, Build a team, Planning, Ask Sparq, interests from My space.

**Acceptance criteria.**
- [ ] Tabs filter and show correct counts.
- [ ] Each card shows proposed/total seats from live data.
- [ ] Drawer lists roles with proposed person or "Fill this role" deep-linked to that role.
- [ ] Ask Sparq summary is computed from the opportunity record (no invented facts).
- [ ] Drafts list shows only the current user's drafts with status.

---

## 8. Fill a Role (`v4-role`) → `/opportunities/new/role`

**Purpose & goals.** From a plain-language brief, draft requirements with the user, find people with documented experience, propose one person, and send the proposal to a delivery lead for human review.

**Personas.** Staffing Lead. Reviewer: Rafael Ortiz (delivery lead).

**Stage flow (prototype `stage` prop: describe → review → people → sent).**

| Stage | Left (Ask Sparq conversation) | Right |
|---|---|---|
| 0 Describe | "Which role do you need to fill? **Tell me in your own words.**"; textarea "Describe the role" (prefilled Vela Bank brief); link "Need a whole team instead?" → `/opportunities/new/team`; button "Draft the requirements" → "Drafting…" (~1 s) | Title "Fill a role"; placeholder "Requirements and people will appear here." / "Nothing is decided automatically. You review everything before it goes to a delivery lead." |
| 1 Review | Brief echo (first 30 words + "…"); "I drafted the requirements on the right. Tap a capability to switch must-have and nice to have."; question "You mentioned working next to an AI engineer. Add LLM integration as a nice to have?" → "Yes, add it" / "No need" → "✓ Added LLM integration as a nice to have" / "✓ Kept the requirements as they are" | Title "Vela Bank · Senior Mobile Engineer"; level "Mid / Senior / Lead"; allocation "Full-time / Half-time"; "Kick-off Jan 12 · 6 months"; "What this role needs" (legend Must-have / Nice to have) with chips (tap toggles, ✕ removes, tooltip = source quote e.g. "“with TypeScript”", "Common in Vela Bank’s stack", "Added from your answer", "Added by you"); "+ Add" input; hint "Hover a capability to see where it came from in your description."; button "Find people with this experience" → "Looking through 12 profiles…" (~1 s) |
| 2 People | "{n} people have documented experience with at least one capability. I show where experience is documented. I don’t rank or decide." | "People with **documented experience**" (legend Professional / Training / Not documented); candidate rows; proposal dock |
| 3 Sent | (same) | Status banner "✓ {Name} was sent to Rafael Ortiz for review. Nobody has been assigned." + "Back to opportunities" |

Default requirements: React Native (must), TypeScript (must), Accessibility (must), GraphQL (nice). New capabilities from "+ Add" default to must-have.

**Candidate row.** Portrait, name, badges "Shared interest" and "On your shortlist", "{role} · {availability}", one evidence cell per requirement (filled / half / empty), "Evidence" ↔ "Hide evidence" (lists evidence; Ana also "Open Ana’s passport →"), propose button.

**Propose / replace rules.**
- Exactly one person can be proposed per role.
- No one proposed: button "Propose" → toast "{Name} proposed".
- Someone else proposed: button "Propose instead" → replaces; toast "{New} replaces {Previous}".
- This person proposed: button "✓ Proposed" → click removes; toast "{Name} removed".
- Dock (stage 2 with a proposal): "{Name} proposed for this role", "Compare", "Send for review".
- "Send for review" → dialog "Send for **human review**": person, "Senior Mobile Engineer · Vela Bank · {availability}", "Reviewer" "Rafael Ortiz, delivery lead", "Proposing isn’t assigning. Rafael decides, and {First name} is contacted only after review.", "Keep editing" / "Send".

**Candidate selection & ordering (prototype).** Pool of 5 people (Ana, Ethan, Sofía, Javier, Mateo); show anyone with any documented level on any requirement; order by documented strength (Professional > Training, must-haves weigh more) then earliest availability. **This weighting must stay internal and never be displayed as a score**; the UI only claims "documented experience". **Proposed:** pool = all people visible to the lead; same ordering rule, documented in a tooltip "Ordered by documented matches, then availability".

**Availability text.** "free {date} · confirmed" (green) / "free {date} · pending" (amber) / "free {date}, after kick-off[ · pending]" (amber, when date > Jan 12).

**Compare from role.** Payload: role title "Senior Mobile Engineer · Vela Bank", caps = all requirements, ids = proposed person + next candidates (max 3), back label "Fill a role".

**Ask Sparq live items (`context=role`).** Hello "Let’s find the right person." → "Here’s your role so far."; items "Review these requirements" (must/nice lists), "Identify requirements that need confirmation" (must-haves nobody has professionally; nice-to-haves to confirm; "Kick-off Jan 12 is taken from the brief"), "Explore documented expertise" (stage ≥2), "Summarize the proposed professional", "Review availability" (when someone proposed). Plus predefined "Who else could fill this role?" and "Is anyone also interested in this role?".

**Business rules / known prototype gaps.**
- The brief is not parsed; requirements are canned. **Proposed:** LLM extraction with each requirement linked to its source span (tooltip), must/nice suggestion, and clarifying question(s).
- After "Send", candidate rows remain interactive and changing the proposal doesn't reopen the draft. **Proposed:** once sent, proposal is read-only until reviewer returns it or the lead withdraws it.
- A sent role re-opens in "sent" state on any later visit (stored stage is the max).

**States.** Busy (drafting/finding), question open/answered, evidence expanded, review dialog, sent banner, toasts (2.4 s). Empty candidates: *Not designed* (Proposed: "No one has documented experience with these capabilities yet. Try making one a nice to have." — reuse Build a team copy). Error (drafting/search/send failure): *Not designed* (Proposed inline error with retry; never lose the brief).

**Dependencies.** Opportunities, People/skills, Shortlist, Compare, Ask Sparq gateway, Notifications/Review inbox (Proposed), Audit log.

**Acceptance criteria.**
- [ ] Requirements are editable (toggle must/nice, remove, add) and show their source.
- [ ] Candidate cells show evidence level per requirement; no numeric score anywhere.
- [ ] Only one person can be proposed; replace and remove produce the specified toasts.
- [ ] "Send for review" requires the confirmation dialog naming the reviewer.
- [ ] After sending, status says "Nobody has been assigned" and the reviewer receives it (Proposed).
- [ ] Draft persists and appears under "Your drafts in this session" on Opportunities.

---

## 9. Build a Team (`v4-team`) → `/opportunities/new/team`

**Purpose & goals.** Describe a project, get a proposed team composition as seats on a canvas, place people with documented experience, see coverage gaps and availability conflicts live, then send the composition for human review.

**Personas.** Staffing Lead. Reviewer: Inés Vidal (delivery lead).

**Stages (prototype `stage` prop: describe, canvas, position = canvas with seat drawer open, proposal = canvas with proposal modal).**

### 9.1 Describe
Heading "Describe the project. **I’ll compose the team.**"; "Project description" textarea (prefilled Kestrel Travel brief); link "Only need one person? Fill a role" → `/opportunities/new/role`; button "Compose the team" → "Composing…" (~1.1 s). Placeholder card "Your team canvas" / "Roles appear as seats. Click a seat to explore people with documented experience and place them."

Composition (prototype, canned): 4 seats — Mobile Lead (React Native, TypeScript · Senior), iOS Engineer (Swift, WidgetKit · Mid), AI Engineer (LLM apps, RAG · Senior), Backend Engineer (Node.js, GraphQL · Mid); all Full-time; all Open after composing from the live flow.

### 9.2 Canvas
- Header: "← Edit the brief" (back to describe, keeps seats), "Kestrel Travel **team**", "{n} roles · {placed} placed · kick-off Jan 12".
- Actions: "+ Add a role" menu (QA Automation · Appium · Playwright; Android Engineer · Kotlin · Compose; Cloud Engineer · AWS · Terraform — each addable once; adding opens its seat drawer); "Save draft" → "✓ Saved" + toast "Draft saved · only visible to you"; "Review & propose" (disabled when 0 seats placed or already sent) → "✓ Sent for review".
- Canvas: centre "Travel & hospitality / AI trip companion / Kick-off Jan 12 · 6 months"; seats laid out radially; each seat shows portrait + availability dot or "+", title, person name or "Open seat · {level}", status chip, capability chips.
- Legends: dots "Free before kick-off", "Pending or late", "Overlaps another team"; chips "Confirmed", "Proposed", "Open".
- Sent banner: "✓ Proposal sent to **Inés Vidal** for review. No one has been assigned; people are contacted only after review." + "See availability" (`/planning`), "Back home" (`/`).

### 9.3 Seat states

| State | Chip | Meaning / transition |
|---|---|---|
| **Open** | "Open" (grey) | No person. Any Propose fills it. |
| **Proposed** | "Proposed" (coral) | Placed by the lead ("Proposed by you"). Remove → Open. |
| **Confirmed** | "Confirmed" (green) | "Confirmed by Inés Vidal". Prototype: only preset (iOS Engineer/Javier in canvas/position/proposal fixtures); there is no UI to confirm. Proposing anyone else or removing resets to Open/Proposed. **Proposed:** set only by the reviewer via the review workflow. |

### 9.4 Seat drawer ("Position details")
"Seat on the Kestrel Travel team", title; current person block with "Confirmed by Inés Vidal" / "Proposed by you" + "Remove" (toast "Seat reopened"); "Needs" capability chips with ✕ and "+ Add"; level "Mid / Senior / Lead"; allocation "Full-time / Half-time"; list header "People with documented experience" (empty seat) or "Replace with someone else" (filled); legend Professional / Training; candidate cards: name, "On your shortlist" badge, availability text, per-capability evidence chips, "Show evidence" ↔ "Hide evidence" (Ana: "Open passport →"), action button; footer "Remove this role", "Compare side by side".

**Propose / replace / move rules.**

| Situation | Button | Effect + toast |
|---|---|---|
| Seat empty, person not elsewhere | "Propose" | Fill seat → "{Name} proposed for {Seat}" |
| Seat filled by someone else | "Propose instead" | Replace → "{Name} replaces {Previous}" |
| Person already in another seat (seat empty) | "Move here" | Remove from the other seat, place here → "{Name} proposed for {Seat}" |
| Person is in this seat | "✓ Proposed" | Click removes → "{Name} removed from {Seat}" |

A person can occupy at most one seat. Any change to seats/caps/level/allocation clears "sent" so the team can be re-proposed. "Remove this role" deletes the seat immediately (no confirmation in prototype; **Proposed:** confirm if filled).

**Candidate pool (prototype).** Per seat kind: mobile → Ana, Ethan, Sofía, Mateo; ios → Javier, Ana; ai → Lucía, Valentina, Ana; backend → Mateo, Daniel, Lucía; qa → Camila; android → Ethan; cloud → Marcus, Tomás, Daniel. Filtered to anyone with any of the seat's caps documented; ordered by documented strength then availability (internal only). Empty copy (exists): "No one has documented experience with all of these yet. Try removing a capability." (note: filter is "any", copy says "all" — align in production).

### 9.5 Availability & conflict detection
Kick-off = Jan 12. For each placed person:

| Condition (checked in order) | Dot / bar | Text |
|---|---|---|
| Proposed for another opportunity (Lucía, Camila → Vela Bank) | red "Overlaps another team" | "Proposed for Vela Bank from Jan 12" |
| Available after kick-off | amber "Pending or late" | "Free from {date} · after kick-off" (+ ", pending" if unconfirmed) |
| Availability unconfirmed | amber (dashed bar) | "Free from {date} · pending" |
| Otherwise | green "Free before kick-off" | "Free now" or "Free from {date} · confirmed" |

"Availability conflicts" panel: header + "{n} open seat(s)" / "All seats proposed"; one row per non-green placed person ("{Name} · {Seat}", reason, "Find alternative" → opens that seat's drawer); empty "No conflicts. Everyone placed is free before kick-off."

"Availability against kick-off" timeline (Dec–Mar ticks, Kick-off marker), one row per seat with bar starting at availability date and the fit text; link "Open Planning →".

### 9.6 Coverage rules
Required capabilities = union of all seats' caps. For each capability, take the best level among **all placed people on the team** (not only the seat holder):

| Group | Rule | Copy |
|---|---|---|
| "Documented on this team · {n}" | some member Professional | "Professional project experience recorded in a passport." |
| "Training or independent work only · {n}" | best is Training | "Learning is documented, client project experience is not yet." |
| "Not documented · {n}" | no member has it and the capability belongs to a filled seat | "Nobody proposed has a record of this. It may be a real gap or simply undocumented: ask the people involved." |
| "Waiting on an open seat · {n}" | no member has it and it belongs only to open seats | "Propose someone for these roles to see coverage." |

Groups with 0 items are hidden. Section header "Coverage" + "From documented capabilities · illustrative"; button "+ Add a role".

### 9.7 Review & propose
Modal "Proposal for human review" / "Kestrel Travel **team**": per seat portrait or empty, title, person or "Open seat", flag (fit text or "Still open"); "To confirm during review" notes (open seats "{Seat} seat is still open"; conflicts; "{Name}: availability from {date} not yet confirmed"; "{Name} starts after kick-off ({date})"; "Not documented on this team: …"; "Training only: …"; or "Nothing pending"); "Note for the reviewer" (placeholder "Add context for Inés, for example why a pending date is still the right choice (optional)" — not stored in prototype); footer "Reviewer: Inés Vidal, delivery lead · nothing is assigned automatically", "Keep editing", "Save draft", "Send for review" → closes, sent banner.

Open seats are allowed in a proposal (they appear as notes). Minimum 1 placed seat.

### 9.8 Ask Sparq live items (`context=team`)
"Summarize this team as it stands" → "{n} roles · {f} proposed · {o} open. {k} availability conflict(s)." + coverage bullets; "Identify requirements that need confirmation"; "Review availability". Predefined: "What do similar teams usually include?", "How should I choose between two people?" ("…I show evidence and availability, never a score; the delivery lead decides.").

**Business rules / prototype gaps.** Brief is not parsed (composition is canned; title "Kestrel Travel" fixed). Reviewer is fixed (Inés Vidal). Saved draft is per browser. **Proposed:** LLM-assisted composition from brief + historical team patterns; reviewer = opportunity's delivery lead; drafts per user in DB.

**States.** Describe/composing/canvas; drawer; add-role menu; proposal modal; saved; sent; toasts (2.4 s). Error: *Not designed* (Proposed: composition failure → keep brief, "I couldn’t compose a team from this description. Add roles manually or try again." + "+ Add a role" available on an empty canvas). Empty canvas after removing all roles: *Not designed* (Proposed: placeholder card with "+ Add a role").

**Dependencies.** Opportunities, People/skills/availability, Planning (conflicts must match Planning data), Shortlist, Compare, Ask Sparq, Review inbox & notifications (Proposed), Audit log.

**Acceptance criteria.**
- [ ] Composing creates editable seats (title, caps, level, allocation).
- [ ] Seat chips show Open / Proposed / Confirmed; only the reviewer can produce Confirmed.
- [ ] A person can occupy only one seat; "Move here" moves them.
- [ ] Coverage groups recompute instantly on every change and follow §9.6.
- [ ] Conflicts list every placed person who is pending, late, or proposed elsewhere, with "Find alternative".
- [ ] "Review & propose" disabled with 0 placed; proposal lists open items to confirm; sending never assigns anyone.
- [ ] Draft can be saved and reopened; it appears on Opportunities.

---

## 10. Talent Comparison (`v4-compare`) → `/compare?ids=&role=`

**Purpose & goals.** Compare up to 3 people side by side **on documented evidence for a specific role**, without ranking.

**Personas.** Staffing Lead.

**Copy.** Back link "← {from label}" (People / Ana Ruiz’s passport / Fill a role / Build a team); H1 "Side by side, **on the evidence.**"; sub "Comparing for {role title} · {caps joined}. Documented experience only; nothing is ranked and people make the decision."; buttons "Hide evidence" ↔ "Show evidence" (default shown), "See availability" → `/planning`.

**Per-person column.** Portrait, "✕" remove, name, "{role} · {years} years", availability "From {date}" + "Confirmed" / "Pending" / "Proposed for Vela Bank"; "Must-haves" list (one row per capability with evidence dot + evidence text, or "Not documented"); "Relevant work"; "Architecture"; "Still to confirm" (e.g. "Years of GraphQL experience", "Nothing pending"); "Add to shortlist" ↔ "✓ On shortlist"; "Passport" (Ana only). Add column: "Add someone to compare" with person chips. Footer "{n} on your shortlist · back to {from}".

**Business rules.**
- **Max 3 people.** Add column only shown when < 3 and there are addable relevant people.
- **Relevance filtering:** capabilities = role caps (deduped, max 6) that at least one known person has documented (LLM integration ≡ LLM apps alias); fallback caps React Native, Swift, TypeScript, LLM integration, Accessibility. People shown = requested ids with ≥1 relevant capability documented; if none, the first 2 relevant people. Addable = relevant people not already shown.
- Evidence levels shown: Professional / "Training or partial" / "Not documented".
- Label "Must-haves" lists all role caps including nice-to-haves from Fill a role (prototype inconsistency). **Proposed:** split "Must-have" and "Nice to have".
- Removing the last person falls back to 2 relevant people (cannot be empty in prototype). **Proposed:** allow empty with a prompt.
- Compare ids are not written back (refresh restores the original set). **Proposed:** sync ids to URL.

**States.** Evidence shown/hidden. Empty (no ids, unknown role): *Not designed* (Proposed: "Choose up to 3 people to compare" + picker). Loading/error: *Not designed* (Proposed skeleton columns; error with retry).

**Dependencies.** People, Passport, Shortlist, Fill a role, Build a team, Planning.

**Acceptance criteria.**
- [ ] Never more than 3 columns of people.
- [ ] Only capabilities relevant to the role are rows; only relevant people can be added.
- [ ] Each cell states evidence level and source text or "Not documented".
- [ ] No totals, scores, winners or sorting by "best".
- [ ] Back link returns to the originating screen/context.

---

## 11. Resource Planning (`v4-planning`) → `/planning`

**Purpose & goals.** Who's free and when, against upcoming kick-offs; spot pending confirmations and request them.

**Personas.** Staffing Lead.

**Copy.** H1 "Who’s free, **and when.**"; range "{start} – {end} · by week" or "November – April · by month"; chip "Illustrative snapshot · proposals made in this session aren’t shown here"; controls "←", "Today", "→", "Weeks" / "Months"; discipline chips (same 9 as People); legend "On a project", "Available · confirmed", "Available · pending confirmation", "Proposed for a team".

**Timeline.** Weeks view: 16-week window starting Nov 22 (+ offset), ticks every 2 weeks, ←/→ shift 4 weeks, "Today" resets; arrows disabled in Months view (Nov–Apr). "Kick-offs" row: Vela Bank (Jan 12), Kestrel (draft) (Jan 12), Cobalt (Jan 19), Terra Foods (Feb 9), Nimbus (Mar 2) — each links to `/opportunities`. Today marker. 12 people rows, each with bars:
- "On a project" (grey) until project end, label = project name.
- Availability bar from free date: "Free from {date}" (green, confirmed), "Pending · {date}" (amber dashed), "Free now".
- "Proposed · {opportunity}" (coral) from kick-off (Ana → Kestrel Travel; Lucía, Camila → Vela Bank).

**Bar detail panel** (default selection: Daniel's pending bar). Kind label ("On a project" / "Confirmed availability" / "Pending confirmation" / "Proposed"), portrait, name, role; sentence ("On {project} until {date}.", "Free from {date}. Confirmed by {lead}.", "Free now. Not on a project.", "Expected free from {date}, but the project end date isn’t confirmed yet.", "Proposed for {opp} from {date}, awaiting human review."); facts "Current project", "Free from", "Delivery lead"; if pending: "Ask {lead} to confirm" → "Asked {lead} to confirm" (disabled); "Explore matching opportunities" → `/opportunities`; "Open profile" → Ana `/people/ana-ruiz`, others `/people`.

**Business rules.** Static data; session proposals not reflected (chip says so). Request-confirmation only changes the button (no notification). **Proposed:** sends a notification/task to the delivery lead, records the request with timestamp, shows "Requested {date}" and clears when confirmed. Date discrepancy: Tomás/Nimbus render as "Mar 1" here vs "Mar 2" elsewhere (day-offset bug) — use real dates.

**States.** View weeks/months; offset; discipline; selected bar; requested per person. Empty discipline: *Not designed* (Proposed: "No one in {discipline}"). Loading/error: *Not designed*.

**Dependencies.** Assignments/availability data, Opportunities (kick-offs), Build a team (proposals overlay — Proposed live), Notifications.

**Acceptance criteria.**
- [ ] Weeks/Months toggle; arrows page by 4 weeks in Weeks only; Today recenters.
- [ ] Pending availability is visually distinct (dashed) and labelled "Pending".
- [ ] Clicking any bar opens context; pending bars offer "Ask {lead} to confirm".
- [ ] Kick-offs row aligns with opportunity start dates.
- [ ] Proposed overlays reflect submitted proposals (Proposed).

---

## 12. Skills Intelligence / Insights (`v4-insights`) → `/insights`

**Purpose & goals.** Organization-level view of capabilities vs demand: where capacity is short and which skills are growing. Never individual performance.

**Personas.** Staffing Lead.

**Copy.** H1 "What your organization **knows.**"; sub "Each dot is a person with documented experience. Never a performance measure."

**Observation cards (3).** "4 : 3" — "Mobile roles vs. mobile engineers free in January" — "Vela Bank and Cobalt Mobility start within a week of each other." — "Explore mobile →"; "0" — "Cloud engineers free before February" — "Two cloud roles open on Terra Foods and Nimbus Health." — "Explore cloud →"; "+2" — "People growing into AI this quarter" — "Including Ana Ruiz’s LLM prototype and RAG course." — "Explore AI →". Each selects that capability.

**Capability rows (8).** Frontend, Mobile, Backend, Cloud & DevOps, Artificial intelligence, Data engineering, Architecture, Quality engineering. Each row: dots (filled = professional, half = training/emerging), open-role dots (coral), availability note (e.g. "3 free in Jan", "None before Feb", "Feb 16 · pending"). Legend "Professional experience", "Training or emerging", "Open role".

**Detail panel.** Default selected: Mobile. "{pro} professional · {em} growing · {demand} open roles", capability name, gap sentence when present (Mobile, Cloud, Data), sub-skill rows with professional/training bars and counts (click filters people; click again clears), "{n} people with documented {sub or capability} experience", people list (portrait, name, evidence, "Professional"/"Growing") linking to Ana's passport or People; "All capabilities" clears selection → placeholder "Choose a capability to see **the skills inside it** and the people behind them."

**Business rules.** Aggregates only; individuals appear only as evidence holders, labelled Professional/Growing. Static data. **Proposed:** computed nightly from passports + open roles; minimum-group-size rule for small populations (see gap analysis); export not in scope.

**States.** Selected capability/sub-skill. Loading/error/empty: *Not designed — needs design.*

**Dependencies.** Skills taxonomy, passports, opportunities, availability, People, Passport.

**Acceptance criteria.**
- [ ] Rows show professional vs growing counts and open-role demand.
- [ ] Observations link to the relevant capability.
- [ ] Sub-skill filter narrows the people list; label count updates.
- [ ] No performance, rating or ranking data appears.

---

## 13. Ask Sparq (`v4-nav` panel + inline cards)

**Purpose & goals.** Contextual assistant that summarizes and suggests "where you are working", always grounded in documented data, showing what each answer is based on, never deciding.

**Surfaces.**

| Surface | File | Behavior |
|---|---|---|
| Floating panel (all app pages) | `v4-nav` | FAB → panel; per-page context. |
| Home card | `v4-home` | Keyword-routed answers (see §2). |
| Passport summary card | `v4-passport` | "For a mobile lead role" / "For an AI product" summaries (§4). |
| Opportunity drawer | `v4-opportunities` | "Summarize the requirements" (computed). |
| Fill a role conversation | `v4-role` | Guided drafting + clarifying question (§8). |
| Build a team describe card | `v4-team` | "Describe the project. I’ll compose the team." (§9). |
| My space / CV import | `v4-me` | "Reading your CV and comparing it with your passport…" (§14). |

**Panel states** (fixtures `v4-ai-*`): closed (FAB only), **empty** (greeting + suggestions), **loading**, **response**, **wide** (900 px vs 440 px, suggestions in 2 columns), **min** (bottom bar "Ask Sparq · {context}" + latest answer or intro, "Expand", "Close").

**Panel anatomy & copy.** Header "Ask Sparq" / "Looking at {context}", buttons Minimize, Expand/Collapse, Close. Fresh: `{hello}`, `{intro}`, suggestion buttons (✦). Answer: question bubble; loading "Reading documented profiles and staffing data…" (~900 ms); tag **"Illustrative example"** (grey, predefined) or **"Live from this page"** (green, computed from current page state); answer text, bullets, person refs (portrait, name, evidence → Ana `/people/ana-ruiz`, others `/people`), action buttons, "Ask something else"; footer "Based on documented skills, projects and availability · fictional, illustrative". Input label "Ask Sparq", placeholder "Ask anything…", Send. Clicking the backdrop minimizes.

**Per-context content (predefined "Illustrative example" Q&A).**

| Context | Hello / intro | Suggested questions |
|---|---|---|
| home | "Good morning, Laura." / "I can help you start something new or see what needs attention." | "What needs my attention this week?"; "Who’s free for mobile work in January?" |
| people | "Looking for someone specific?" / "Ask in plain words. I answer from documented experience only." | "Who knows React Native and native iOS?"; "Who has grown into AI recently?" |
| passport | "Want the short version of Ana?" / "I summarize from her documented projects, with sources." | "Summarize Ana’s experience for a mobile AI team"; "What isn’t documented yet?" |
| opps | "Need a quick read on demand?" / "I can summarize opportunities and spot the hard-to-staff ones." | "Summarize Vela Bank’s requirements"; "Which opportunity is hardest to staff?" |
| role | "Let’s find the right person." / "Describe the role and I’ll draft the requirements with you." | "Who else could fill this role?"; "Is anyone also interested in this role?" (+ live items) |
| team | "Let’s shape this team." / "I can check coverage, conflicts and availability as you compose." | "What do similar teams usually include?"; "How should I choose between two people?" (+ live items) |
| planning | "Want this period explained?" / "I explain availability from documented assignments." | "Explain January availability"; "Whose dates are unconfirmed?" |
| insights | "What would you like to understand?" / "I read capability patterns, never individual performance." | "Where are we short on capacity?"; "What skills are growing?" |
| me | "Hi Ana. Planning your next step?" / "I only use your own passport and open opportunities." | "Which opportunities fit my interests?"; "What should I add to my passport?" (+ live "What have I shared so far?") |
| mypassport | "Your passport, your words." / "I can suggest what to add. You decide what goes in." | "What would make my passport easier to find?"; "What do staffing leads see?" |

Compare uses the `team` context.

**Business rules (prototype).** Max 6 Q&A per context (live items first). Free-text matching: if any word longer than 4 letters from a suggested question appears in the typed text, that answer is shown; otherwise the fallback "In this prototype I answer a few example questions for each page. Try one of the suggestions." **Proposed:** real LLM via server gateway with retrieval over the permitted data for the current page and user, citations to evidence records, "Live from this page" answers derived from the page's server state, and refusals for scoring/ranking/performance questions.

**Guardrail copy to preserve.** "I answer from documented experience only."; "I read capability patterns, never individual performance."; "I show evidence and availability, never a score; the delivery lead decides."; "I only use your own passport and open opportunities."; "No ratings, scores or performance data."

**States.** Error: *Not designed — needs design.* Proposed: in-panel message "I couldn’t answer that right now." + retry; timeout after 20 s; never show partial uncited claims. Rate limit: Proposed "You’ve asked a lot of questions — try again in a minute."

**Dependencies.** All modules (context), LLM gateway, retrieval index, audit log.

**Acceptance criteria.**
- [ ] Panel knows the current page context and the persona.
- [ ] Every answer shows its basis (people refs / evidence / "Live from this page" tag).
- [ ] Minimize/expand/close work; minimized bar shows the latest answer.
- [ ] Engineer-mode answers only use the engineer's own data and open opportunities.
- [ ] Requests to rank/score people are declined with an explanation (Proposed).

---

## 14. Profile import and export

### 14.1 Export — "Preview & export" (`v4-passport`)
Available to the engineer ("Preview & export" on `/me/passport`) and to staff ("Preview profile" on `/people/[id]`) — same dialog, including the export buttons.

- Dialog "Preview & **export**", ✕, "This is exactly what people inside Sparq will see."
- Format options: "PDF portfolio" (Designed for delivery leads), "Word document" (Classic profile layout), "One-page summary" (Skills, work and availability). Default PDF.
- Checkbox "Hide client names" → Meridian Health → "Healthcare client", Helix Insurance → "Insurance client" in the preview.
- Buttons "Export {format}", "Copy internal link" → "✓ Internal link copied".
- Progress "Preparing your document…" (~1 s) → "✓ {format} ready" + "Ana is notified whenever her passport is shared. No file is created in this prototype." + "Done".
- Document preview: dark Sparq header "TALENT PASSPORT", portrait, name, role, "Medellín · 9 years · available from Jan 5, 2027", summary, "EXPERTISE" (groups), "SELECTED WORK" (title + client/anonymized · role · period), "CERTIFICATIONS", footer "Internal use only · fictional prototype data" / "Generated Nov 24, 2026 · page 1 of 1".

**Prototype limits.** No file is generated; the preview is identical for all three formats; the link isn't copied; no notification is sent. **Proposed:** server-side generation (PDF/DOCX/one-pager), signed short-lived download URL, internal link requires auth, every export/share logged and the owner notified, anonymization applied server-side.

**Acceptance criteria.**
- [ ] Preview equals the exported content for the chosen format.
- [ ] "Hide client names" anonymizes in both preview and file.
- [ ] Export produces a downloadable file; owner notified; audit entry written (Proposed).
- [ ] Staff exports of someone else's passport follow consent rules (Proposed).

### 14.2 Import — "Update from my CV" (`v4-me`)
Import **exists only as a CV-to-passport comparison for the engineer**; there is no bulk/HR import and no staff-side import.

1. "Update from my CV" → dialog "Update from **your CV**": "Drop your CV here" / "PDF or Word. Nothing changes until you confirm it." / button "Use Ana_Ruiz_CV_2026.pdf" (no real drop zone or file picker).
2. "Reading your CV and comparing it with your passport…" (~1.2 s).
3. "I found 4 things that could update your passport. Keep or skip each one." — items: New skill "Expo Router" (Independent project, 2025) [Keep]; Correction "GraphQL · 3 years" (Your passport says 4) [Keep]; New project "Lumbre Studio — loyalty app, 2018" (Earlier career) [Keep]; New skill "Jetpack Compose" (Mentioned once, without project context) [Skip by default]. Each has "Keep" / "Skip".
4. "Update passport ({n})" (disabled when 0) → toast "✓ Passport updated with {n} changes from your CV"; "Cancel".

**Prototype limits.** No upload; extraction is canned; applying only raises the completeness %, nothing is written to the passport. **Proposed:** upload to private storage, background parsing job, LLM extraction into a diff (new skill / correction / new project) with source snippets, per-item keep/skip, apply as a single transaction with evidence source "From CV · {file} · {date}" and evidence level chosen by the user; CV file retained only as long as needed.

**Acceptance criteria.**
- [ ] Nothing changes in the passport until the user confirms.
- [ ] Each suggestion shows kind, value and why (note).
- [ ] Kept items appear in the passport with source "From CV" (Proposed).
- [ ] Supported formats: PDF, DOCX; size limit and parse-failure states designed (Proposed; not designed in V4.2).

---

## 15. Product Showcase (`v4-show-cover`, `v4-show-journey`, `v4-show-*`, `v4-tour`)

**Purpose.** A guided ~8-minute demo of the product story (Discover · Connect · Build · Grow) on fictional data. Not part of the production app; **Proposed:** ship only in a demo tenant/feature flag.

**Cover** (`/showcase`): "An independent internal innovation concept · fictional data"; H1 "Sparq Talent **Intelligence**"; "Connecting the right talent with the right opportunities."; "Discover. Connect. Build. Grow."; "Start the guided demo →" (clears all `sti42.*` state, opens step 1); "See the guided journey"; note "Starting the guided demo always resets to the original fictional data."; footer "Enterprise in capability. Consumer in experience. Human at heart." / "All people, clients, projects and AI responses are fictional · High-fidelity prototype · November 2026".

**Journey** (`/showcase/journey`): "Guided demonstration · about 8 minutes"; "Ten steps, **one story.**"; 5 "why" cards (THE OPPORTUNITY, FOR STAFFING & DELIVERY, FOR ENGINEERS, CONTEXTUAL AI, PEOPLE DECIDE); 4 chapters of step cards ("Open →"); footer "Every staffing step ends in human review. Ask Sparq answers are illustrative and use fictional data only."; "← Cover".

**Steps & tour bar.** Fixed dark bar: "{n}/10", "Guide" (toggles a popover with "{CHAPTER} · STEP n OF 10", title, hint, "← Previous step", "All steps", "Close"), "Next →" (last: "Finish ✓" → cover).

| Step | Wrapper | Embeds | Hint (abridged) |
|---|---|---|---|
| 1 | `v4-show-home` | Home | Try “Who’s free for mobile work in January?” |
| 2 | `v4-show-describe` | Team, stage describe | “Compose the team” |
| 3 | `v4-show-requirements` | Role, stage review | Toggle chips, answer, “Find people with this experience” |
| 4 | `v4-show-people` | People | Search, open Ana |
| 5 | `v4-show-passport` | Passport (staff) | “For a mobile lead role”, “Add to shortlist”, “Preview profile” |
| 6 | `v4-show-team` | Team, stage canvas | AI Engineer seat, propose Lucía, coverage & conflicts |
| 7 | `v4-show-planning` | Planning | Weeks/Months, Daniel’s pending bar, ask Inés to confirm |
| 8 | `v4-show-proposal` | Team, stage proposal | “Send for review”: nobody is assigned automatically |
| 9–10 | `v4-show-me` | My space | “I’m interested” on Vela Bank, “Share interest”, Ask Sparq “What have I shared so far?” |

Notes: the step prop allows 1–9 but the UI says "/10" (steps 9 and 10 share one screen). The canvas note says the bar is "at the bottom left", but the code positions it at the top. Links inside embedded screens leave the tour (they navigate to non-showcase files).

**Acceptance criteria (if built).**
- [ ] Starting the demo resets demo data to seed.
- [ ] Tour bar persists across steps with Previous/Next/All steps.
- [ ] Demo runs only against the fictional seed tenant.

---

## 16. Cross-module dependency summary

| Module | Reads from | Writes to |
|---|---|---|
| Home | Opportunities, Availability (static) | — |
| People | Skills/evidence, Availability, Shortlist | Shortlist, Compare params |
| Passport (staff) | Passport, Shortlist | Shortlist, Compare params, Export log |
| Personal passport | Passport, Interests, Skills | Passport, Interests, Skills, Experiences, Export log |
| My space | Passport, Interests, Opportunities | Interests, Opportunity interests, Growth interests, Learning plan, Skills, CV import |
| Opportunities | Opportunities, Drafts, Interests | — |
| Fill a role | Opportunity, People, Shortlist, Interests | Draft, Requirements, Proposal, Compare params |
| Build a team | People, Availability, Shortlist | Draft, Seats, Proposal, Compare params |
| Compare | People, Shortlist | Shortlist |
| Planning | Assignments, Availability, Opportunities | Confirmation requests (Proposed) |
| Insights | Skills aggregates, Opportunities | — |
| Ask Sparq | Context of the current page | Conversation log (Proposed) |
