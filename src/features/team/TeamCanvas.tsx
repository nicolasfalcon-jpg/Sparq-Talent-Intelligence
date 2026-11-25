"use client";
/**
 * The visual team canvas (V4.2 `v4-team`): a central project card with role seats arranged around it. Lightweight on purpose:
 * React + CSS only, seats positioned on an ellipse from the seat count (see `seatLayout`). No drag-and-drop, no pan/zoom.
 * Presentation only: every fact it shows is derived in model.ts.
 */
import { clsx } from "clsx";
import { formatShortDate } from "@/domain/dates";
import { Portrait } from "@/design-system/Portrait";
import { canvasHeight, durationLabel, fitFor, fitTone, seatLayout, seatState, type FitTone, type SeatState, type TeamContext, type TeamSeat } from "./model";

export const DOT: Record<FitTone, string> = { ok: "bg-ok-bright", warn: "bg-amber", overlap: "bg-coral" };

const STATE_CHIP: Record<SeatState, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-surface-muted text-mute" },
  proposed: { label: "Proposed", cls: "bg-coral-tint text-coral-hover" },
  confirmed: { label: "Confirmed", cls: "bg-ok-bg text-ok-text" },
};
export const StateChip = ({ state }: { state: SeatState }) => (
  <span className={clsx("inline-flex h-6 items-center rounded-pill px-2.5 text-xs font-semibold whitespace-nowrap", STATE_CHIP[state].cls)}>{STATE_CHIP[state].label}</span>
);
const CapChip = ({ children }: { children: string }) => <span className="inline-flex h-6 items-center rounded-pill bg-surface-muted px-2.5 text-xs whitespace-nowrap text-ink-2">{children}</span>;

export function TeamCanvas({ ctx, seats, selectedKey, onSelect }: { ctx: TeamContext; seats: TeamSeat[]; selectedKey: string | null; onSelect: (key: string) => void }) {
  const slots = seatLayout(seats.length);
  const { opportunity } = ctx;
  return (
    <section aria-label="Team canvas" className="relative overflow-hidden rounded-surface bg-surface shadow-card" style={{ height: canvasHeight(seats.length), backgroundImage: "radial-gradient(var(--color-line) 1.2px, transparent 1.2px)", backgroundSize: "24px 24px" }}>
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0">
        {seats.map((s, i) => (
          <path key={s.key} d={`M50 50 L${slots[i]!.x} ${slots[i]!.y}`} fill="none" strokeWidth={1.5} vectorEffect="non-scaling-stroke"
            stroke={s.personId ? "var(--color-ink)" : "var(--color-line-strong)"} strokeDasharray={s.personId ? undefined : "4 5"} />
        ))}
      </svg>

      <div className="absolute top-1/2 left-1/2 flex w-[250px] -translate-x-1/2 -translate-y-1/2 flex-col gap-1.5 rounded-[30px] bg-ink p-[22px] text-white shadow-[0_20px_50px_rgba(0,0,0,.18)] max-md:w-[200px] max-md:p-4">
        <span className="text-xs text-faint">{opportunity.industry}</span>
        <span className="text-[22px] leading-[1.2] tracking-[-0.02em]">{opportunity.name}</span>
        <span className="text-[13px] text-line-strong">Kick-off {formatShortDate(opportunity.kickoff)} · {durationLabel(opportunity.durationMonths)}</span>
        <div className="mt-2 flex gap-1" aria-hidden="true">{seats.map((s) => <span key={s.key} className={clsx("h-1 flex-1 rounded-sm", s.personId ? "bg-coral" : "bg-ink-2")} />)}</div>
      </div>

      {seats.map((s, i) => {
        const person = s.personId ? ctx.candidates.find((c) => c.personId === s.personId) : null;
        const fit = s.personId ? fitFor(ctx, s.personId) : null;
        const state = seatState(s);
        const label = `${s.title}, ${person ? person.name : "open seat"}, ${STATE_CHIP[state].label.toLowerCase()}`;
        return (
          <button key={s.key} type="button" aria-label={label} aria-haspopup="dialog" onClick={() => onSelect(s.key)}
            className={clsx("absolute flex w-[212px] -translate-x-1/2 -translate-y-1/2 cursor-pointer flex-col gap-2.5 rounded-card border-0 bg-surface p-4 text-left shadow-card transition-shadow duration-200 hover:shadow-card-hover max-md:w-[170px] max-md:p-3", selectedKey === s.key && "ring-2 ring-ink")}
            style={{ left: `${slots[i]!.x}%`, top: `${slots[i]!.y}%` }}>
            <span className="flex items-center gap-3">
              {person ? (
                <span className="relative inline-flex"><Portrait who={person.personId} size={48} decorative />{fit && <span className={clsx("absolute right-[-1px] bottom-[-1px] size-[13px] rounded-full border-[2.5px] border-white", DOT[fitTone(fit)])} aria-hidden="true" />}</span>
              ) : (
                <span className="inline-flex size-12 flex-none items-center justify-center rounded-full border-[1.5px] border-dashed border-seat-empty text-xl text-faint" aria-hidden="true">+</span>
              )}
              <span className="min-w-0">
                <span className="block text-[15px] leading-tight font-medium">{s.title}</span>
                <span className={clsx("block text-[13px]", person ? "text-ink-2" : "text-mute")}>{person ? person.name : `Open seat · ${s.seniority}`}</span>
              </span>
            </span>
            <span className="flex flex-wrap gap-1"><StateChip state={state} />{s.capabilities.map((c) => <CapChip key={c}>{c}</CapChip>)}</span>
          </button>
        );
      })}

      <div className="absolute bottom-[18px] left-6 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-mute max-lg:right-6">
        {([["ok", "Free before kick-off"], ["warn", "Pending or late"], ["overlap", "Overlaps another team"]] as const).map(([tone, text]) => (
          <span key={tone} className="inline-flex items-center gap-1.5"><span className={clsx("size-[11px] rounded-full", DOT[tone])} aria-hidden="true" />{text}</span>
        ))}
      </div>
      <div className="absolute right-6 bottom-[18px] flex gap-2 max-lg:hidden"><StateChip state="confirmed" /><StateChip state="proposed" /><StateChip state="open" /></div>
    </section>
  );
}
