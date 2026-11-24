"use client";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { clsx } from "clsx";
import type { AssistantContext } from "@/domain/schemas";
import { Portrait } from "@/design-system/Portrait";
import { pillClass, Skeleton } from "@/design-system/primitives";
import type { AssistantAnswer } from "./content";

export type AskInput = { context: AssistantContext; promptId?: string; question?: string; subjectPersonId?: string };

async function postAsk(input: AskInput): Promise<AssistantAnswer> {
  const res = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  if (!res.ok) throw new Error("Ask Sparq is unavailable right now.");
  return (await res.json()) as AssistantAnswer;
}

/** TanStack Query mutation for Ask Sparq. Loading / error / success map to the designed states. */
export function useAsk() {
  return useMutation({ mutationFn: postAsk });
}

export const PROVENANCE = {
  computed: { label: "Computed from documented data", cls: "bg-ok-bg text-ok-text" },
  illustrative: { label: "Illustrative example", cls: "bg-surface-muted text-mute" },
  fallback: { label: "Guidance", cls: "bg-surface-muted text-mute" },
} as const;

export function ProvenanceTag({ provenance }: { provenance: AssistantAnswer["provenance"] }) {
  const p = PROVENANCE[provenance];
  return <span className={clsx("self-start rounded-pill px-2.5 py-[3px] text-[11px] font-semibold", p.cls)}>{p.label}</span>;
}

export function AnswerLoading({ text = "Reading documented profiles and staffing data…" }: { text?: string }) {
  return (
    <div aria-live="polite" aria-busy="true" className="flex flex-col gap-2.5 rounded-card bg-white/90 p-5">
      <span className="text-[13px] text-mute">{text}</span>
      <Skeleton width="92%" /><Skeleton width="78%" /><Skeleton width="60%" />
    </div>
  );
}

export function AnswerError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-card bg-white/90 p-5">
      <p className="text-[15px]">{message}</p>
      <button type="button" className={pillClass("soft", "sm", "self-start")} onClick={onRetry}>Try again</button>
    </div>
  );
}

/** Answer card used by the Ask Sparq drawer (V4.2 `v4-nav` response state). */
export function AnswerCard({ a, onReset }: { a: AssistantAnswer; onReset: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-card bg-white/95 p-5">
      <ProvenanceTag provenance={a.provenance} />
      <p className="text-[17px] leading-[1.45] font-light">{a.answer}</p>
      {a.bullets.map((b) => (
        <div key={b} className="flex gap-2.5 text-sm"><span className="flex-none text-coral" aria-hidden="true">●</span><span>{b}</span></div>
      ))}
      {a.refs.map((r) => (
        <Link key={r.personId} href={r.href} className="flex items-center gap-3 rounded-md bg-surface-muted px-2.5 py-2">
          <Portrait who={r.personId} size={36} decorative />
          <span className="flex-1 text-sm"><span className="block font-medium">{r.name}</span><span className="block text-[13px] text-mute">{r.evidence}</span></span>
          {r.when && <span className={clsx("text-xs", r.whenTone === "ok" ? "text-ok-text" : "text-mute")}>{r.when}</span>}
          <span className="text-faint" aria-hidden="true">→</span>
        </Link>
      ))}
      <div className="flex flex-wrap gap-2">
        {a.actions.map((x) => <Link key={x.label} href={x.href} className={pillClass(x.variant === "ink" ? "ink" : "soft", "sm", "h-9 px-4")}>{x.label}</Link>)}
        <button type="button" onClick={onReset} className={pillClass("soft", "sm", "h-9 px-4")}>Ask something else</button>
      </div>
      <span className="text-xs text-mute">Based on documented skills, projects and availability · fictional demo data</span>
    </div>
  );
}
