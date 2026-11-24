"use server";
/**
 * Personal passport mutations. Only the profile owner (engineer persona) may call these; the person id is taken from
 * the session, never from the client, and the permission is decided by the central policy (`passport:edit`).
 *
 * Contract (same as the shortlist action): every action validates its input with Zod, then authorizes, and always
 * RETURNS a typed result. Unauthenticated or unauthorised callers, rule violations and unexpected failures get
 * `{ ok: false, error }`; nothing is thrown to the client and nothing is mutated.
 *
 * Evidence rules enforced through the domain/repository (never by the client):
 *  - everything the owner adds is SELF-REPORTED; input that tries to carry `verification` is rejected by the schema;
 *  - verified evidence cannot be removed by its owner (a future correction-request workflow needs a reviewer role).
 */
import { revalidatePath } from "next/cache";
import { getRepositories } from "@/data/repositories";
import { DomainRuleError, ForbiddenError, UnauthenticatedError } from "@/domain/errors";
import { assertAllowed } from "@/domain/policy";
import {
  AddExperienceInput, AddSkillInput, RemoveSkillInput, SetInterestVisibilityInput, SetWorkPreferencesVisibilityInput, ToggleInterestInput, UpdateSummaryInput,
} from "@/domain/schemas";
import { requireSession } from "@/lib/session";

type Result = { ok: true } | { ok: false; error: string };

const FORBIDDEN = "Only the owner of this passport can change it.";
const SIGNED_OUT = "Your session has ended. Reload the page to continue.";
const FAILED = "Couldn’t save your changes. Try again.";

/** Runs `mutate` for the signed-in owner's own person id, revalidates the affected pages and returns a typed result. */
async function asOwner(mutate: (personId: string) => Promise<void>): Promise<Result> {
  try {
    const user = await requireSession();
    if (!user.personId) return { ok: false, error: FORBIDDEN };
    assertAllowed(user, "passport:edit", { personId: user.personId });
    await mutate(user.personId);
    revalidatePath("/me/passport");
    revalidatePath(`/people/${user.personId}`);
    revalidatePath("/people");
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthenticatedError) return { ok: false, error: SIGNED_OUT };
    if (e instanceof ForbiddenError) return { ok: false, error: FORBIDDEN };
    if (e instanceof DomainRuleError) return { ok: false, error: e.message };
    console.error("[passport action] unexpected failure", e);
    return { ok: false, error: FAILED };
  }
}

export async function updateSummary(input: { summary: string }): Promise<Result> {
  const parsed = UpdateSummaryInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid summary" };
  return asOwner((id) => getRepositories().talent.updateSummary(id, parsed.data.summary));
}

/** Adds a SELF-REPORTED skill. `level` is the evidence source; verification is not an input. */
export async function addSkill(input: { label: string; level: string }): Promise<Result> {
  const parsed = AddSkillInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Name the skill (2–60 characters) and choose how it is documented." };
  return asOwner(async (id) => { await getRepositories().talent.addSkill(id, parsed.data); });
}

/** Withdraws the owner's own unverified claim. Verified evidence is locked (typed error, nothing changes). */
export async function removeSkill(input: { evidenceId: string }): Promise<Result> {
  const parsed = RemoveSkillInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid skill" };
  return asOwner(async (id) => {
    const removed = await getRepositories().talent.removeSkill(id, parsed.data.evidenceId);
    if (!removed) throw new DomainRuleError("evidence_not_found", "That skill isn’t on your passport.");
  });
}

export async function addExperience(input: { title: string; role: string; what: string }): Promise<Result> {
  const parsed = AddExperienceInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the project fields" };
  return asOwner(async (id) => {
    const repos = getRepositories();
    const today = repos.clock.today();
    const month = new Date(today + "T00:00:00Z").toLocaleString("en-US", { month: "short", timeZone: "UTC" });
    await repos.talent.addProject(id, { ...parsed.data, period: `${month} ${today.slice(0, 4)}` });
  });
}

export async function toggleInterest(input: { interest: string }): Promise<Result> {
  const parsed = ToggleInterestInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid interest" };
  return asOwner(async (id) => { await getRepositories().talent.toggleInterest(id, parsed.data.interest); });
}

/** Private by default. The owner may voluntarily share one selected interest with staffing, or take it back. */
export async function setInterestVisibility(input: { interest: string; shared: boolean }): Promise<Result> {
  const parsed = SetInterestVisibilityInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid interest" };
  return asOwner(async (id) => { await getRepositories().talent.setInterestShared(id, parsed.data.interest, parsed.data.shared); });
}

/** Professional preferences (travel, team size…) are disclosed to staffing only if the owner chooses so. */
export async function setWorkPreferencesVisibility(input: { shared: boolean }): Promise<Result> {
  const parsed = SetWorkPreferencesVisibilityInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid choice" };
  return asOwner((id) => getRepositories().talent.setWorkPreferencesShared(id, parsed.data.shared));
}
