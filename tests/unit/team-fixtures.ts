/** Small, hand-built FICTIONAL context for the Build a Team tests (deterministic, independent of the demo fixtures). */
import type { Availability, Capability, SkillEvidence } from "@/domain/schemas";
import type { TeamCandidate, TeamContext, TeamOpportunity } from "@/features/team/model";

export const TODAY = "2026-11-24";
const cap = (id: string, name: string): Capability => ({ id, name, group: "mobile", aliases: [] });
export const catalogue: Capability[] = [cap("swift", "Swift"), cap("kotlin", "Kotlin"), cap("rn", "React Native"), cap("appium", "Appium")];

const ev = (personId: string, capabilityId: string, label: string, level: SkillEvidence["level"], verification: SkillEvidence["verification"] = "verified"): SkillEvidence =>
  ({ id: `${personId}-${capabilityId}`, personId, capabilityId, label, level, detail: `${label} work`, verification });
const av = (personId: string, availableFrom: string, status: Availability["status"], proposedFor: Availability["proposedFor"] = null): Availability =>
  ({ personId, availableFrom, status, currentProject: null, currentProjectEnds: null, deliveryLead: null, proposedFor });

export const candidates: TeamCandidate[] = [
  { personId: "ana", name: "Ana Ruiz", discipline: "Mobile", headline: "Mobile lead", availability: av("ana", "2026-12-01", "confirmed"), evidence: [ev("ana", "swift", "Swift", "professional"), ev("ana", "rn", "React Native", "professional")] },
  { personId: "javier", name: "Javier Morales", discipline: "Mobile", headline: "iOS engineer", availability: av("javier", "2027-02-02", "pending"), evidence: [ev("javier", "swift", "Swift", "professional", "self_reported")] },
  { personId: "camila", name: "Camila Duarte", discipline: "Quality", headline: "QA lead", availability: av("camila", "2026-12-08", "confirmed", { opportunityId: "vela", from: "2027-01-12" }), evidence: [ev("camila", "appium", "Appium", "professional"), ev("camila", "kotlin", "Kotlin", "training", "self_reported")] },
  { personId: "ethan", name: "Ethan Brooks", discipline: "Mobile", headline: "Android engineer", availability: av("ethan", "2026-11-24", "confirmed"), evidence: [ev("ethan", "kotlin", "Kotlin", "professional")] },
];

export const opportunity: TeamOpportunity & { deliveryLeadId: string | null } = {
  id: "kestrel", client: "Kestrel Travel", clientInitials: "KT", industry: "Travel & hospitality", name: "AI trip companion", description: "A trip companion app for iOS and Android.",
  kickoff: "2027-01-12", durationMonths: 6, deliveryLead: "Inés Vidal", deliveryLeadId: "u-ines",
  roles: [
    { id: "kestrel-ios", title: "iOS Engineer", capabilities: ["Swift", "WidgetKit"], proposedPersonId: null },
    { id: "kestrel-android", title: "Senior Android Engineer", capabilities: ["Kotlin"], proposedPersonId: null },
    { id: "kestrel-qa", title: "QA Automation", capabilities: ["Appium"], proposedPersonId: null },
  ],
};

export const base: Omit<TeamContext, "opportunity"> = {
  today: TODAY, catalogue, candidates, shortlist: ["ethan"], opportunityNames: { vela: "Vela Bank", kestrel: "Kestrel Travel" },
  interests: [{ personId: "javier", roleRequirementId: "kestrel-ios", opportunityId: "kestrel" }],
};
export const ctx: TeamContext = { ...base, opportunity };
