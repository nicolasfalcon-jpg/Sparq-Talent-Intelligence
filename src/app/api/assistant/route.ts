import { NextResponse } from "next/server";
import { ForbiddenError, InvalidRequestError, NotFoundError } from "@/domain/errors";
import { AssistantRequest } from "@/domain/schemas";
import { answerAssistantRequest, AssistantQuotaError } from "@/features/ask-sparq/service";
import { getSession } from "@/lib/session";

/**
 * POST /api/assistant — Ask Sparq.
 *
 * 1. A valid application session is REQUIRED (401 otherwise). Today the session is the demo persona (not authentication).
 * 2. The body is validated with Zod (strict) and is UNTRUSTED: context, suggestion and subject are authorized server-side
 *    (features/ask-sparq/access.ts), never taken at face value.
 * 3. The resolved user is passed into the gateway, which reads data only through the user-scoped layer. When a model API key is configured
 *    (server-side only) the gateway is Claude (read-only tools, per-user daily limit → 429, deterministic fallback); otherwise it is rule-based.
 * Errors are typed JSON `{ error: { code, message } }` and never include protected information.
 */
/** A model answer can take several seconds (bounded to 25 s inside the gateway). */
export const maxDuration = 30;

const json = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const actor = await getSession();
  if (!actor) return json(401, "unauthenticated", "Your session has ended. Reload the page to continue.");

  const body: unknown = await request.json().catch(() => null);
  const parsed = AssistantRequest.safeParse(body);
  if (!parsed.success) return json(400, "invalid_request", "That request isn’t valid.");

  try {
    const answer = await answerAssistantRequest(actor, parsed.data);
    return NextResponse.json(answer, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof AssistantQuotaError) return json(429, "quota_exceeded", e.message);
    if (e instanceof ForbiddenError) return json(403, "forbidden", e.message);
    if (e instanceof NotFoundError) return json(404, "not_found", e.message);
    if (e instanceof InvalidRequestError) return json(400, "invalid_request", e.message);
    console.error("[assistant] unexpected failure", e);
    return json(500, "internal", "Ask Sparq is unavailable right now.");
  }
}
