import "server-only";
import { scopedTalent } from "@/data/repositories/scoped";
import type { Repositories } from "@/data/repositories";
import { ForbiddenError, InvalidRequestError, NotFoundError } from "@/domain/errors";
import { assertAllowed, canUseAssistantContext } from "@/domain/policy";
import type { AssistantRequest } from "@/domain/schemas";
import { ASSISTANT_CONTENT } from "./content";
import type { AssistantActor, ResolvedAssistantRequest } from "./contract";

/**
 * Turns the UNTRUSTED request body into a request the gateway can trust. Everything the client names is checked here:
 *  - context: the user's role decides which contexts exist for them (a context never widens access);
 *  - promptId: must be one of the suggestions of that very context;
 *  - subject: derived from the session for "my passport", authorized and looked up for a staff "passport" context,
 *    and rejected anywhere it does not apply. Errors never echo protected data.
 */
export async function resolveAssistantRequest(repos: Repositories, actor: AssistantActor, raw: AssistantRequest): Promise<ResolvedAssistantRequest> {
  assertAllowed(actor, "assistant:ask");
  if (!canUseAssistantContext(actor, raw.context)) throw new ForbiddenError("That assistant isn’t available in your workspace.");

  const content = ASSISTANT_CONTENT[raw.context];
  let promptId: string | undefined;
  let question = raw.question ?? "";
  if (raw.promptId) {
    const prompt = content.prompts.find((p) => p.id === raw.promptId);
    if (!prompt) throw new InvalidRequestError("Unknown suggestion for this page.");
    promptId = prompt.id;
    question = prompt.q;
  }

  let subjectPersonId: string | undefined;
  if (raw.context === "mypassport") {
    // "My passport" is always the signed-in person's own. A client that names someone else is manipulating the request.
    if (!actor.personId) throw new ForbiddenError("You don’t have a passport.");
    if (raw.subjectPersonId && raw.subjectPersonId !== actor.personId) throw new ForbiddenError("You can only ask about your own passport.");
    subjectPersonId = actor.personId;
  } else if (raw.context === "passport") {
    if (raw.subjectPersonId) {
      assertAllowed(actor, "passport:read", { personId: raw.subjectPersonId });
      if (!(await scopedTalent(repos, actor).getPerson(raw.subjectPersonId))) throw new NotFoundError("That profile doesn’t exist.");
      subjectPersonId = raw.subjectPersonId;
    }
  } else if (raw.subjectPersonId) {
    throw new InvalidRequestError("A person can’t be named in this context.");
  }

  return { context: raw.context, promptId, question, subjectPersonId };
}
