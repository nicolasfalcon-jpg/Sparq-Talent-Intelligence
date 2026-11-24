import "server-only";
import { getRepositories } from "@/data/repositories";
import type { AssistantRequest } from "@/domain/schemas";
import { resolveAssistantRequest } from "./access";
import type { AssistantAnswer } from "./content";
import type { AssistantActor, AssistantGateway } from "./contract";
import { RuleBasedAssistant } from "./gateway";

/**
 * Composition root for the assistant. Phase 2B.1 ships the deterministic gateway only; no AI provider is connected.
 * A future `LlmAssistant implements AssistantGateway` is selected here (SPARQ_ASSISTANT_PROVIDER), behind the same
 * user-aware contract and the same request resolution, so the route and its authorization do not change.
 */
export function getAssistant(): AssistantGateway {
  return new RuleBasedAssistant(getRepositories());
}

/** Authorize and resolve the untrusted request, then answer it for this user. Throws typed errors (Forbidden, NotFound, InvalidRequest). */
export async function answerAssistantRequest(actor: AssistantActor, raw: AssistantRequest): Promise<AssistantAnswer> {
  const resolved = await resolveAssistantRequest(getRepositories(), actor, raw);
  return getAssistant().answer(resolved, actor);
}
