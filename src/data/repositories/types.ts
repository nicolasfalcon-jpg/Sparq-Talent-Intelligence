/**
 * Repository contracts (ports). UI and server actions depend ONLY on these interfaces.
 * Phase 1: `memory` adapter over fictional fixtures. Phase 2: `supabase` adapter (see docs/handoff/06-roadmap.md).
 * All methods are async so swapping to a network-backed adapter needs no caller changes.
 */
import type {
  AppUser, Availability, Capability, CareerInterests, EvidenceLevel, Notification, Opportunity, Person, ProjectExperience, SkillEvidence, UserRole,
} from "@/domain/schemas";

/** A person with everything needed to render cards and previews. */
export type PersonAggregate = { person: Person; evidence: SkillEvidence[]; availability: Availability };

export interface TalentRepository {
  listCapabilities(): Promise<Capability[]>;
  listPeople(): Promise<PersonAggregate[]>;
  getPerson(id: string): Promise<PersonAggregate | null>;
  listProjects(personId: string): Promise<ProjectExperience[]>;
  getCareerInterests(personId: string): Promise<CareerInterests | null>;
  /* Mutations performed by the profile owner (authorisation is enforced in the server action layer). */
  updateSummary(personId: string, summary: string): Promise<void>;
  addSkill(personId: string, input: { label: string; level: EvidenceLevel }): Promise<SkillEvidence>;
  removeSkill(personId: string, evidenceId: string): Promise<void>;
  addProject(personId: string, input: { title: string; role: string; what: string; period: string }): Promise<ProjectExperience>;
  toggleInterest(personId: string, interest: string): Promise<CareerInterests>;
}

export interface OpportunityRepository {
  list(): Promise<Opportunity[]>;
  get(id: string): Promise<Opportunity | null>;
}

export interface ShortlistRepository {
  get(ownerUserId: string): Promise<string[]>;
  toggle(ownerUserId: string, personId: string): Promise<string[]>;
}

export interface DirectoryRepository {
  getUserByRole(role: UserRole): Promise<AppUser>;
  listNotifications(audience: UserRole): Promise<Notification[]>;
}

export interface Clock {
  /** Business "today" as YYYY-MM-DD. Fixed in demo mode so the fictional dataset stays coherent. */
  today(): string;
}

export type Repositories = {
  talent: TalentRepository;
  opportunities: OpportunityRepository;
  shortlists: ShortlistRepository;
  directory: DirectoryRepository;
  clock: Clock;
};
