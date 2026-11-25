"use server";
/**
 * Proposal mutations. Contract (same as the shortlist and passport actions): Zod at the boundary, `requireSession` +
 * `assertAllowed`, then the repository (the database's SQL functions in Supabase mode). Always RETURNS a typed result; nothing is
 * thrown to the client. The acting user always comes from the session, never from the client.
 *
 * PROPOSED ≠ ASSIGNED: `reviewProposalAction` never creates an assignment. `confirmSeatAction` is a separate explicit act.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRepositories } from "@/data/repositories";
import { DomainRuleError, ForbiddenError, NotFoundError, UnauthenticatedError } from "@/domain/errors";
import { assertAllowed, type Permission } from "@/domain/policy";
import { ConfirmSeatInput, ReviewProposalInput, SaveProposalInput, type Assignment, type TeamProposal } from "@/domain/schemas";
import { requireSession } from "@/lib/session";

type ProposalResult = { ok: true; proposal: TeamProposal } | { ok: false; error: string };
type AssignmentResult = { ok: true; assignment: Assignment } | { ok: false; error: string };

const SIGNED_OUT = "Your session has ended. Reload the page to continue.";
const FAILED = "Couldn’t complete that. Try again.";

const IdInput = z.object({ id: z.string().min(1) }).strict();
const SubmitInput = z.object({ id: z.string().min(1), note: z.string().trim().max(1000).optional() }).strict();

function failure(e: unknown, forbidden: string): { ok: false; error: string } {
  if (e instanceof UnauthenticatedError) return { ok: false, error: SIGNED_OUT };
  if (e instanceof ForbiddenError) return { ok: false, error: e.message && e.message !== "Not allowed for the current persona" ? e.message : forbidden };
  if (e instanceof NotFoundError) return { ok: false, error: "That proposal or seat no longer exists." };
  if (e instanceof DomainRuleError) return { ok: false, error: e.message };
  console.error("[proposal action] unexpected failure", e);
  return { ok: false, error: FAILED };
}

const refresh = () => { revalidatePath("/opportunities", "layout"); revalidatePath("/planning"); revalidatePath("/"); };

async function run<T>(permission: Permission, forbidden: string, work: (userId: string) => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    const user = await requireSession();
    assertAllowed(user, permission);
    const value = await work(user.id);
    refresh();
    return { ok: true, value };
  } catch (e) {
    return failure(e, forbidden);
  }
}

const asProposal = (r: { ok: true; value: TeamProposal } | { ok: false; error: string }): ProposalResult => (r.ok ? { ok: true, proposal: r.value } : r);

export async function saveProposalAction(input: unknown): Promise<ProposalResult> {
  const parsed = SaveProposalInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid proposal" };
  return asProposal(await run("proposals:write", "Only staffing leads can write proposals.", (uid) => getRepositories().proposals.save(uid, parsed.data)));
}

export async function submitProposalAction(input: unknown): Promise<ProposalResult> {
  const parsed = SubmitInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid proposal" };
  return asProposal(await run("proposals:write", "Only the staffing lead who wrote a proposal can send it.", (uid) => getRepositories().proposals.submit(uid, parsed.data.id, parsed.data.note)));
}

export async function withdrawProposalAction(input: unknown): Promise<ProposalResult> {
  const parsed = IdInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid proposal" };
  return asProposal(await run("proposals:write", "Only the author can withdraw a proposal.", (uid) => getRepositories().proposals.withdraw(uid, parsed.data.id)));
}

export async function reviewProposalAction(input: unknown): Promise<ProposalResult> {
  const parsed = ReviewProposalInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid review" };
  return asProposal(await run("proposals:review", "Only the delivery lead of this opportunity can review its proposals.", (uid) => getRepositories().proposals.review(uid, parsed.data.id, parsed.data.decision, parsed.data.note)));
}

export async function confirmSeatAction(input: unknown): Promise<AssignmentResult> {
  const parsed = ConfirmSeatInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid assignment" };
  const r = await run("assignments:confirm", "Only the delivery lead of this opportunity can confirm assignments.", (uid) => getRepositories().proposals.confirmSeat(uid, parsed.data));
  return r.ok ? { ok: true, assignment: r.value } : r;
}
