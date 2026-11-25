"use server";
/**
 * My Space mutations: expressing interest in a published role. This is NOT a career interest (those stay private on the passport):
 * it is a person raising a hand for one role, visible only to staffing leads and the opportunity's delivery lead while it is shared.
 * The person id comes from the session, never from the client; input is strict; results are typed and nothing is thrown to the client.
 */
import { revalidatePath } from "next/cache";
import { getRepositories } from "@/data/repositories";
import { DomainRuleError, ForbiddenError, UnauthenticatedError } from "@/domain/errors";
import { assertAllowed } from "@/domain/policy";
import { ExpressInterestInput, WithdrawInterestInput } from "@/domain/schemas";
import { requireSession } from "@/lib/session";

type Result = { ok: true } | { ok: false; error: string };
const SIGNED_OUT = "Your session has ended. Reload the page to continue.";
const FORBIDDEN = "You can only share your own interest.";

async function asOwner(run: (personId: string) => Promise<void>): Promise<Result> {
  try {
    const user = await requireSession();
    if (!user.personId) return { ok: false, error: FORBIDDEN };
    assertAllowed(user, "interest:express", { personId: user.personId });
    await run(user.personId);
    revalidatePath("/me");
    revalidatePath("/opportunities");
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthenticatedError) return { ok: false, error: SIGNED_OUT };
    if (e instanceof ForbiddenError) return { ok: false, error: FORBIDDEN };
    if (e instanceof DomainRuleError) return { ok: false, error: e.message };
    console.error("[me action] unexpected failure", e);
    return { ok: false, error: "Couldn’t save that. Try again." };
  }
}

/** Share interest in one role of a PUBLISHED (open) opportunity. Re-sharing after a withdrawal is allowed. */
export async function expressInterestAction(input: unknown): Promise<Result> {
  const parsed = ExpressInterestInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Choose a role and keep the note under 500 characters." };
  return asOwner(async (personId) => {
    const repos = getRepositories();
    // Only roles the engineer can actually see (published = open for interest) can be raised a hand for.
    const published = (await repos.opportunities.list()).filter((o) => o.status === "Open");
    if (!published.some((o) => o.roles.some((r) => r.id === parsed.data.roleRequirementId))) throw new DomainRuleError("interest_closed", "This role is not open for expressions of interest.");
    await repos.interests.express(personId, parsed.data.roleRequirementId, parsed.data.note);
  });
}

export async function withdrawInterestAction(input: unknown): Promise<Result> {
  const parsed = WithdrawInterestInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid role" };
  return asOwner((personId) => getRepositories().interests.withdraw(personId, parsed.data.roleRequirementId));
}
