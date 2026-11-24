import { NextResponse } from "next/server";
import { getRepositories } from "@/data/repositories";
import { AssistantRequest } from "@/domain/schemas";
import { RuleBasedAssistant } from "@/features/ask-sparq/gateway";

/**
 * POST /api/assistant — Ask Sparq.
 * Validates input with Zod, then delegates to the configured gateway.
 * Phase 1 gateway is rule-based (no AI provider is called). See gateway.ts.
 */
export async function POST(request: Request) {
  const json: unknown = await request.json().catch(() => null);
  const parsed = AssistantRequest.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }
  const gateway = new RuleBasedAssistant(getRepositories());
  const answer = await gateway.answer(parsed.data);
  return NextResponse.json(answer);
}
