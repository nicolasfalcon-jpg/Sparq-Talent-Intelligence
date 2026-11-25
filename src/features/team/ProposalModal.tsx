"use client";
/** "Proposal for human review" (spec §9.7). Names the REAL reviewer. Sending assigns nobody. */
import { Modal } from "@/design-system/overlays";
import { Portrait } from "@/design-system/Portrait";
import { IconButton, pillClass } from "@/design-system/primitives";
import { DialogClose } from "@/design-system/overlays";
import { clsx } from "clsx";
import { fitFor, fitTone, type TeamContext, type TeamSeat } from "./model";

export function ProposalModal({ open, onOpenChange, ctx, seats, notes, note, onNote, reviewer, resubmit, busy, error, saveLabel, onSaveDraft, onSend }: {
  open: boolean; onOpenChange: (o: boolean) => void; ctx: TeamContext; seats: TeamSeat[]; notes: string[]; note: string; onNote: (v: string) => void;
  reviewer: string; resubmit: boolean; busy: boolean; error: string | null; saveLabel: string; onSaveDraft: () => void; onSend: () => void;
}) {
  const placed = seats.filter((s) => s.personId).length;
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Team proposal" className="max-w-[760px]">
      <div className="flex flex-col gap-[22px] bg-surface p-9 max-md:p-6">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-sm text-mute">Proposal for human review</span>
            <h2 className="mt-1 text-4xl leading-[1.1] font-light tracking-[-0.035em]">{ctx.opportunity.client} <span className="font-medium">team</span></h2>
          </div>
          <DialogClose asChild><IconButton label="Close" /></DialogClose>
        </div>
        <ul className="m-0 grid list-none gap-3 p-0" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
          {seats.map((s) => {
            const c = s.personId ? ctx.candidates.find((x) => x.personId === s.personId) : null;
            const fit = c ? fitFor(ctx, c.personId) : null;
            return (
              <li key={s.key} className="flex flex-col items-start gap-2.5 rounded-card bg-surface-muted p-[18px]">
                {c ? <Portrait who={c.personId} size={56} decorative /> : <span className="size-14 rounded-full border-[1.5px] border-dashed border-seat-empty" aria-hidden="true" />}
                <div><div className="text-sm font-medium">{s.title}</div><div className="text-[13px] text-mute">{c ? c.name : "Open seat"}</div></div>
                <span className={clsx("text-xs", fit && fitTone(fit) !== "ok" ? "text-warn-text" : "text-mute")}>{fit ? fit.text : "Still open"}</span>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] text-mute">To confirm during review</span>
          {notes.map((n) => <div key={n} className="flex gap-2.5 text-[15px]"><span className="text-amber" aria-hidden="true">●</span><span>{n}</span></div>)}
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="proposal-note" className="text-[13px] text-mute">Note for the reviewer</label>
          <textarea id="proposal-note" rows={3} value={note} maxLength={1000} onChange={(e) => onNote(e.target.value)}
            placeholder={`Add context for ${reviewer.split(" ")[0] || "the reviewer"}, for example why a pending date is still the right choice (optional)`}
            className="w-full resize-y rounded-lg border-0 bg-surface-muted px-4 py-3.5 text-[15px] leading-[1.55] text-ink" />
        </div>
        {error && <p role="alert" className="rounded-lg bg-coral-tint px-4 py-3 text-sm text-coral-hover">{error} Your team is still on the canvas: nothing was lost.</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-mute">Reviewer: {reviewer}, delivery lead · nothing is assigned automatically</span>
          <div className="flex gap-2">
            <button type="button" className={pillClass("soft")} onClick={() => onOpenChange(false)}>Keep editing</button>
            <button type="button" className={pillClass("default")} onClick={onSaveDraft} disabled={busy}>{saveLabel}</button>
            <button type="button" className={pillClass("coral")} onClick={onSend} disabled={busy || placed === 0}>{busy ? "Sending…" : resubmit ? "Resubmit for review" : "Send for review"}</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
