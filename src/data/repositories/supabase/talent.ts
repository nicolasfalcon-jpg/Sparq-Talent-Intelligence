/** TalentRepository over Supabase. Every call runs as the caller (RLS decides what exists); columns are always listed explicitly. */
import { DomainRuleError, ForbiddenError, InvalidRequestError, NotFoundError } from "@/domain/errors";
import { canOwnerAddEvidence, canOwnerRemoveEvidence } from "@/domain/rules";
import { resolveCapability } from "@/domain/proposals";
import type { Capability, CareerInterests, EvidenceLevel, ProjectExperience, SkillEvidence } from "@/domain/schemas";
import type { PersonAggregate, TalentRepository } from "../types";
import { row, rows, type Db, type Row } from "./db";
import { isUuid, resolveSlug } from "./ids";
import { idleAvailability, mapAvailability, mapCapability, mapEvidence, mapInterests, mapPerson, mapProject, str } from "./mappers";

const PERSON_COLS = "id, slug, name, headline, discipline, location, country, years_experience, at_sparq_since, languages, summary, top_skills, passport_groups";
const EVIDENCE_COLS = "id, person_id, label, source, detail, verification, verified_at, capability:capabilities(slug), verifier:app_users!verified_by(display_name)";
const PROJECT_COLS = "id, person_id, sort_order, period_label, client, client_category, role, title, summary, tags, highlights, verification, verified_at, verifier:app_users!verified_by(display_name)";

type GetDb = () => Promise<Db>;

