/**
 * Resource planning timeline (read-only). Pure view-model computed from the same availability the Home and People screens use,
 * plus confirmed assignments. PROPOSED ≠ ASSIGNED: a proposal is drawn as a "Proposed" marker and never occupies the person.
 */
import { addDays, daysBetween, formatShortDate, parseIsoDate, toIsoDate } from "@/domain/dates";
import { describeAvailability, freeWithin } from "@/domain/rules";
import type { Assignment, Availability, Discipline, Opportunity, Person } from "@/domain/schemas";

export type PlanningView = "w" | "m";
export type BarKind = "assignment" | "available" | "pending" | "proposed";

export type Bar = { key: string; kind: BarKind; leftPct: number; widthPct: number; label: string; aria: string };
export type PlanningRow = { person: Pick<Person, "id" | "name" | "headline" | "discipline">; bars: Bar[] };
export type Kickoff = { opportunityId: string; client: string; initials: string; date: string; leftPct: number; top: number };
export type Tick = { label: string; leftPct: number };

export type PlanningModel = {
  window: { start: string; end: string; label: string; view: PlanningView };
  ticks: Tick[];
  /** null when today is outside the window */
  todayPct: number | null;
  kickoffs: Kickoff[];
  rows: PlanningRow[];
  freeSoon: { personId: string; name: string; compact: string; confirmed: boolean }[];
};

const WEEKS_SPAN = 112; // 16 weeks
const OFFSET_STEP = 28;

/** Window start: weekly view starts 2 days before today (+ offset); monthly view starts on the 1st of today's month. */
export function planningWindow(today: string, view: PlanningView, offsetDays = 0): { start: string; days: number } {
  if (view === "m") {
    const d = parseIsoDate(today);
    const start = toIsoDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
    const end = toIsoDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 6, 1)));
    return { start, days: daysBetween(start, end) };
  }
  return { start: addDays(today, -2 + clampOffset(offsetDays)), days: WEEKS_SPAN };
}
export const clampOffset = (n: number): number => Math.max(-OFFSET_STEP * 4, Math.min(OFFSET_STEP * 8, Math.round(Number.isFinite(n) ? n : 0)));
export const OFFSET_STEP_DAYS = OFFSET_STEP;

