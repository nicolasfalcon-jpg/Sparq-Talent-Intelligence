"use server";
import { revalidatePath } from "next/cache";
import { getRepositories } from "@/data/repositories";
import { ShortlistToggleInput } from "@/domain/schemas";
import { ForbiddenError, requireRole } from "@/lib/session";

/** Toggle a person on the current staffing lead's shortlist. Server-validated and role-checked; always returns a typed result. */
export async function toggleShortlist(input: { personId: string }): Promise<{ ok: true; shortlist: string[] } | { ok: false; error: string }> {
  const parsed = ShortlistToggleInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid person" };
  try {
    const user = await requireRole("staffing_lead");
    const repos = getRepositories();
    if (!(await repos.talent.getPerson(parsed.data.personId))) return { ok: false, error: "Person not found" };
    const shortlist = await repos.shortlists.toggle(user.id, parsed.data.personId);
    revalidatePath("/people", "layout");
    return { ok: true, shortlist };
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: "Only staffing leads can change a shortlist." };
    console.error("[shortlist action] unexpected failure", e);
    return { ok: false, error: "Couldn’t update the shortlist. Try again." };
  }
}