export function createTalentRepository(getDb: GetDb, today: () => string): TalentRepository {
  const capabilityList = async (db: Db): Promise<Capability[]> =>
    (await rows(db.from("capabilities").select("slug, name, grp, aliases").order("name"))).map(mapCapability);

  /** People + evidence + availability + journey + certifications + preferences, in a fixed number of queries (no N+1). */
  async function aggregates(db: Db, slug?: string): Promise<PersonAggregate[]> {
    const q = db.from("people").select(PERSON_COLS).order("name");
    const people = await rows(slug ? q.eq("slug", slug) : q);
    if (people.length === 0) return [];
    const ids = people.map((p) => str(p.id));
    const [evidence, journey, certs, prefs, avail] = await Promise.all([
      rows(db.from("skill_evidence").select(EVIDENCE_COLS).in("person_id", ids).order("created_at")),
      rows(db.from("career_journey_entries").select("person_id, position, period_label, role, org, is_current").in("person_id", ids).order("position")),
      rows(db.from("certifications").select("person_id, name, issued_label, position").in("person_id", ids).order("position")),
      rows(db.from("person_preferences").select("person_id, work_preferences, shared_with_staffing").in("person_id", ids)),
      rows(db.rpc("person_availability", { as_of: today() })),
    ]);
    const leadIds = [...new Set(avail.map((a) => a.delivery_lead_id).filter((v) => v != null).map(String))];
    const oppIds = [...new Set(avail.map((a) => a.proposed_opportunity_id).filter((v) => v != null).map(String))];
    const [leads, opps] = await Promise.all([
      leadIds.length ? rows(db.from("app_users").select("id, display_name").in("id", leadIds)) : Promise.resolve([] as Row[]),
      oppIds.length ? rows(db.from("opportunities").select("id, slug").in("id", oppIds)) : Promise.resolve([] as Row[]),
    ]);
    const leadName = new Map(leads.map((l) => [str(l.id), str(l.display_name)]));
    const oppSlug = new Map(opps.map((o) => [str(o.id), str(o.slug)]));
    const by = (list: Row[], id: string) => list.filter((r) => str(r.person_id) === id);
    return people.map((p) => {
      const id = str(p.id), personSlug = str(p.slug);
      const a = avail.find((r) => str(r.person_id) === id);
      return {
        person: mapPerson(p, { journey: by(journey, id), certifications: by(certs, id), preference: by(prefs, id)[0] ?? null }),
        evidence: by(evidence, id).map((e) => mapEvidence(e, personSlug)),
        availability: a ? mapAvailability(a, personSlug, { leadName: (i) => leadName.get(i) ?? null, opportunitySlug: (i) => oppSlug.get(i) ?? null }) : idleAvailability(personSlug, today()),
      };
    });
  }

  const interestRows = (db: Db, personUuid: string) =>
    rows(db.from("career_interests").select("interest, selected, shared_with_staffing").eq("person_id", personUuid).order("created_at"));

  async function interestsOf(db: Db, personSlug: string, personUuid: string): Promise<CareerInterests> {
    return mapInterests(personSlug, await interestRows(db, personUuid));
  }

  /** The caller's own profile row, or ForbiddenError: an update that matches no row means RLS says it is not theirs. */
  async function ownRow(db: Db, personSlug: string, q: (personUuid: string) => PromiseLike<{ data: unknown; error: import("./db").PgError }>): Promise<Row[]> {
    const personUuid = await resolveSlug(db, "people", personSlug, "person");
    return rows(q(personUuid) as never);
  }

  return {
    async listCapabilities() { return capabilityList(await getDb()); },
    async listPeople() { return aggregates(await getDb()); },
    async getPerson(id) { return (await aggregates(await getDb(), id))[0] ?? null; },

    async listProjects(personSlug) {
      const db = await getDb();
      const personUuid = (await rows(db.from("people").select("id").eq("slug", personSlug).limit(1)))[0]?.id;
      if (!personUuid) return [];
      return (await rows(db.from("project_experience").select(PROJECT_COLS).eq("person_id", personUuid).order("sort_order"))).map((r) => mapProject(r, personSlug));
    },

    async getCareerInterests(personSlug) {
      const db = await getDb();
      const personUuid = (await rows(db.from("people").select("id").eq("slug", personSlug).limit(1)))[0]?.id;
      if (!personUuid) return null;
      // Owner call: RLS returns every row of the owner (private included). For anyone else it returns only shared rows.
      return interestsOf(db, personSlug, String(personUuid));
    },

    async getSharedInterests(personSlug) {
      const db = await getDb();
      const personUuid = (await rows(db.from("people").select("id").eq("slug", personSlug).limit(1)))[0]?.id;
      if (!personUuid) return [];
      const found = await rows(db.from("career_interests").select("interest, selected, shared_with_staffing").eq("person_id", personUuid).eq("selected", true).eq("shared_with_staffing", true));
      return found.map((r) => str(r.interest));
    },

    async updateSummary(personSlug, summary) {
      const db = await getDb();
      const updated = await ownRow(db, personSlug, (id) => db.from("people").update({ summary }).eq("id", id).select("id"));
      if (updated.length === 0) throw new ForbiddenError("You can only change your own profile.");
    },

    async addSkill(personSlug, input: { label: string; level: EvidenceLevel }) {
      const db = await getDb();
      const personUuid = await resolveSlug(db, "people", personSlug, "person");
      const catalogue = await capabilityList(db);
      const cap = resolveCapability(input.label, catalogue);
      const existing = (await rows(db.from("skill_evidence").select(EVIDENCE_COLS).eq("person_id", personUuid))).map((e) => mapEvidence(e, personSlug));
      const rule = canOwnerAddEvidence(existing, { capabilityId: cap ? cap.id : `custom:${input.label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-")}`, level: input.level, label: input.label });
      if (!rule.allowed) throw new DomainRuleError(rule.code, rule.reason);
      // Only the columns an owner may write. `verification` and its stamp take the database defaults (self_reported): they are not writable.
      const capId = cap ? await resolveSlug(db, "capabilities", cap.id, "capability") : null;
      const created = await row(db.from("skill_evidence").insert({
        person_id: personUuid, capability_id: capId, label: input.label, source: input.level, detail: "Added by the person · awaiting confirmation",
      }).select(EVIDENCE_COLS).single());
      if (!created) throw new NotFoundError("The skill could not be added.");
      return mapEvidence(created, personSlug);
    },

    async removeSkill(personSlug, evidenceId) {
      const db = await getDb();
      if (!isUuid(evidenceId)) return false;
      const personUuid = await resolveSlug(db, "people", personSlug, "person");
      const found = await row(db.from("skill_evidence").select("id, label, verification").eq("id", evidenceId).eq("person_id", personUuid).maybeSingle());
      if (!found) return false;
      const rule = canOwnerRemoveEvidence({ verification: str(found.verification) as SkillEvidence["verification"], label: str(found.label) });
      if (!rule.allowed) throw new DomainRuleError(rule.code, rule.reason);
      // RLS filters verified rows out of a DELETE (0 rows, no error): that, too, means the evidence is locked.
      const deleted = await rows(db.from("skill_evidence").delete().eq("id", evidenceId).eq("person_id", personUuid).select("id"));
      if (deleted.length === 0) throw new DomainRuleError("evidence_locked", "Verified evidence cannot be removed. Ask a reviewer to correct it.");
      return true;
    },

    async addProject(personSlug, input): Promise<ProjectExperience> {
      const db = await getDb();
      const personUuid = await resolveSlug(db, "people", personSlug, "person");
      const first = (await rows(db.from("project_experience").select("sort_order").eq("person_id", personUuid).order("sort_order").limit(1)))[0];
      const sortOrder = first ? Number(first.sort_order) - 1 : 0; // newest first, like the in-memory adapter
      const created = await row(db.from("project_experience").insert({
        person_id: personUuid, sort_order: sortOrder, period_label: input.period, client: "Sparq", role: input.role, title: input.title, summary: input.what,
      }).select(PROJECT_COLS).single());
      if (!created) throw new NotFoundError("The experience could not be added.");
      return mapProject(created, personSlug);
    },

    async toggleInterest(personSlug, interest) {
      const db = await getDb();
      const personUuid = await resolveSlug(db, "people", personSlug, "person");
      const current = await row(db.from("career_interests").select("interest, selected").eq("person_id", personUuid).eq("interest", interest).maybeSingle());
      if (!current) await rows(db.from("career_interests").insert({ person_id: personUuid, interest, selected: true }));
      else {
        // The database trigger withdraws any disclosure when an interest is deselected (and never re-shares on reselect).
        const updated = await rows(db.from("career_interests").update({ selected: current.selected !== true }).eq("person_id", personUuid).eq("interest", interest).select("interest"));
        if (updated.length === 0) throw new ForbiddenError("You can only change your own interests.");
      }
      return interestsOf(db, personSlug, personUuid);
    },

    async setInterestShared(personSlug, interest, shared) {
      const db = await getDb();
      const personUuid = await resolveSlug(db, "people", personSlug, "person");
      const current = await row(db.from("career_interests").select("interest, selected").eq("person_id", personUuid).eq("interest", interest).maybeSingle());
      if (!current || current.selected !== true) throw new DomainRuleError("interest_not_selected", "Choose this interest first, then decide who can see it.");
      await rows(db.from("career_interests").update({ shared_with_staffing: shared }).eq("person_id", personUuid).eq("interest", interest).select("interest"));
      return interestsOf(db, personSlug, personUuid);
    },

    async setWorkPreferencesShared(personSlug, shared) {
      const db = await getDb();
      const updated = await ownRow(db, personSlug, (id) => db.from("person_preferences").update({ shared_with_staffing: shared }).eq("person_id", id).select("person_id"));
      if (updated.length === 0) throw new InvalidRequestError("Add your work preferences first, then decide who can see them.");
    },
  };
}
