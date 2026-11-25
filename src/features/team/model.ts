/**
 * Build a Team: pure view-model. No React, no I/O. Everything the canvas, the seat drawer, the panels and the proposal modal
 * show is derived here from plain, serializable inputs, so it is unit-testable and the UI stays presentation-only.
 *
 * PRODUCT GUARDRAILS: candidates are ordered by documented evidence, then availability (`candidatesForSeat`), never by a score;
 * "not documented" is never "no"; source and verification are shown separately; PROPOSED ≠ ASSIGNED (a seat is "confirmed" only
 * when the server says it became an assignment; the staffing lead can never produce that state).
 */
import { addDays, daysBetween, formatShortDate, parseIsoDate, toIsoDate } from "@/domain/dates";
import { candidatesForSeat, resolveCapability, seatFit, teamCoverage, type SeatFit, type TeamCoverage } from "@/domain/proposals";
import { bestEvidence, describeEvidence } from "@/domain/rules";
import type {
  Availability, Capability, Discipline, EvidenceLevel, ExpressionOfInterest, Opportunity, Person, ProposalState, SaveSeatInput, Seniority, SkillEvidence, TeamProposal, Verification,
} from "@/domain/schemas";

/* ---------------- Inputs (all serializable) ---------------- */

export type TeamCandidate = {
  personId: string;
  name: string;
  discipline: Discipline;
  headline: string;
  availability: Availability;
  evidence: SkillEvidence[];
};

export type TeamOpportunity = Pick<Opportunity, "id" | "client" | "clientInitials" | "industry" | "name" | "description" | "kickoff" | "durationMonths" | "deliveryLead" | "roles">;

export type TeamContext = {
  opportunity: TeamOpportunity;
  /** Business "today" (the clock), YYYY-MM-DD. */
  today: string;
  catalogue: Capability[];
  candidates: TeamCandidate[];
  /** Person ids on the viewer's shortlist. */
  shortlist: string[];
  /** Shared expressions of interest the viewer may see (staffing leads: all shared ones). */
  interests: Pick<ExpressionOfInterest, "personId" | "roleRequirementId" | "opportunityId">[];
  /** Opportunity slug → client name, for "Proposed for Vela Bank from Jan 12". */
  opportunityNames: Record<string, string>;
};

/* ---------------- Seats ---------------- */

export type TeamSeat = {
  /** Stable local key (the server id once saved, the role id or a generated key before). */
  key: string;
  roleRequirementId: string | null;
  title: string;
  capabilities: string[];
  seniority: Seniority;
  /** Fraction of a full-time engagement. */
  allocation: number;
  personId: string | null;
  /** The seat became an assignment (set by the server after a delivery lead confirms it). Never set by the lead. */
  confirmed: boolean;
};

export type SeatState = "open" | "proposed" | "confirmed";
export const seatState = (s: Pick<TeamSeat, "personId" | "confirmed">): SeatState => (s.confirmed && s.personId ? "confirmed" : s.personId ? "proposed" : "open");

export const SENIORITY: readonly Seniority[] = ["Mid", "Senior", "Lead"];
export const ALLOCATIONS: readonly { label: string; value: number }[] = [{ label: "Full-time", value: 1 }, { label: "Half-time", value: 0.5 }];
export const allocationLabel = (a: number): string => ALLOCATIONS.find((x) => x.value === a)?.label ?? `${a} FTE`;

/** Catalogue roles offered by "+ Add a role" (spec §9.2). Each can be added once. */
export const ROLE_TEMPLATES: readonly { kind: string; title: string; capabilities: string[]; seniority: Seniority }[] = [
  { kind: "qa", title: "QA Automation", capabilities: ["Appium", "Playwright"], seniority: "Mid" },
  { kind: "android", title: "Android Engineer", capabilities: ["Kotlin", "Jetpack Compose"], seniority: "Mid" },
  { kind: "cloud", title: "Cloud Engineer", capabilities: ["AWS", "Terraform"], seniority: "Mid" },
];

export function inferSeniority(title: string): Seniority {
  const t = title.toLowerCase();
  if (/\blead\b|\bprincipal\b/.test(t)) return "Lead";
  if (/\bsenior\b|\bsr\b|\barchitect\b/.test(t)) return "Senior";
  return "Mid";
}

/** Deterministic composition (no model involved): one open seat per role requirement of the opportunity. */
export function composeSeats(opportunity: TeamOpportunity): TeamSeat[] {
  return opportunity.roles.map((r) => ({
    key: r.id, roleRequirementId: r.id, title: r.title, capabilities: [...r.capabilities], seniority: inferSeniority(r.title), allocation: 1, personId: null, confirmed: false,
  }));
}