export function buildPlanning(input: {
  rows: { person: Person; availability: Availability }[];
  assignments: Assignment[];
  opportunities: Opportunity[];
  today: string;
  view?: PlanningView;
  offsetDays?: number;
  discipline?: Discipline | "All";
}): PlanningModel {
  const view = input.view ?? "w";
  const { start, days } = planningWindow(input.today, view, input.offsetDays ?? 0);
  const end = addDays(start, days);
  const pct = (iso: string) => Math.max(0, Math.min(100, (daysBetween(start, iso) / days) * 100));
  const bar = (key: string, kind: BarKind, from: string, to: string, label: string, aria: string): Bar | null => {
    if (to <= start || from >= end) return null;
    const l = pct(from), r = pct(to);
    if (r - l < 0.4) return null;
    return { key, kind, leftPct: round(l), widthPct: round(r - l), label: r - l > 8 ? label : "", aria };
  };
  const oppName = (id: string) => input.opportunities.find((o) => o.id === id)?.client ?? "another team";

  const rows = input.rows
    .filter((r) => !input.discipline || input.discipline === "All" || r.person.discipline === input.discipline)
    .map((r): PlanningRow => {
      const bars: (Bar | null)[] = [];
      const mine = input.assignments.filter((a) => a.personId === r.person.id);
      for (const a of mine) {
        const to = a.availableFrom ?? (a.endsOn ? addDays(a.endsOn, 1) : end);
        bars.push(bar(`${r.person.id}:assignment:${a.id}`, "assignment", a.startsOn, to, a.projectName, `${r.person.name}: on ${a.projectName}`));
      }
      const av = r.availability;
      const free = av.availableFrom < input.today ? input.today : av.availableFrom;
      const freeTo = av.proposedFor ? av.proposedFor.from : end;
      const freeLabel = av.status === "confirmed" ? (av.availableFrom <= input.today ? "Free now" : `Free from ${formatShortDate(av.availableFrom)}`) : `Pending · ${formatShortDate(av.availableFrom)}`;
      bars.push(bar(`${r.person.id}:${av.status === "confirmed" ? "available" : "pending"}`, av.status === "confirmed" ? "available" : "pending", free, freeTo, freeLabel, `${r.person.name}: ${freeLabel}`));
      if (av.proposedFor) {
        const label = `Proposed · ${oppName(av.proposedFor.opportunityId)}`;
        bars.push(bar(`${r.person.id}:proposed`, "proposed", av.proposedFor.from, end, label, `${r.person.name}: ${label}, awaiting human review`));
      }
      return { person: { id: r.person.id, name: r.person.name, headline: r.person.headline, discipline: r.person.discipline }, bars: bars.filter((b): b is Bar => b !== null) };
    });

  const ticks: Tick[] = [];
  if (view === "w") for (let i = 0; i < days; i += 14) ticks.push({ label: formatShortDate(addDays(start, i)), leftPct: round(pct(addDays(start, i))) });
  else {
    const s = parseIsoDate(start);
    for (let m = 0; m < 6; m++) {
      const d = toIsoDate(new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + m, 1)));
      ticks.push({ label: new Date(`${d}T00:00:00Z`).toLocaleString("en-US", { month: "short", timeZone: "UTC" }), leftPct: round(pct(d)) });
    }
  }

  const kickoffs = input.opportunities
    .filter((o) => o.kickoff >= start && o.kickoff < end)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
    .map((o, i): Kickoff => ({ opportunityId: o.id, client: o.client, initials: o.clientInitials, date: o.kickoff, leftPct: round(pct(o.kickoff)), top: 2 + (i % 3) * 24 }));

  const freeSoon = freeWithin(input.rows, input.today, 60).map((r) => {
    const a = describeAvailability(r.availability, input.today);
    return { personId: r.person.id, name: r.person.name, compact: a.compact, confirmed: a.confirmed };
  });

  const label = view === "w" ? `${formatShortDate(start)} – ${formatShortDate(addDays(end, -1))} · by week` : `${formatShortDate(start)} – ${formatShortDate(addDays(end, -1))} · by month`;
  const t = daysBetween(start, input.today);
  return { window: { start, end, label, view }, ticks, todayPct: t >= 0 && t <= days ? round((t / days) * 100) : null, kickoffs, rows, freeSoon };
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Plain-language description of a selected bar, for the side panel. */
export function describeBar(row: PlanningRow, barKey: string, av: Availability, assignments: Assignment[], today: string): { kind: string; line: string; facts: { k: string; v: string }[]; pending: boolean } | null {
  const bar = row.bars.find((b) => b.key === barKey);
  if (!bar) return null;
  const first = row.person.name.split(" ")[0] ?? row.person.name;
  const lead = av.deliveryLead ?? "the delivery lead";
  const a = describeAvailability(av, today);
  const facts = [{ k: "Current project", v: av.currentProject ?? "None" }, { k: "Free from", v: a.isNow ? "Now" : formatShortDate(av.availableFrom) }, { k: "Delivery lead", v: av.deliveryLead ?? "None" }];
  if (bar.kind === "assignment") {
    const asg = assignments.find((x) => barKey.endsWith(`:${x.id}`));
    return { kind: "On a project", line: `${first} is on ${asg?.projectName ?? av.currentProject ?? "a project"}${asg?.endsOn ? ` until ${formatShortDate(asg.endsOn)}` : ""}${asg && asg.allocation < 1 ? ` (${Math.round(asg.allocation * 100)}% of full-time)` : ""}.`, facts, pending: false };
  }
  if (bar.kind === "proposed") return { kind: "Proposed", line: `${first} is proposed for ${av.proposedFor ? `a team from ${formatShortDate(av.proposedFor.from)}` : "a team"}, awaiting human review. Nobody is assigned until a delivery lead confirms.`, facts, pending: false };
  if (bar.kind === "pending") return { kind: "Pending confirmation", line: `${first} is expected to be free from ${formatShortDate(av.availableFrom)}. ${lead} has not confirmed the end date yet.`, facts, pending: true };
  return { kind: "Confirmed availability", line: a.isNow ? `${first} is free now.` : `${first} is free from ${formatShortDate(av.availableFrom)}. Confirmed by ${lead}.`, facts, pending: false };
}
