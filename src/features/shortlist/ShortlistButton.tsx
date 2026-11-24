"use client";
import { useOptimistic, useState, useTransition } from "react";
import { pillClass, type PillSize, type PillVariant } from "@/design-system/primitives";
import { toggleShortlist } from "./actions";

/**
 * "Add to shortlist" / "✓ On your shortlist". Optimistic UI, server action, error surfaced inline.
 * `offVariant` differs by placement (People preview: default; Passport hero: coral) as in V4.2.
 */
export function ShortlistButton({ personId, initialOn, offVariant = "default", size = "xl", className }: {
  personId: string; initialOn: boolean; offVariant?: PillVariant; size?: PillSize; className?: string;
}) {
  const [on, setOn] = useState(initialOn);
  const [optimisticOn, setOptimistic] = useOptimistic(on);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = () => start(async () => {
    setError(null);
    setOptimistic(!on);
    const res = await toggleShortlist({ personId });
    if (res.ok) setOn(res.shortlist.includes(personId));
    else setError(res.error);
  });

  return (
    <>
      <button type="button" onClick={toggle} aria-pressed={optimisticOn} aria-busy={pending} className={pillClass(optimisticOn ? "ink" : offVariant, size, className)}>
        {optimisticOn ? "✓ On your shortlist" : "Add to shortlist"}
      </button>
      {error && <span role="alert" className="text-[13px] text-coral-strong">{error}</span>}
    </>
  );
}