export function seatsFromProposal(p: Pick<TeamProposal, "seats">): TeamSeat[] {
  return p.seats.map((s) => ({
    key: s.id, roleRequirementId: s.roleRequirementId, title: s.title, capabilities: [...s.capabilities], seniority: s.seniority ?? inferSeniority(s.title),
    allocation: s.allocation, personId: s.personId, confirmed: s.seatState === "confirmed" || s.assignmentId !== null,
  }));
}

export function toSaveSeats(seats: TeamSeat[]): SaveSeatInput[] {
  return seats.map((s) => ({ roleRequirementId: s.roleRequirementId, title: s.title, capabilities: s.capabilities, seniority: s.seniority, allocation: s.allocation, personId: s.personId }));
}

let counter = 0;
export const newSeatKey = (): string => `seat-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export const placedCount = (seats: TeamSeat[]): number => seats.filter((s) => s.personId).length;

/* ---------------- Canvas layout (radial, CSS-positioned) ---------------- */

export type SeatSlot = { x: number; y: number };

/** Seats are placed on an ellipse around the central project card, starting at 12 o'clock (percent of the canvas). */
export function seatLayout(n: number): SeatSlot[] {
  return Array.from({ length: n }, (_, i) => {
    const ang = ((-90 + (i * 360) / Math.max(n, 1)) * Math.PI) / 180;
    return { x: Math.round((50 + Math.cos(ang) * 33) * 10) / 10, y: Math.round((50 + Math.sin(ang) * 32) * 10) / 10 };
  });
}

/** Taller canvas for bigger teams so seats never overlap. */
export const canvasHeight = (n: number): number => 600 + Math.max(0, n - 6) * 56;

/* ---------------- Availability ---------------- */

export type FitTone = "ok" | "warn" | "overlap";
export const fitTone = (f: SeatFit): FitTone => (f.kind === "free" ? "ok" : f.kind === "overlap" ? "overlap" : "warn");

export function fitFor(ctx: TeamContext, personId: string): SeatFit | null {
  const c = ctx.candidates.find((x) => x.personId === personId);
  if (!c) return null;
  return seatFit(c.availability, ctx.opportunity.kickoff, ctx.opportunity.id, ctx.today, (id) => ctx.opportunityNames[id] ?? null);
}

/* ---------------- Candidates for a seat ---------------- */

export type RequirementCell = { label: string; level: EvidenceLevel | null; verification: Verification | null; needsConfirmation: boolean; text: string };

export type CandidateAction = "propose" | "replace" | "move" | "remove";

export type CandidateView = {
  personId: string;
  name: string;
  headline: string;
  fit: SeatFit;
  onShortlist: boolean;
  sharedInterest: boolean;
  cells: RequirementCell[];
  /** One line per matched requirement for "Show evidence". */
  evidenceLines: string[];
  inThisSeat: boolean;
  /** Title of the other seat this person already holds, if any. */
  elsewhere: string | null;
  action: CandidateAction;
  actionLabel: string;
};

/** The candidate matcher needs a Person; only id and name matter to it (the client never receives the rest of a profile). */
const asPerson = (c: TeamCandidate): Person => ({ id: c.personId, name: c.name, headline: c.headline, discipline: c.discipline, location: "", yearsExperience: 0, languages: [], summary: "", topSkills: [], journey: [], certifications: [] });

export function candidateViews(ctx: TeamContext, seats: TeamSeat[], seat: TeamSeat): { views: CandidateView[]; uncatalogued: string[] } {
  const rows = ctx.candidates.map((c) => ({ person: asPerson(c), evidence: c.evidence, availability: c.availability }));
  const { matches, uncatalogued } = candidatesForSeat(seat.capabilities, rows, ctx.catalogue);
  const views = matches.map((m): CandidateView => {
    const c = ctx.candidates.find((x) => x.personId === m.personId)!;
    const cells = seat.capabilities.map((label): RequirementCell => {
      const cap = resolveCapability(label, ctx.catalogue);
      const best = cap ? bestEvidence(c.evidence, cap.id) : null;
      const d = describeEvidence(best?.level ?? null, best?.verification ?? null);
      return { label, level: best?.level ?? null, verification: best?.verification ?? null, needsConfirmation: d.needsConfirmation, text: d.text };
    });
    const evidenceLines = cells.filter((x) => x.level).map((x) => {
      const cap = resolveCapability(x.label, ctx.catalogue);
      const best = cap ? bestEvidence(c.evidence, cap.id) : null;
      return `${x.label}: ${best?.detail ? `${best.detail} · ` : ""}${x.text}`;
    });
    const inThisSeat = seat.personId === c.personId;
    const other = seats.find((s) => s.key !== seat.key && s.personId === c.personId);
    const action: CandidateAction = inThisSeat ? "remove" : seat.personId ? "replace" : other ? "move" : "propose";
    return {
      personId: c.personId, name: c.name, headline: c.headline, fit: fitFor(ctx, c.personId)!,
      onShortlist: ctx.shortlist.includes(c.personId),
      sharedInterest: seat.roleRequirementId !== null && ctx.interests.some((i) => i.personId === c.personId && i.roleRequirementId === seat.roleRequirementId),
      cells, evidenceLines, inThisSeat, elsewhere: other?.title ?? null, action,
      actionLabel: action === "remove" ? "✓ Proposed" : action === "replace" ? "Propose instead" : action === "move" ? "Move here" : "Propose",
    };
  });
  return { views, uncatalogued };
}

/** Toast copy from spec §9.4 for a place / replace / move / remove action. */
export function placeToast(action: CandidateAction, personName: string, seatTitle: string, previousName?: string): string {
  if (action === "remove") return `${personName} removed from ${seatTitle}`;
  if (action === "replace") return `${personName} replaces ${previousName ?? "the previous person"}`;
  return `${personName} proposed for ${seatTitle}`;
}

/* ---------------- Coverage ---------------- */

export type CoverageGroupView = { key: keyof TeamCoverage; title: string; hint: string; items: { label: string; needsConfirmation: boolean }[]; tone: "ok" | "warn" | "bad" | "mute" };

/**
 * Spec §9.6, from documented capabilities. Honest nuance: a capability "documented" only through unconfirmed professional
 * evidence is flagged "needs confirmation" (source and verification stay separate; self-reported is never shown as confirmed).
 */
export function coverageGroups(ctx: TeamContext, seats: TeamSeat[]): { groups: CoverageGroupView[]; coverage: TeamCoverage } {
  const evidenceByPerson = Object.fromEntries(ctx.candidates.map((c) => [c.personId, c.evidence]));
  const coverage = teamCoverage(seats, evidenceByPerson, ctx.catalogue);
  const placed = seats.filter((s) => s.personId).map((s) => s.personId as string);
  const confirmedBy = (label: string): boolean => {
    const cap = resolveCapability(label, ctx.catalogue);
    if (!cap) return false;
    return placed.some((p) => { const e = bestEvidence(evidenceByPerson[p] ?? [], cap.id); return !!e && e.level === "professional" && e.verification === "verified"; });
  };
  const defs: Omit<CoverageGroupView, "items">[] = [
    { key: "documented", title: "Documented on this team", hint: "Professional project experience recorded in a passport.", tone: "ok" },
    { key: "trainingOrIndependent", title: "Training or independent work only", hint: "Learning is documented, client project experience is not yet.", tone: "warn" },
    { key: "notDocumented", title: "Not documented", hint: "Nobody proposed has a record of this. It may be a real gap or simply undocumented: ask the people involved.", tone: "bad" },
    { key: "waitingOnOpenSeats", title: "Waiting on an open seat", hint: "Propose someone for these roles to see coverage.", tone: "mute" },
  ];
  const groups = defs.filter((d) => coverage[d.key].length > 0).map((d) => ({
    ...d,
    items: coverage[d.key].map((label) => ({ label, needsConfirmation: d.key === "documented" ? !confirmedBy(label) : false })),
  }));
  return { groups, coverage };
}

/* ---------------- Conflicts ---------------- */

export type ConflictRow = { seatKey: string; title: string; person: string; text: string; tone: FitTone };

export function conflictRows(ctx: TeamContext, seats: TeamSeat[]): ConflictRow[] {
  return seats.filter((s) => s.personId).flatMap((s) => {
    const fit = fitFor(ctx, s.personId as string);
    const c = ctx.candidates.find((x) => x.personId === s.personId);
    return fit && fit.conflict && c ? [{ seatKey: s.key, title: s.title, person: c.name, text: fit.text, tone: fitTone(fit) }] : [];
  });
}

export function openSeatsLabel(seats: TeamSeat[]): string {
  const open = seats.filter((s) => !s.personId).length;
  return open ? `${open} open seat${open > 1 ? "s" : ""}` : "All seats proposed";
}

/* ---------------- Availability against kick-off (timeline) ---------------- */

export type Timeline = {
  ticks: { label: string; left: number }[];
  kickoffLeft: number;
  rows: { seatKey: string; title: string; person: string; filled: boolean; left: number; text: string; tone: FitTone }[];
};

/** Range = first day of the month of "today" through the month after the latest relevant date (kick-off or availability). */
export function timeline(ctx: TeamContext, seats: TeamSeat[]): Timeline {
  const { today, opportunity } = ctx;
  const startD = parseIsoDate(today); startD.setUTCDate(1);
  const start = toIsoDate(startD);
  const dates = [addDays(opportunity.kickoff, 30), ...seats.flatMap((s) => { const c = s.personId ? ctx.candidates.find((x) => x.personId === s.personId) : null; return c ? [addDays(c.availability.availableFrom, 14)] : []; })];
  const latest = dates.sort().at(-1) as string;
  const endD = parseIsoDate(latest); endD.setUTCMonth(endD.getUTCMonth() + 1, 1);
  const end = toIsoDate(endD);
  const span = Math.max(1, daysBetween(start, end));
  const pct = (d: string) => Math.max(0, Math.min(100, (daysBetween(start, d) / span) * 100));
  const ticks: Timeline["ticks"] = [];
  for (const d = parseIsoDate(start); toIsoDate(d) < end; d.setUTCMonth(d.getUTCMonth() + 1)) {
    ticks.push({ label: d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }), left: Math.round(pct(toIsoDate(d)) * 10) / 10 });
  }
  const rows = seats.map((s) => {
    const c = s.personId ? ctx.candidates.find((x) => x.personId === s.personId) : null;
    const fit = c ? fitFor(ctx, c.personId) : null;
    return { seatKey: s.key, title: s.title, person: c?.name ?? "Open seat", filled: !!c, left: c ? Math.round(pct(c.availability.availableFrom) * 10) / 10 : 0, text: fit?.text ?? "", tone: fit ? fitTone(fit) : ("ok" as const) };
  });
  return { ticks, kickoffLeft: Math.round(pct(opportunity.kickoff) * 10) / 10, rows };
}

/* ---------------- Review notes (spec §9.7) ---------------- */

/** "To confirm during review". Open seats are allowed in a proposal: they appear here as notes. */
export function reviewNotes(ctx: TeamContext, seats: TeamSeat[]): string[] {
  const notes: string[] = [];
  for (const s of seats) {
    if (!s.personId) { notes.push(`${s.title} seat is still open`); continue; }
    const c = ctx.candidates.find((x) => x.personId === s.personId);
    const fit = fitFor(ctx, s.personId);
    if (!c || !fit || !fit.conflict) continue;
    if (fit.kind === "overlap") notes.push(`${c.name}: ${fit.text.charAt(0).toLowerCase()}${fit.text.slice(1)}`);
    else if (fit.kind === "late") notes.push(`${c.name} starts after kick-off (${formatShortDate(c.availability.availableFrom)})${c.availability.status === "pending" ? ", and the date is not yet confirmed" : ""}`);
    else notes.push(`${c.name}: availability from ${formatShortDate(c.availability.availableFrom)} not yet confirmed`);
  }
  const { coverage } = coverageGroups(ctx, seats);
  if (coverage.notDocumented.length) notes.push(`Not documented on this team: ${coverage.notDocumented.join(", ")}`);
  if (coverage.trainingOrIndependent.length) notes.push(`Training or independent work only: ${coverage.trainingOrIndependent.join(", ")}`);
  return notes.length ? notes : ["Nothing pending"];
}

/* ---------------- Proposal state ---------------- */

/** The canvas is editable only for a draft, a returned proposal, or a brand-new team. */
export const isReadOnly = (state: ProposalState | null): boolean => state !== null && state !== "draft" && state !== "changes_requested";

export function summaryLine(ctx: TeamContext, seats: TeamSeat[]): string {
  return `${seats.length} role${seats.length === 1 ? "" : "s"} · ${placedCount(seats)} placed · kick-off ${formatShortDate(ctx.opportunity.kickoff)}`;
}

export function durationLabel(months: number): string {
  return `${months} month${months === 1 ? "" : "s"}`;
}

/** Up to three people for "Compare side by side": the seat's holder first, then the next documented candidates. */
export function compareHref(ctx: TeamContext, seat: TeamSeat, ordered: CandidateView[]): string {
  const ids = [...(seat.personId ? [seat.personId] : []), ...ordered.map((c) => c.personId).filter((id) => id !== seat.personId)].slice(0, 3);
  const q = new URLSearchParams({ ids: ids.join(","), opp: ctx.opportunity.id });
  if (seat.roleRequirementId) q.set("role", seat.roleRequirementId);
  else q.set("caps", seat.capabilities.join(","));
  return `/compare?${q.toString()}`;
}
