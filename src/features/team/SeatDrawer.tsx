"use client";
/** "Position details" drawer (spec §9.4): needs, level, allocation and the people with documented experience for one seat. */
import Link from "next/link";
import { useState } from "react";
import { clsx } from "clsx";
import { Drawer } from "@/design-system/overlays";
import { Portrait } from "@/design-system/Portrait";
import { EvidenceDot, EvidenceLegend, IconButton, VerificationBadge, pillClass } from "@/design-system/primitives";
import type { Seniority } from "@/domain/schemas";
import { DOT } from "./TeamCanvas";
import { ALLOCATIONS, SENIORITY, fitTone, seatState, type CandidateView, type TeamContext, type TeamSeat } from "./model";

const seg = (on: boolean) => clsx("h-8 cursor-pointer rounded-pill border-0 px-3.5 text-[13px] font-medium", on ? "bg-white text-ink shadow-[0_1px_3px_rgba(0,0,0,.1)]" : "bg-transparent text-ink-2");
const FIT_TEXT = { ok: "text-ok-text", warn: "text-warn-text", overlap: "text-coral-hover" } as const;

export function SeatDrawer({ ctx, seat, readOnly, views, uncatalogued, compareHref, reviewerName, onClose, onPatch, onPlace, onClearPerson, onRemoveSeat }: {
  ctx: TeamContext; seat: TeamSeat; readOnly: boolean; views: CandidateView[]; uncatalogued: string[]; compareHref: string; reviewerName: string;
  onClose: () => void; onPatch: (patch: Partial<Pick<TeamSeat, "title" | "capabilities" | "seniority" | "allocation">>) => void;
  onPlace: (v: CandidateView) => void; onClearPerson: () => void; onRemoveSeat: () => void;
}) {
  const [cap, setCap] = useState("");
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [confirmRemove, setConfirmRemove] = useState(false);
  const person = seat.personId ? ctx.candidates.find((c) => c.personId === seat.personId) : null;
  const state = seatState(seat);
  const addCap = () => {
    const v = cap.trim();
    if (!v || seat.capabilities.some((c) => c.toLowerCase() === v.toLowerCase())) { setCap(""); return; }
    onPatch({ capabilities: [...seat.capabilities, v] }); setCap("");
  };
  const locked = readOnly || state === "confirmed";

  return (
    <Drawer open onOpenChange={(o) => { if (!o) onClose(); }} title={`Position details: ${seat.title}`} width={500}
      header={
        <div className="flex items-start justify-between gap-3 px-[26px] pt-[26px] pb-1.5">
          <div><span className="text-[13px] text-mute">Seat on the {ctx.opportunity.client} team</span><h2 className="mt-1 text-[30px] leading-[1.1] font-light tracking-[-0.03em]">{seat.title}</h2></div>
          <IconButton label="Close" onClick={onClose} />
        </div>
      }
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          {locked ? <span /> : confirmRemove ? (
            <span className="flex items-center gap-2 text-sm"><span>Remove this role{person ? ` and un-place ${person.name}` : ""}?</span><button type="button" onClick={onRemoveSeat} className={pillClass("coral", "sm")}>Yes, remove</button><button type="button" onClick={() => setConfirmRemove(false)} className={pillClass("soft", "sm")}>Keep</button></span>
          ) : (
            <button type="button" onClick={() => (person ? setConfirmRemove(true) : onRemoveSeat())} className="cursor-pointer border-0 bg-transparent p-0 text-sm text-mute underline-offset-2 hover:underline">Remove this role</button>
          )}
          <Link href={compareHref} className={pillClass("default")}>Compare side by side</Link>
        </div>
      }>
      {person && (
        <div className={clsx("flex items-center gap-3 rounded-xl p-3.5", state === "confirmed" ? "bg-ok-bg-2" : "bg-coral-tint")}>
          <Portrait who={person.personId} size={44} decorative />
          <div className="flex-1">
            <div className={clsx("text-[13px] font-semibold", state === "confirmed" ? "text-ok-text" : "text-coral-hover")}>{state === "confirmed" ? `Confirmed by ${reviewerName}` : "Proposed by you"}</div>
            <div className="font-medium">{person.name}</div>
          </div>
          {!locked && <button type="button" onClick={onClearPerson} className={pillClass("default", "sm")}>Remove</button>}
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        <span className="text-[13px] text-mute">Needs</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {seat.capabilities.map((c) => (
            <span key={c} className="inline-flex h-9 items-center gap-1.5 rounded-pill bg-ink py-0 pr-1.5 pl-3.5 text-sm font-medium text-white">
              {c}
              {!locked && <button type="button" aria-label={`Remove ${c}`} onClick={() => onPatch({ capabilities: seat.capabilities.filter((x) => x !== c) })} className="size-6 cursor-pointer rounded-full border-0 bg-ink-soft text-[10px] text-white">✕</button>}
            </span>
          ))}
          {!locked && (
            <span className="focus-ring-within inline-flex rounded-pill">
              <input aria-label="Add a capability" value={cap} onChange={(e) => setCap(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCap(); } }} placeholder="+ Add" maxLength={60}
                className="h-9 w-[120px] rounded-pill border-0 bg-surface-muted px-3.5 text-sm font-medium text-ink outline-none" />
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-2.5">
          <div role="group" aria-label="Level" className="inline-flex gap-0.5 rounded-pill bg-surface-muted p-[3px]">
            {SENIORITY.map((l) => <button key={l} type="button" disabled={locked} aria-pressed={seat.seniority === l} onClick={() => onPatch({ seniority: l as Seniority })} className={seg(seat.seniority === l)}>{l}</button>)}
          </div>
          <div role="group" aria-label="Allocation" className="inline-flex gap-0.5 rounded-pill bg-surface-muted p-[3px]">
            {ALLOCATIONS.map((a) => <button key={a.label} type="button" disabled={locked} aria-pressed={seat.allocation === a.value} onClick={() => onPatch({ allocation: a.value })} className={seg(seat.allocation === a.value)}>{a.label}</button>)}
            {!ALLOCATIONS.some((a) => a.value === seat.allocation) && <span className={seg(true)}>{seat.allocation} FTE</span>}
          </div>
        </div>
      </div>

      {!locked && (
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1">
            <span className="text-[13px] text-mute">{seat.personId ? "Replace with someone else" : "People with documented experience"}</span>
            <span className="text-xs text-mute" title="Ordered by documented matches, then availability">Ordered by documented matches, then availability. Not a ranking of people.</span>
          </div>
          <EvidenceLegend />
          {views.map((c) => (
            <div key={c.personId} role="group" aria-label={c.name} className={clsx("flex flex-col gap-3 rounded-card p-4", c.inThisSeat ? "bg-coral-tint" : "bg-surface-muted")}>
              <div className="flex items-center gap-3">
                <Portrait who={c.personId} size={48} decorative />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{c.name}
                    {c.onShortlist && <span className="ml-2 text-[11px] font-semibold text-coral-hover">On your shortlist</span>}
                    {c.sharedInterest && <span className="ml-2 text-[11px] font-semibold text-ok-text">Shared interest</span>}
                  </div>
                  <div className={clsx("flex items-center gap-1.5 text-[13px]", FIT_TEXT[fitTone(c.fit)])}><span className={clsx("size-2 rounded-full", DOT[fitTone(c.fit)])} aria-hidden="true" />{c.fit.text}</div>
                  {c.elsewhere && !c.inThisSeat && <div className="text-xs text-mute">Currently proposed as {c.elsewhere}</div>}
                </div>
                <button type="button" onClick={() => onPlace(c)} aria-pressed={c.inThisSeat} className={pillClass(c.inThisSeat ? "ink" : "default", "sm")}>{c.actionLabel}</button>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {c.cells.map((x) => (
                  <span key={x.label} title={x.text} className={clsx("inline-flex items-center gap-1.5 text-[13px]", x.level ? "text-ink" : "text-mute-2")}>
                    <EvidenceDot level={x.level} />{x.label}{x.verification && <VerificationBadge verification={x.verification} />}{!x.level && <span className="text-[11px]">not documented</span>}
                  </span>
                ))}
              </div>
              {shown[c.personId] && (
                <div className="flex flex-col gap-1 pt-1">
                  {c.evidenceLines.map((l) => <span key={l} className="text-[13px] text-ink-2">{l}</span>)}
                  <Link href={`/people/${c.personId}`} className="text-[13px] font-medium text-coral-strong">Open {c.name.split(" ")[0]}’s passport →</Link>
                </div>
              )}
              <button type="button" onClick={() => setShown((p) => ({ ...p, [c.personId]: !p[c.personId] }))} aria-expanded={!!shown[c.personId]} className="cursor-pointer self-start border-0 bg-transparent p-0 text-[13px] font-medium text-ink-2">{shown[c.personId] ? "Hide evidence" : "Show evidence"}</button>
            </div>
          ))}
          {views.length === 0 && <p className="rounded-lg bg-surface-muted p-4 text-mute">No one has documented experience with any of these yet. Try removing a capability.</p>}
          {uncatalogued.length > 0 && <p className="text-xs text-mute">Not in the skills catalogue: {uncatalogued.join(", ")}. Nobody can match these, which means “not documented”, not that nobody has them.</p>}
        </div>
      )}
      {locked && <p className="text-sm text-mute">{state === "confirmed" ? "This seat is an assignment now." : "This proposal is with the reviewer. It becomes editable again only if it is returned."}</p>}
    </Drawer>
  );
}
