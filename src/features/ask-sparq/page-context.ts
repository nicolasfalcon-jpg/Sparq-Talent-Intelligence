"use client";
/**
 * Page context for Ask Sparq. A page (Fill a Role, Build a Team, Compare, Planning…) may publish what is on screen so the
 * assistant's "live from this page" prompts work on the user's current selection:
 *
 *   usePublishAssistantContext({ opportunityId: "cobalt", seats: [{ capabilities: ["Swift"], personId: "javier" }] });
 *
 * This is transient UI state, not business data, and it is UNTRUSTED: the server re-authorizes the opportunity and every person
 * in `seats` (features/ask-sparq/access.ts) and rejects them in contexts where they do not apply (context-rules.ts).
 * Publish only slugs and capability labels, never free text.
 */
import { useEffect, useSyncExternalStore } from "react";
import type { AssistantSeatContext } from "@/domain/schemas";

export type AssistantPageContext = { opportunityId?: string; seats?: AssistantSeatContext[] };

let current: AssistantPageContext = {};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function setAssistantPageContext(next: AssistantPageContext | null): void {
  current = next ?? {};
  emit();
}

export function useAssistantPageContext(): AssistantPageContext {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => current, () => current);
}

/** Publish the page's context while it is mounted; cleared on unmount. Re-publishes only when the content changes. */
export function usePublishAssistantContext(ctx: AssistantPageContext | null): void {
  const key = JSON.stringify(ctx);
  useEffect(() => {
    setAssistantPageContext(ctx);
    return () => setAssistantPageContext(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the serialized `ctx`
  }, [key]);
}
