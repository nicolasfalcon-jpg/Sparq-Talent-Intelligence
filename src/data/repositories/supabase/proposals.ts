/**
 * ProposalRepository over Supabase. Lifecycle changes go ONLY through the SQL functions (submit_proposal, withdraw_proposal,
 * review_proposal, confirm_assignment): they check the caller's role AND relationship, enforce the state machine and capacity,
 * and write the audit log. Drafts are plain table writes under RLS and the column grants of 0008.
 *
 * NOT ATOMIC: `save` replaces seats with several PostgREST calls (there is no transaction across requests). It is made fail-safe by
 * compensation: the old seats are read first; if inserting the new ones fails the old ones are restored (a new proposal is removed),
 * so a failed save leaves the draft as it was. A concurrent save by the same author could interleave; the author is one person on one
 * draft, and the unique (proposal, person) index would reject a bad interleaving. A `save_proposal` SQL function would make it atomic.
 */
import { DomainRuleError, ForbiddenError, NotFoundError } from "@/domain/errors";
import type { Actor } from "@/domain/policy";
import { isEditableState } from "@/domain/proposals";
import type { Assignment, TeamProposal } from "@/domain/schemas";
import type { ProposalRepository } from "../types";
import { row, rows, rpcValue, type Db } from "./db";
import { isUuid, resolveSlug, resolveSlugs } from "./ids";
import { mapAssignment, mapProposal, str } from "./mappers";
import { ASSIGNMENT_COLS } from "./staffing";

type GetDb = () => Promise<Db>;

const SEAT_COLS = "id, role_requirement_id, position, title, capabilities, seniority, allocation, person_id, seat_state, role:role_requirements(slug), person:people(slug), assignment:assignments(id)";
const PROPOSAL_COLS = "id, opportunity_id, title, brief, note_for_reviewer, state, version, created_by, submitted_at, updated_at, " +
  "opportunity:opportunities(slug), creator:app_users!created_by(display_name), " +
  `proposal_seats(${SEAT_COLS}), ` +
  "proposal_reviews(proposal_version, decision, note, reviewer_id, created_at, reviewer:app_users!reviewer_id(display_name))";
const RAW_SEAT_COLS = "role_requirement_id, position, title, capabilities, seniority, allocation, person_id, seat_state";

async function fetchProposal(db: Db, id: string): Promise<TeamProposal | null> {
  if (!isUuid(id)) return null;
  const r = await row(db.from("team_proposals").select(PROPOSAL_COLS).eq("id", id).order("position", { referencedTable: "proposal_seats" }).maybeSingle());
  return r ? mapProposal(r) : null;
}

async function mustFetch(db: Db, id: string): Promise<TeamProposal> {
  const p = await fetchProposal(db, id);
  if (!p) throw new NotFoundError("Proposal not found.");
  return p;
}

const ignore = () => undefined;

