/**
 * Which assistant contexts may carry extra PAGE CONTEXT. Neutral module (no "use client", no "server-only") so the client panel
 * only attaches what the server will accept, and access.ts enforces exactly the same lists. The server never trusts the client:
 * access.ts re-authorizes every value regardless of what the panel sends.
 */
import type { AssistantContext } from "@/domain/schemas";

/** Contexts where a page may name the opportunity it is about. */
export const OPPORTUNITY_CONTEXTS: readonly AssistantContext[] = ["opps", "role", "team", "planning", "compare"];
/** Contexts where a page may pass the seats on screen. */
export const SEAT_CONTEXTS: readonly AssistantContext[] = ["role", "team", "compare", "planning"];
