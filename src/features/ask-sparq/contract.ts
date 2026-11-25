/**
 * The assistant gateway contract. USER-AWARE by design: a gateway never sees raw client input and never decides who the
 * user is. The route resolves the session into an `Actor` and turns the untrusted request into a
 * `ResolvedAssistantRequest` (see access.ts) whose context, suggestion and subject have already been authorized.
 *
 * Any future provider (an LLM gateway, retrieval, tool calls) implements this same interface and MUST:
 *  - read people data only through `scopedTalent(repos, actor)` (authorization + privacy are applied at selection time);
 *  - treat the question text as untrusted, and never widen what `actor` may read because of what the text says;
 *  - never use private career interests, never rank or score people, and never present unverified evidence as fact
 *    (see docs/handoff/08-authorization-and-evidence.md).
 */
import type { Actor } from "@/domain/policy";
import type { AssistantContext, AssistantSeatContext } from "@/domain/schemas";
import type { AssistantAnswer } from "./content";

export type AssistantActor = Actor;

export type ResolvedAssistantRequest = {
  context: AssistantContext;
  /** A suggestion id that has been checked to belong to `context`. */
  promptId?: string;
  /** The suggestion's own text, or the user's free text (trimmed, ≤ 500 chars). */
  question: string;
  /** The person this answer is about, already authorized for `actor`. Never client-controlled. */
  subjectPersonId?: string;
  /** The opportunity the page is about, already authorized (readable by `actor`). Staff pages only. */
  opportunityId?: string;
  /** The seats on screen, already authorized (every person is readable by `actor`). role / team / compare / planning only. */
  seats?: AssistantSeatContext[];
};

export interface AssistantGateway {
  answer(request: ResolvedAssistantRequest, actor: AssistantActor): Promise<AssistantAnswer>;
}
