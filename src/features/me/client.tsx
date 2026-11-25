"use client";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { clsx } from "clsx";
import { Modal, Toast, DialogClose } from "@/design-system/overlays";
import { pillClass } from "@/design-system/primitives";
import { setInterestVisibility, toggleInterest } from "@/features/passport/actions";
import { expressInterestAction, withdrawInterestAction } from "./actions";

/** "I'm interested" → confirmation dialog stating who can see it → shared; "Withdraw" removes it immediately. */
export function ExpressInterestButton({ roleId, roleTitle, client, shared, availabilityText }: { roleId: string; roleTitle: string; client: string; shared: boolean; availabilityText: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const clear = useCallback(() => setToast(null), []);

  const share = () => start(async () => {
    setError(null);
    const res = await expressInterestAction({ roleRequirementId: roleId, note });
    if (res.ok) { setOpen(false); setToast(`Interest shared for ${client}`); router.refresh(); } else setError(res.error);
  });
  const withdraw = () => start(async () => {
    setError(null);
    const res = await withdrawInterestAction({ roleRequirementId: roleId });
    if (res.ok) { setToast("Interest withdrawn"); router.refresh(); } else setError(res.error);
  });

  return (
    <>
      {shared ? (
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-medium text-ok-text">✓ Interest shared</span>
          <button type="button" onClick={withdraw} disabled={pending} className={pillClass("default", "sm")}>Withdraw</button>
        </div>
      ) : (
        <button type="button" onClick={() => { setError(null); setOpen(true); }} className={pillClass("coral", "md")}>I’m interested</button>
      )}
      {error && !open && <p role="alert" className="text-[13px] text-warn-text">{error}</p>}
      <Modal open={open} onOpenChange={setOpen} title={`Share your interest in ${roleTitle}`} className="max-w-[560px]">
        <div className="flex flex-col gap-5 p-8">
          <h2 className="text-[28px] font-light tracking-[-0.025em]">Share your interest in <span className="font-medium">{roleTitle}</span></h2>
          <p className="text-mute">{client}</p>
          <label className="flex flex-col gap-2 text-sm font-medium">Add a note (optional)
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={4} className="rounded-lg border-0 bg-white p-3.5 text-[15px] font-normal shadow-[inset_0_0_0_1px_var(--color-line)]" placeholder="What would you bring to this role?" />
          </label>
          <div className="flex items-center justify-between rounded-lg bg-white px-4 py-3.5 text-sm shadow-[inset_0_0_0_1px_var(--color-line)]"><span className="text-mute">Your availability</span><span>{availabilityText}</span></div>
          <p className="text-[13px] leading-[1.5] text-mute">Only staffing leads and the opportunity’s delivery lead will see this. It isn’t a commitment, nothing is assigned because of it, and you can withdraw anytime.</p>
          {error && <p role="alert" className="text-sm text-warn-text">{error}</p>}
          <div className="flex justify-end gap-2">
            <DialogClose className={pillClass("default", "lg")}>Cancel</DialogClose>
            <button type="button" onClick={share} disabled={pending} className={pillClass("coral", "lg")}>{pending ? "Sharing…" : "Share interest"}</button>
          </div>
        </div>
      </Modal>
      <Toast message={toast} onDone={clear} />
    </>
  );
}

/**
 * "What I’m looking for": the owner's PRIVATE career interests. Reuses the passport actions, so the privacy rules are exactly the
 * same ones: private by default, sharing with staffing is a separate, voluntary and reversible choice.
 */
export function LookingFor({ all, shared }: { all: Record<string, boolean>; shared: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) => start(async () => { setError(null); const r = await fn(); if (r.ok) router.refresh(); else setError(r.error); });
  const labels = Object.keys(all);
  if (labels.length === 0) return <p className="text-sm text-mute">No areas yet. Add what you want to grow into on your passport.</p>;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {labels.map((n) => <button key={n} type="button" aria-pressed={all[n]} disabled={pending} onClick={() => run(() => toggleInterest({ interest: n }))} className={pillClass(all[n] ? "ink" : "default", "sm")}>{n}</button>)}
      </div>
      {labels.some((n) => all[n]) && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] text-mute">Private unless you share it with staffing. You can take it back at any time.</span>
          {labels.filter((n) => all[n]).map((n) => {
            const on = shared.includes(n);
            return (
              <div key={n} className="flex items-center justify-between gap-3 text-sm">
                <span>{n}</span>
                <button type="button" aria-pressed={on} aria-label={`${n}: ${on ? "shared with staffing" : "private"}`} disabled={pending} onClick={() => run(() => setInterestVisibility({ interest: n, shared: !on }))} className={clsx(pillClass(on ? "soft" : "default", "sm"))}>{on ? "Shared with staffing" : "Only me"}</button>
              </div>
            );
          })}
        </div>
      )}
      {error && <p role="alert" className="text-[13px] text-warn-text">{error}</p>}
    </div>
  );
}
