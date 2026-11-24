/**
 * In-memory adapter over the FICTIONAL fixtures.
 *
 * - State lives in the Node.js server process (kept on globalThis so dev hot-reload does not wipe it).
 * - It resets when the server restarts. This is intentional for phase 1 and is NOT persistence.
 * - Phase 2 replaces this file with a Supabase adapter implementing the same interfaces.
 */
import { capabilities } from "@/data/fixtures/capabilities";
import { DEMO_TODAY, notifications, opportunities, users } from "@/data/fixtures/organization";
import { availability, careerInterests, evidence, people, projects } from "@/data/fixtures/people";
import type { Repositories } from "./types";
import { DomainRuleError } from "@/domain/errors";
import { canOwnerAddEvidence, canOwnerRemoveEvidence } from "@/domain/rules";
import type { CareerInterests, Capability, ProjectExperience, SkillEvidence } from "@/domain/schemas";

type Store = {
  people: typeof people;
  evidence: SkillEvidence[];
  projects: ProjectExperience[];
  availability: typeof availability;
  interests: CareerInterests[];
  shortlists: Map<string, string[]>;
  seq: number;
};

function freshStore(): Store {
  return {
    people: structuredClone(people),
    evidence: structuredClone(evidence),
    projects: structuredClone(projects),
    availability: structuredClone(availability),
    interests: structuredClone(careerInterests),
    shortlists: new Map(),
    seq: 1,
  };
}

const g = globalThis as unknown as { __sparqMemoryStore?: Store };
function store(): Store {
  g.__sparqMemoryStore ??= freshStore();
  return g.__sparqMemoryStore;
}

/** Test helper: reset the in-memory state to the original fictional dataset. */
export function resetMemoryStore(): void {
  g.__sparqMemoryStore = freshStore();
}

function resolveCapability(label: string, catalogue: Capability[]): string {
  const l = label.toLowerCase().trim();
  const hit = catalogue.find((c) => c.name.toLowerCase() === l || c.aliases.some((a) => a.trim() === l));
  return hit ? hit.id : `custom:${l.replace(/[^a-z0-9]+/g, "-")}`;
}

export function createMemoryRepositories(): Repositories {
  const aggregate = (id: string) => {
    const s = store();
    const person = s.people.find((p) => p.id === id);
    const av = s.availability.find((a) => a.personId === id);
    if (!person || !av) return null;
    return { person, evidence: s.evidence.filter((e) => e.personId === id), availability: av };
  };

  return {
    clock: { today: () => DEMO_TODAY },

    talent: {
      async listCapabilities() { return capabilities; },
      async listPeople() { return store().people.map((p) => aggregate(p.id)).filter((x) => x !== null); },
      async getPerson(id) { return aggregate(id); },
      async listProjects(personId) { return store().projects.filter((p) => p.personId === personId); },
      async getCareerInterests(personId) { const r = store().interests.find((i) => i.personId === personId); return r ? structuredClone(r) : null; },
      async getSharedInterests(personId) {
        const r = store().interests.find((i) => i.personId === personId);
        return r ? r.shared.filter((label) => r.interests[label]) : [];
      },
      async updateSummary(personId, summary) {
        const p = store().people.find((x) => x.id === personId);
        if (!p) throw new Error("Person not found");
        p.summary = summary;
      },
      async addSkill(personId, input) {
        const s = store();
        const capabilityId = resolveCapability(input.label, capabilities);
        const rule = canOwnerAddEvidence(s.evidence.filter((e) => e.personId === personId), { capabilityId, level: input.level, label: input.label });
        if (!rule.allowed) throw new DomainRuleError(rule.code, rule.reason);
        // Whatever the caller wants, a row added through this path is self-reported and carries no verification stamp.
        const row: SkillEvidence = { id: `${personId}-ev-new-${s.seq++}`, personId, capabilityId, label: input.label, level: input.level, detail: "Added by the person · awaiting confirmation", verification: "self_reported" };
        s.evidence.push(row);
        return row;
      },
      async removeSkill(personId, evidenceId) {
        const s = store();
        const row = s.evidence.find((e) => e.personId === personId && e.id === evidenceId);
        if (!row) return false;
        const rule = canOwnerRemoveEvidence(row);
        if (!rule.allowed) throw new DomainRuleError(rule.code, rule.reason);
        s.evidence = s.evidence.filter((e) => e !== row);
        return true;
      },
      async addProject(personId, input) {
        const s = store();
        const row: ProjectExperience = { id: `${personId}-pj-new-${s.seq++}`, personId, period: input.period, client: "Sparq", role: input.role, title: input.title, summary: input.what, tags: [], highlights: [input.what], verification: "self_reported" };
        s.projects.unshift(row);
        return row;
      },
      async toggleInterest(personId, interest) {
        const s = store();
        let row = s.interests.find((i) => i.personId === personId);
        if (!row) { row = { personId, interests: {}, shared: [] }; s.interests.push(row); }
        row.interests[interest] = !row.interests[interest];
        // Deselecting an interest also withdraws any disclosure of it: nothing stays shared that the person no longer holds.
        if (!row.interests[interest]) row.shared = row.shared.filter((l) => l !== interest);
        return structuredClone(row);
      },
      async setInterestShared(personId, interest, shared) {
        const s = store();
        const row = s.interests.find((i) => i.personId === personId);
        if (!row || !row.interests[interest]) throw new DomainRuleError("interest_not_selected", "Choose this interest first, then decide who can see it.");
        row.shared = shared ? [...new Set([...row.shared, interest])] : row.shared.filter((l) => l !== interest);
        return structuredClone(row);
      },
      async setWorkPreferencesShared(personId, shared) {
        const p = store().people.find((x) => x.id === personId);
        if (!p) throw new Error("Person not found");
        p.workPreferencesShared = shared;
      },
    },

    opportunities: {
      async list() { return opportunities; },
      async get(id) { return opportunities.find((o) => o.id === id) ?? null; },
    },

    shortlists: {
      async get(owner) { return store().shortlists.get(owner) ?? []; },
      async toggle(owner, personId) {
        const s = store();
        const cur = s.shortlists.get(owner) ?? [];
        const next = cur.includes(personId) ? cur.filter((x) => x !== personId) : [...cur, personId];
        s.shortlists.set(owner, next);
        return next;
      },
    },

    directory: {
      async getUserByRole(role) {
        const u = users.find((x) => x.role === role);
        if (!u) throw new Error(`No demo user for role ${role}`);
        return u;
      },
      async listNotifications(audience) { return notifications.filter((n) => n.audience === audience); },
    },
  };
}
