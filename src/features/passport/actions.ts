"use server";
/**
 * Personal passport mutations. Only the profile owner (engineer persona) may call these;
 * the person id is taken from the session, never from the client.
 */
import { revalidatePath } from "next/cache";
import { getRepositories } from "@/data/repositories";
import { AddExperienceInput, AddSkillInput, ToggleInterestInput, UpdateSummaryInput } from "@/domain/schemas";
import { requireRole } from "@/lib/session";

type Result = { ok: true } | { ok: false; error: string };

async function owner(): Promise<string> {
  const user = await requireRole("engineer");
  if (!user.personId) throw new Error("No profile linked to this user");
  return user.personId;
}

function done(personId: string): Result {
  revalidatePath("/me/passport");
  revalidatePath(`/people/${personId}`);
  revalidatePath("/people");
  return { ok: true };
}

export async function updateSummary(input: { summary: string }): Promise<Result> {
  const parsed = UpdateSummaryInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid summary" };
  const id = await owner();
  await getRepositories().talent.updateSummary(id, parsed.data.summary);
  return done(id);
}

export async function addSkill(input: { label: string; level: string }): Promise<Result> {
  const parsed = AddSkillInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Name the skill (2–60 characters) and choose how it is documented." };
  const id = await owner();
  await getRepositories().talent.addSkill(id, parsed.data);
  return done(id);
}

export async function removeSkill(input: { evidenceId: string }): Promise<Result> {
  if (!input.evidenceId) return { ok: false, error: "Invalid skill" };
  const id = await owner();
  await getRepositories().talent.removeSkill(id, input.evidenceId);
  return done(id);
}

export async function addExperience(input: { title: string; role: string; what: string }): Promise<Result> {
  const parsed = AddExperienceInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the project fields" };
  const id = await owner();
  const repos = getRepositories();
  const today = repos.clock.today();
  const month = new Date(today + "T00:00:00Z").toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  await repos.talent.addProject(id, { ...parsed.data, period: `${month} ${today.slice(0, 4)}` });
  return done(id);
}

export async function toggleInterest(input: { interest: string }): Promise<Result> {
  const parsed = ToggleInterestInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid interest" };
  const id = await owner();
  await getRepositories().talent.toggleInterest(id, parsed.data.interest);
  return done(id);
}
