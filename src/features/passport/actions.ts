"use server";
/**
 * Personal passport mutations. Only the profile owner (engineer persona) may call these;
 * the person id is taken from the session, never from the client.
 *
 * Contract (same as the shortlist action): every action validates its input with Zod, then checks the role,
 * and always RETURNS a typed result. Unauthorised callers and unexpected failures get `{ ok: false, error }`;
 * nothing is thrown to the client and nothing is mutated.
 */
import { revalidatePath } from "next/cache";
import { getRepositories } from "@/data/repositories";
import { AddExperienceInput, AddSkillInput, ToggleInterestInput, UpdateSummaryInput } from "@/domain/schemas";
import { ForbiddenError, requireRole } from "@/lib/session";

type Result = { ok: true } | { ok: false; error: string };

const FORBIDDEN = "Only the owner of this passport can change it.";
const FAILED = "Couldn’t save your changes. Try again.";

/** Runs `mutate` for the signed-in owner's own person id, revalidates the affected pages and returns a typed result. */
async function asOwner(mutate: (personId: string) => Promise<void>): Promise<Result> {
  try {
    const user = await requireRole("engineer");
    if (!user.personId) return { ok: false, error: FORBIDDEN };
    await mutate(user.personId);
    revalidatePath("/me/passport");
    revalidatePath(`/people/${user.personId}`);
    revalidatePath("/people");
    return { ok: true };
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: FORBIDDEN };
    console.error("[passport action] unexpected failure", e);
    return { ok: false, error: FAILED };
  }
}

export async function updateSummary(input: { summary: string }): Promise<Result> {
  const parsed = UpdateSummaryInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid summary" };
  return asOwner((id) => getRepositories().talent.updateSummary(id, parsed.data.summary));
}

export async function addSkill(input: { label: string; level: string }): Promise<Result> {
  const parsed = AddSkillInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Name the skill (2–60 characters) and choose how it is documented." };
  return asOwner(async (id) => { await getRepositories().talent.addSkill(id, parsed.data); });
}

export async function removeSkill(input: { evidenceId: string }): Promise<Result> {
  if (!input.evidenceId) return { ok: false, error: "Invalid skill" };
  return asOwner((id) => getRepositories().talent.removeSkill(id, input.evidenceId));
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
