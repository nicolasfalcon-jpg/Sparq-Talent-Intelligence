import "server-only";
/**
 * The assistant's tool registry: SMALL, READ-ONLY, and authorized independently of the model.
 *
 *  - Every tool runs AS THE ACTOR through the existing scoped reads (`scopedTalent`, the policy). The model never receives an
 *    actor id it could change; it can only pass the arguments declared below, which are validated with Zod.
 *  - A tool that the actor may not use returns the same generic "not available" error whatever was asked (no reasons, no data).
 *  - Private career interests and unshared preferences are never returned (no tool reads them at all).
 *  - No tool writes anything. The assistant never proposes, assigns, shortlists or edits: humans do.
 *  - Results are wrapped as untrusted DATA (see `wrapData`); text coming from profiles, projects and opportunities may contain
 *    instructions, and the system prompt tells the model to ignore them. Authorization does not depend on the model obeying.
 *  - Every person, evidence row and opportunity a tool returns is recorded in `seen`, so the final answer's references can be
 *    validated against what was actually read in this request.
 */
import { z } from "zod";
import type { Repositories } from "@/data/repositories";
import type { ScopedTalent } from "@/data/repositories/scoped";
import { ForbiddenError, NotFoundError } from "@/domain/errors";
import { assertAllowed, authorize, type Actor } from "@/domain/policy";
import { candidatesForSeat, capacityCheck, seatFit, teamCoverage } from "@/domain/proposals";
import { applyPeopleFilters, describeAvailability, describeEvidence, sourceWord, VERIFICATION_LABEL } from "@/domain/rules";
import { Discipline, IsoDate } from "@/domain/schemas";

export type SeenPerson = { name: string; evidence?: string; when?: string; whenTone?: "ok" | "mute" };
export type Seen = {
  people: Map<string, SeenPerson>;
  /** evidence id → owning person id */
  evidence: Map<string, string>;
  opportunities: Map<string, { label: string }>;
};
export const newSeen = (): Seen => ({ people: new Map(), evidence: new Map(), opportunities: new Map() });

export type ToolEnv = { repos: Repositories; actor: Actor; talent: ScopedTalent; today: string; seen: Seen };

export type ToolResult = { ok: true; content: string } | { ok: false; content: string };

type ToolDef<A> = {
  name: string;
  description: string;
  /** JSON Schema sent to the model (hand-written: simple types only). Zod below is the real validation. */
  inputSchema: { type: "object"; properties: Record<string, unknown>; required: string[]; additionalProperties: false };
  args: z.ZodType<A>;
  run(env: ToolEnv, args: A): Promise<unknown>;
};

const label = z.string().trim().min(1).max(60);
const slug = z.string().trim().min(1).max(64);