export function createProposalRepository(getDb: GetDb): ProposalRepository {
  const requireId = (id: string) => { if (!isUuid(id)) throw new NotFoundError("Proposal not found."); };
  return {
    async list() {
      const db = await getDb();
      return (await rows(db.from("team_proposals").select(PROPOSAL_COLS).order("updated_at", { ascending: false }).order("position", { referencedTable: "proposal_seats" }))).map(mapProposal);
    },

    // The viewer is not needed: row-level security already limits what this JWT can read.
    async get(...[, id]: [Actor, string]) { return fetchProposal(await getDb(), id); },

    async save(_actorUserId, input) {
      const db = await getDb();
      const opportunityId = await resolveSlug(db, "opportunities", input.opportunityId, "opportunity");
      const personSlugs = input.seats.flatMap((s) => (s.personId ? [s.personId] : []));
      const roleSlugs = input.seats.flatMap((s) => (s.roleRequirementId ? [s.roleRequirementId] : []));
      const [people, roles] = await Promise.all([resolveSlugs(db, "people", personSlugs), resolveSlugs(db, "role_requirements", roleSlugs)]);
      for (const p of personSlugs) if (!people.has(p)) throw new DomainRuleError("unknown_person", `Unknown person: ${p}`);
      for (const r of roleSlugs) if (!roles.has(r)) throw new DomainRuleError("unknown_role", `Unknown role: ${r}`);
      if (new Set(personSlugs).size !== personSlugs.length) throw new DomainRuleError("duplicate_person", "A person can occupy only one seat of a proposal.");

      const header = { opportunity_id: opportunityId, title: input.title, brief: input.brief, note_for_reviewer: input.noteForReviewer };
      const seatRows = (proposalId: string) => input.seats.map((s, i) => ({
        proposal_id: proposalId, role_requirement_id: s.roleRequirementId ? roles.get(s.roleRequirementId) : null, position: i, title: s.title, capabilities: s.capabilities,
        seniority: s.seniority, allocation: s.allocation, person_id: s.personId ? people.get(s.personId) : null, seat_state: s.personId ? "proposed" : "open",
      }));

      if (!input.id) {
        const created = await row(db.from("team_proposals").insert(header).select("id").single());
        const id = created ? str(created.id) : "";
        if (!id) throw new ForbiddenError("You cannot create proposals.");
        try { await rows(db.from("proposal_seats").insert(seatRows(id))); }
        catch (e) { await db.from("team_proposals").delete().eq("id", id).then(ignore, ignore); throw e; } // fail safe: no empty draft left behind
        return mustFetch(db, id);
      }

      const proposalId = input.id;
      requireId(proposalId);
      const current = await mustFetch(db, proposalId);
      if (!isEditableState(current.state)) throw new DomainRuleError("proposal_not_editable", `A ${current.state.replace("_", " ")} proposal can no longer be edited.`);
      const before = await rows(db.from("proposal_seats").select(RAW_SEAT_COLS).eq("proposal_id", proposalId));
      const restore = async () => {
        await db.from("proposal_seats").delete().eq("proposal_id", proposalId).then(ignore, ignore);
        if (before.length) await db.from("proposal_seats").insert(before.map((b) => ({ ...b, proposal_id: proposalId }))).then(ignore, ignore);
      };
      // Seats go first: moving a proposal to another opportunity is refused while seats still link to the old one's roles.
      await rows(db.from("proposal_seats").delete().eq("proposal_id", proposalId).select("id"));
      try {
        const updated = await rows(db.from("team_proposals").update(header).eq("id", proposalId).select("id"));
        if (updated.length === 0) throw new ForbiddenError("Only the author can edit this proposal.");
        await rows(db.from("proposal_seats").insert(seatRows(proposalId)));
      } catch (e) { await restore(); throw e; }
      return mustFetch(db, proposalId);
    },

    async submit(_actorUserId, id, note) {
      requireId(id);
      const db = await getDb();
      await rpcValue(db.rpc("submit_proposal", { p_id: id, p_note: note?.trim() ? note.trim() : null }));
      return mustFetch(db, id);
    },

    async withdraw(_actorUserId, id) {
      requireId(id);
      const db = await getDb();
      await rpcValue(db.rpc("withdraw_proposal", { p_id: id }));
      return mustFetch(db, id);
    },

    async review(_actorUserId, id, decision, note) {
      requireId(id);
      const db = await getDb();
      await rpcValue(db.rpc("review_proposal", { p_id: id, p_decision: decision, p_note: note?.trim() ? note.trim() : null }));
      return mustFetch(db, id);
    },

    async confirmSeat(_actorUserId, input): Promise<Assignment> {
      if (!isUuid(input.seatId)) throw new NotFoundError("Seat not found.");
      const db = await getDb();
      const created = await rpcValue(db.rpc("confirm_assignment", {
        p_seat_id: input.seatId, p_starts_on: input.startsOn, p_ends_on: input.endsOn, p_available_from: input.availableFrom, p_allocation: input.allocation,
      }));
      const r = await row(db.from("assignments").select(ASSIGNMENT_COLS).eq("id", String(created)).maybeSingle());
      if (!r) throw new NotFoundError("The assignment was created but cannot be read by you.");
      return mapAssignment(r);
    },
  };
}
