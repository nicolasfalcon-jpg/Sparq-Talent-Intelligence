/** Opportunities, shortlists, planning (assignments) and expressions of interest over Supabase. Runs as the caller; RLS scopes everything. */
import { DomainRuleError, NotFoundError } from "@/domain/errors";
import type { InterestRepository, OpportunityRepository, PlanningRepository, ShortlistRepository } from "../types";
import { row, rows, type Db, type Row } from "./db";
import { resolveSlug } from "./ids";
import { embed, embedList, mapAssignment, mapEoi, mapOpportunity, str } from "./mappers";

type GetDb = () => Promise<Db>;

const OPP_COLS = "id, slug, client, client_initials, industry, name, short, description, status, kickoff, duration_months, capabilities, " +
  "role_requirements(id, slug, sort_order, title, capabilities), opportunity_delivery_leads(user_id, lead:app_users!user_id(display_name))";
export const ASSIGNMENT_COLS = "id, person_id, opportunity_id, proposal_seat_id, project_name, starts_on, ends_on, available_from, allocation, end_confirmed, delivery_lead_id, " +
  "person:people(slug), opportunity:opportunities(slug), lead:app_users!delivery_lead_id(display_name)";
export const EOI_COLS = "id, person_id, role_requirement_id, status, note, created_at, person:people(slug), role:role_requirements(slug, opportunity:opportunities(slug))";

export function createOpportunityRepository(getDb: GetDb): OpportunityRepository {
  async function load(db: Db, slug?: string) {
    const q = db.from("opportunities").select(OPP_COLS).order("kickoff");
    const opps = await rows(slug ? q.eq("slug", slug) : q);
    if (opps.length === 0) return [];
    const roleIds = opps.flatMap((o) => embedList(o.role_requirements).map((r) => str(r.id)));
    // proposedPersonId: the person placed in that role by the latest SUBMITTED or APPROVED proposal the viewer can see.
    const seats = roleIds.length
      ? await rows(db.from("proposal_seats").select("role_requirement_id, person:people(slug), proposal:team_proposals!inner(state, submitted_at)")
          .in("role_requirement_id", roleIds).in("proposal.state", ["submitted", "approved"]))
      : [];
    const latest = new Map<string, { at: string; person: string }>();
    for (const s of seats) {
      const person = embed(s.person), proposal = embed(s.proposal);
      if (!person || !proposal || s.role_requirement_id == null) continue;
      const key = str(s.role_requirement_id), at = str(proposal.submitted_at);
      const prev = latest.get(key);
      if (!prev || at > prev.at) latest.set(key, { at, person: str(person.slug) });
    }
    const interest = roleIds.length ? await rows(db.from("expressions_of_interest").select("role_requirement_id, status").in("role_requirement_id", roleIds).eq("status", "shared")) : [];
    const roleToOpp = new Map<string, string>();
    for (const o of opps) for (const r of embedList(o.role_requirements)) roleToOpp.set(str(r.id), str(o.id));
    return opps.map((o) => {
      const byRole = new Map<string, string>();
      for (const r of embedList(o.role_requirements)) { const hit = latest.get(str(r.id)); if (hit) byRole.set(str(r.slug), hit.person); }
      const count = interest.filter((i) => roleToOpp.get(str(i.role_requirement_id)) === str(o.id)).length;
      return mapOpportunity(o, { proposedByRole: byRole, interestCount: count });
    });
  }
  return {
    async list() { return load(await getDb()); },
    async get(id) { return (await load(await getDb(), id))[0] ?? null; },
  };
}

export function createShortlistRepository(getDb: GetDb): ShortlistRepository {
  const read = async (db: Db, owner: string) =>
    (await rows(db.from("shortlists").select("added_at, person:people(slug)").eq("owner_id", owner).order("added_at")))
      .map((r) => embed(r.person)).filter((p): p is Row => !!p).map((p) => str(p.slug));
  return {
    async get(owner) { return read(await getDb(), owner); },
    async toggle(owner, personSlug) {
      const db = await getDb();
      const personUuid = await resolveSlug(db, "people", personSlug, "person");
      const existing = await row(db.from("shortlists").select("person_id").eq("owner_id", owner).eq("person_id", personUuid).maybeSingle());
      // owner_id must equal the caller (RLS): a different owner id simply matches nothing and the insert is refused.
      if (existing) await rows(db.from("shortlists").delete().eq("owner_id", owner).eq("person_id", personUuid).select("person_id"));
      else await rows(db.from("shortlists").insert({ owner_id: owner, person_id: personUuid }));
      return read(db, owner);
    },
  };
}

export function createPlanningRepository(getDb: GetDb): PlanningRepository {
  return {
    // The viewer is not used: row-level security already limits assignments to what the JWT's user may see.
    async listAssignments() {
      const db = await getDb();
      return (await rows(db.from("assignments").select(ASSIGNMENT_COLS).order("starts_on"))).map(mapAssignment);
    },
  };
}

export function createInterestRepository(getDb: GetDb): InterestRepository {
  const toDomain = (list: Row[]) => list.map(mapEoi).filter((x): x is NonNullable<typeof x> => x !== null);
  return {
    async listForPerson(personSlug) {
      const db = await getDb();
      const personUuid = await resolveSlug(db, "people", personSlug, "person");
      return toDomain(await rows(db.from("expressions_of_interest").select(EOI_COLS).eq("person_id", personUuid).order("created_at")));
    },
    async listSharedFor() {
      const db = await getDb();
      return toDomain(await rows(db.from("expressions_of_interest").select(EOI_COLS).eq("status", "shared").order("created_at")));
    },
    async express(personSlug, roleSlug, note) {
      const db = await getDb();
      const [personUuid, roleUuid] = await Promise.all([resolveSlug(db, "people", personSlug, "person"), resolveSlug(db, "role_requirements", roleSlug, "role")]);
      const existing = await row(db.from("expressions_of_interest").select("id, status").eq("person_id", personUuid).eq("role_requirement_id", roleUuid).maybeSingle());
      // The insert policy requires status 'shared' and a role that is open for interest; a re-share after withdrawal is an UPDATE.
      const saved = existing
        ? await rows(db.from("expressions_of_interest").update({ status: "shared", note }).eq("id", str(existing.id)).select(EOI_COLS))
        : await rows(db.from("expressions_of_interest").insert({ person_id: personUuid, role_requirement_id: roleUuid, note }).select(EOI_COLS));
      const mapped = toDomain(saved)[0];
      if (!mapped) throw new DomainRuleError("interest_closed", "That role is not open for expressions of interest.");
      return mapped;
    },
    async withdraw(personSlug, roleSlug) {
      const db = await getDb();
      const [personUuid, roleUuid] = await Promise.all([resolveSlug(db, "people", personSlug, "person"), resolveSlug(db, "role_requirements", roleSlug, "role")]);
      const done = await rows(db.from("expressions_of_interest").update({ status: "withdrawn" }).eq("person_id", personUuid).eq("role_requirement_id", roleUuid).select("id"));
      if (done.length === 0) throw new NotFoundError("You have not shared interest in that role.");
    },
  };
}