/** Strip anything that could imitate our data delimiters and cap length. Profile text is untrusted. */
export function clip(text: string | undefined | null, max = 240): string {
  const t = (text ?? "").replace(/<\/?\s*tool_data[^>]*>/gi, "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Wrap a tool result as DATA. The model is told that nothing inside is an instruction. */
export function wrapData(tool: string, payload: unknown): string {
  return `<tool_data tool="${tool}" untrusted="true">\n${JSON.stringify(payload)}\n</tool_data>`;
}

const remember = (seen: Seen, personId: string, patch: Partial<SeenPerson> & { name: string }) => {
  seen.people.set(personId, { ...seen.people.get(personId), ...patch });
};

/* ---------------- Tools ---------------- */

const searchTalent: ToolDef<{ requirements: string[]; discipline?: z.infer<typeof Discipline>; availableBy?: string }> = {
  name: "search_talent_by_requirements",
  description:
    "Find people with DOCUMENTED experience for one or more requirements (capabilities such as 'React Native' or 'AWS'). Staffing leads only. " +
    "Returns up to 8 people with, per requirement, the evidence SOURCE and its VERIFICATION. The order is by documented evidence then availability; it is not a ranking and carries no score. " +
    "A requirement that is not in the skills catalogue cannot match anyone, which is not the same as nobody having it.",
  inputSchema: {
    type: "object", additionalProperties: false, required: ["requirements"],
    properties: {
      requirements: { type: "array", items: { type: "string" }, description: "1 to 8 capability names" },
      discipline: { type: "string", enum: Discipline.options, description: "optional discipline filter" },
      availableBy: { type: "string", description: "optional YYYY-MM-DD: only people free by this date" },
    },
  },
  args: z.object({ requirements: z.array(label).min(1).max(8), discipline: Discipline.optional(), availableBy: IsoDate.optional() }).strict(),
  async run(env, a) {
    const all = await env.talent.listPeople(); // asserts people:list
    const rows = applyPeopleFilters(all, { discipline: a.discipline ?? "All", availableBy: a.availableBy ?? null });
    const catalogue = await env.talent.listCapabilities();
    const { matches, uncatalogued } = candidatesForSeat(a.requirements, rows, catalogue);
    const byId = new Map(rows.map((r) => [r.person.id, r]));
    const people = matches.slice(0, 8).map((m) => {
      const r = byId.get(m.personId)!;
      const av = describeAvailability(r.availability, env.today);
      const evidence = m.matches.map((x) => `${x.name}: ${describeEvidence(x.level, x.verification).text}`).join(" · ");
      remember(env.seen, r.person.id, { name: r.person.name, evidence, when: av.compact, whenTone: av.confirmed ? "ok" : "mute" });
      return {
        personId: r.person.id, name: r.person.name, discipline: r.person.discipline, availability: av.text, availabilityStatus: av.statusLabel,
        evidence: m.matches.map((x) => ({
          requirement: x.name, source: x.level ? sourceWord(x.level) : "not documented",
          verification: x.verification ? VERIFICATION_LABEL[x.verification] : null,
        })),
      };
    });
    return { people, requirementsNotInCatalogue: uncatalogued, note: "Ordered by documented evidence, then availability. Not a ranking of people." };
  },
};

const getEvidence: ToolDef<{ personId: string }> = {
  name: "get_authorized_evidence",
  description:
    "Documented professional evidence and projects of ONE person you are allowed to see (an engineer sees only their own passport; staffing leads see all). " +
    "Each evidence row has a source (professional, independent, training, learning) and a verification (verified, pending verification, self-reported). Never presents unverified claims as confirmed.",
  inputSchema: { type: "object", additionalProperties: false, required: ["personId"], properties: { personId: { type: "string", description: "person id from a previous tool result or the page context" } } },
  args: z.object({ personId: slug }).strict(),
  async run(env, a) {
    const agg = await env.talent.getPerson(a.personId); // asserts passport:read for this actor
    if (!agg) throw new NotFoundError();
    const projects = await env.talent.listProjects(a.personId);
    const practical = agg.evidence.filter((e) => e.level === "professional").sort((x, y) => Number(y.verification === "verified") - Number(x.verification === "verified")).slice(0, 2);
    remember(env.seen, agg.person.id, { name: agg.person.name, evidence: practical.map((e) => `${e.label}${e.verification === "verified" ? "" : ` (${VERIFICATION_LABEL[e.verification]})`}`).join(" · ") || undefined });
    for (const e of agg.evidence) env.seen.evidence.set(e.id, agg.person.id);
    return {
      person: { personId: agg.person.id, name: agg.person.name, headline: clip(agg.person.headline, 120), discipline: agg.person.discipline, yearsExperience: agg.person.yearsExperience },
      evidence: agg.evidence.slice(0, 40).map((e) => ({ evidenceId: e.id, capability: clip(e.label, 60), source: sourceWord(e.level), verification: VERIFICATION_LABEL[e.verification], detail: clip(e.detail, 160) })),
      projects: projects.slice(0, 8).map((p) => ({ title: clip(p.title, 100), role: clip(p.role, 60), client: clip(p.client, 60), period: clip(p.period, 30), verification: VERIFICATION_LABEL[p.verification], summary: clip(p.summary, 200) })),
    };
  },
};

const getOpportunities: ToolDef<{ opportunityId?: string }> = {
  name: "get_opportunities_and_roles",
  description:
    "Opportunities and their role requirements that you are allowed to see, with seat states (open or proposed). Staffing leads see all; an engineer sees only opportunities open for interest, without proposals. " +
    "Pass opportunityId to get one.",
  inputSchema: { type: "object", additionalProperties: false, required: [], properties: { opportunityId: { type: "string", description: "optional opportunity id" } } },
  args: z.object({ opportunityId: slug.optional() }).strict(),
  async run(env, a) {
    const staff = authorize(env.actor, "opportunities:read").allowed;
    if (!staff && !authorize(env.actor, "opportunities:read-published").allowed) throw new ForbiddenError();
    let list = await env.repos.opportunities.list();
    // Defense in depth: the database scopes this by row-level security; the memory adapter does not, so scope here too.
    if (env.actor.role === "delivery_lead") list = list.filter((o) => o.deliveryLeadId === env.actor.id);
    if (!staff) list = list.filter((o) => o.status === "Open");
    if (a.opportunityId) list = list.filter((o) => o.id === a.opportunityId);
    return {
      opportunities: list.slice(0, 12).map((o) => {
        env.seen.opportunities.set(o.id, { label: `${o.client} · ${o.name}` });
        return {
          opportunityId: o.id, client: clip(o.client, 60), name: clip(o.name, 80), status: o.status, kickoff: o.kickoff, durationMonths: o.durationMonths,
          ...(staff ? { deliveryLead: clip(o.deliveryLead, 60) } : {}),
          description: clip(o.description, 220),
          roles: o.roles.map((r) => {
            if (staff && r.proposedPersonId && !env.seen.people.has(r.proposedPersonId)) env.seen.people.set(r.proposedPersonId, { name: r.proposedPersonId });
            return { roleId: r.id, title: clip(r.title, 60), capabilities: r.capabilities.map((c) => clip(c, 40)), seat: staff && r.proposedPersonId ? "proposed (not assigned)" : "open", ...(staff && r.proposedPersonId ? { proposedPersonId: r.proposedPersonId } : {}) };
          }),
        };
      }),
    };
  },
};

const checkAvailability: ToolDef<{ personIds: string[]; kickoff?: string; opportunityId?: string }> = {
  name: "check_availability",
  description:
    "Availability of 1 to 10 people you are allowed to see: free-from date, confirmed or pending, and, when kickoff (YYYY-MM-DD) is given, whether each is free before it, pending, late, or proposed for another opportunity.",
  inputSchema: {
    type: "object", additionalProperties: false, required: ["personIds"],
    properties: { personIds: { type: "array", items: { type: "string" } }, kickoff: { type: "string", description: "YYYY-MM-DD" }, opportunityId: { type: "string", description: "the opportunity being staffed, if any" } },
  },
  args: z.object({ personIds: z.array(slug).min(1).max(10), kickoff: IsoDate.optional(), opportunityId: slug.optional() }).strict(),
  async run(env, a) {
    const opps = a.kickoff ? await env.repos.opportunities.list().catch(() => []) : [];
    const nameOf = (id: string) => { const o = opps.find((x) => x.id === id); return o ? o.client : null; };
    const out = [];
    for (const id of a.personIds) {
      const agg = await env.talent.getPerson(id); // asserts passport:read: an engineer cannot check anyone else
      if (!agg) throw new NotFoundError();
      const av = describeAvailability(agg.availability, env.today);
      remember(env.seen, agg.person.id, { name: agg.person.name, when: av.compact, whenTone: av.confirmed ? "ok" : "mute" });
      out.push({
        personId: agg.person.id, name: agg.person.name, availability: av.text, status: av.statusLabel, currentProject: agg.availability.currentProject,
        proposedFor: agg.availability.proposedFor ? { opportunityId: agg.availability.proposedFor.opportunityId, from: agg.availability.proposedFor.from } : null,
        ...(a.kickoff ? { fitForKickoff: seatFit(agg.availability, a.kickoff, a.opportunityId ?? null, env.today, nameOf).text } : {}),
      });
    }
    return { people: out };
  },
};

const analyzeCoverage: ToolDef<{ seats: { capabilities: string[]; personId?: string | null }[] }> = {
  name: "analyze_team_coverage",
  description:
    "Documented coverage of a team: for each required capability, the best documented evidence among everyone placed. Groups: documented (professional experience), training or independent only, not documented (a real gap OR simply undocumented), waiting on an open seat. Staffing leads only.",
  inputSchema: {
    type: "object", additionalProperties: false, required: ["seats"],
    properties: { seats: { type: "array", items: { type: "object", additionalProperties: false, required: ["capabilities"], properties: { capabilities: { type: "array", items: { type: "string" } }, personId: { type: ["string", "null"] } } } } },
  },
  args: z.object({ seats: z.array(z.object({ capabilities: z.array(label).max(12), personId: slug.nullish() }).strict()).min(1).max(12) }).strict(),
  async run(env, a) {
    assertAllowed(env.actor, "people:list");
    const evidenceByPerson: Record<string, import("@/domain/schemas").SkillEvidence[]> = {};
    for (const s of a.seats) {
      if (!s.personId || evidenceByPerson[s.personId]) continue;
      const agg = await env.talent.getPerson(s.personId);
      if (!agg) throw new NotFoundError();
      evidenceByPerson[s.personId] = agg.evidence;
      remember(env.seen, agg.person.id, { name: agg.person.name });
    }
    const cov = teamCoverage(a.seats.map((s) => ({ capabilities: s.capabilities, personId: s.personId ?? null })), evidenceByPerson, await env.talent.listCapabilities());
    return { documentedProfessional: cov.documented, trainingOrIndependentOnly: cov.trainingOrIndependent, notDocumented: cov.notDocumented, waitingOnOpenSeats: cov.waitingOnOpenSeats };
  },
};

const explainConflicts: ToolDef<{ personId: string; startsOn: string; availableFrom?: string | null; allocation: number }> = {
  name: "explain_allocation_conflicts",
  description:
    "Would a new assignment fit? Checks the person's confirmed assignments against a proposed window [startsOn, availableFrom) and allocation (1 = full-time, 0.5 = half-time). The peak total allocation must stay at or below 1.0. Staffing leads only. Read-only: it never creates an assignment.",
  inputSchema: {
    type: "object", additionalProperties: false, required: ["personId", "startsOn", "allocation"],
    properties: { personId: { type: "string" }, startsOn: { type: "string", description: "YYYY-MM-DD" }, availableFrom: { type: ["string", "null"], description: "YYYY-MM-DD release date, or null if open-ended" }, allocation: { type: "number", description: "fraction of full-time, greater than 0 and at most 1" } },
  },
  args: z.object({ personId: slug, startsOn: IsoDate, availableFrom: IsoDate.nullish(), allocation: z.number().gt(0).lte(1) }).strict(),
  async run(env, a) {
    assertAllowed(env.actor, "planning:read");
    const agg = await env.talent.getPerson(a.personId);
    if (!agg) throw new NotFoundError();
    remember(env.seen, agg.person.id, { name: agg.person.name });
    const mine = (await env.repos.planning.listAssignments(env.actor)).filter((x) => x.personId === a.personId);
    const check = capacityCheck(mine, { startsOn: a.startsOn, availableFrom: a.availableFrom ?? null, allocation: a.allocation });
    return {
      person: agg.person.name, fits: check.ok, peakAllocationIfAdded: check.peak, firstConflictOn: check.firstConflictOn,
      existingAssignments: mine.slice(0, 10).map((x) => ({ project: clip(x.projectName, 60), startsOn: x.startsOn, releasedOn: x.availableFrom, allocation: x.allocation })),
    };
  },
};

// The registry is heterogeneous in its argument type; execution always validates with the tool's own schema first.
export const TOOLS = [searchTalent, getEvidence, getOpportunities, checkAvailability, analyzeCoverage, explainConflicts] as unknown as ToolDef<unknown>[];
export const TOOL_NAMES = TOOLS.map((t) => t.name);

/** Tools offered to a given actor. Offering is a hint to the model only: execution re-checks authorization every time. */
export function toolsFor(actor: Actor): ToolDef<unknown>[] {
  if (actor.role === "staffing_lead") return TOOLS;
  if (actor.role === "engineer") return TOOLS.filter((t) => t.name === "get_authorized_evidence" || t.name === "get_opportunities_and_roles" || t.name === "check_availability");
  return [];
}

const DENIED = "This isn’t available to you.";

/** Execute a tool call as the actor. Never throws: failures come back as error results with generic, non-revealing messages. */
export async function executeTool(env: ToolEnv, name: string, rawInput: unknown): Promise<ToolResult> {
  const tool = toolsFor(env.actor).find((t) => t.name === name);
  if (!tool) return { ok: false, content: wrapData(name, { error: DENIED }) };
  const parsed = tool.args.safeParse(rawInput);
  if (!parsed.success) return { ok: false, content: wrapData(name, { error: "Invalid arguments." }) };
  try {
    return { ok: true, content: wrapData(name, await tool.run(env, parsed.data)) };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof NotFoundError) return { ok: false, content: wrapData(name, { error: DENIED }) };
    return { ok: false, content: wrapData(name, { error: "That data isn’t available right now." }) };
  }
}
