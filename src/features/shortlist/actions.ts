"use server";
import { revalidatePath } from "next/cache";
import { getRepositories } from "@/data/repositories";
import { scopedTalent } from "@/data/repositories/scoped";
import { ForbiddenError, UnauthenticatedError } from "@/domain/errors";
import { assertAllowed } from "@/domain/policy";
import { ShortlistToggleInput } from "@/domain/schemas";
import { requireSession } from "@/lib/session";

/** Toggle a person on the current staffing lead's shortlist. Validated, authorized by policy; always returns a typed result. */
export async function toggleShortlist(input: { personId: string }): Promise<{ ok: true; shortlist: string[] } | { ok: false; error: string }> {
  const parsed = ShortlistToggleInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid person" };
  try {
    const user = await requireSession();
    assertAllowed(user, "shortlist:edit");
    const repos = getRepositories();
    if (!(await scopedTalent(repos, user).getPerson(parsed.data.personId))) return { ok: false, error: "Person not found" };
    const shortlist = await repos.shortlists.toggle(user.id, parsed.data.personId);
    revalidatePath("/people", "layout");
    return { ok: true, shortlist };
  } catch (e) {
    if (e instanceof UnauthenticatedError) return { ok: false, error: "Your session has ended. Reload the page to continue." };
    if (e instanceof ForbiddenError) return { ok: false, error: "Only staffing leads can change a shortlist." };
    console.error("[shortlist action] unexpected failure", e);
    return { ok: false, error: "Couldn’t update the shortlist. Try again." };
  }
}
