"use client";
/** Coverage, availability conflicts and "Availability against kick-off" (spec §9.5 and §9.6). Presentation only: see model.ts. */
import Link from "next/link";
import { clsx } from "clsx";
import { SparqBadge, pillClass } from "@/design-system/primitives";
import { DOT } from "./TeamCanvas";
import type { ConflictRow, CoverageGroupView, Timeline } from "./model";

const GROUP_TONE: Record<CoverageGroupView["tone"], string> = { ok: "text-ok-text", warn: "text-warn-text", bad: "text-coral-hover", mute: "text-mute" };

export function CoveragePanel({ groups, onAddRole, canEdit }: { groups: CoverageGroupView[]; onAddRole: () => void; canEdit: boolean }) {
  return (
    <section aria-label="Coverage" className="flex flex-col gap-3.5 rounded-surface px-6 py-[22px]" style={{ background: "var(--gradient-ai-soft)" }}>
      <div className="flex items-center gap-2.5"><SparqBadge /><span className="font-medium">Coverage</span><span className="ml-auto text-xs text-mute">From documented capabilities</span></div>
      {groups.length === 0 && <p className="text-sm text-mute">Add roles to see which capabilities are documented.</p>}
      {groups.map((g) => (
        <div key={g.key} className="flex flex-col gap-1.5">
          <span className={clsx("text-[13px] font-semibold", GROUP_TONE[g.tone])}>{g.title} · {g.items.length}</span>
          <span className="text-xs text-mute">{g.hint}</span>
          <div className="flex flex-wrap gap-1.5">
            {g.items.map((i) => (
              <span key={i.label} className="inline-flex h-7 items-center gap-1.5 rounded-pill bg-white px-3 text-[13px] font-medium">
                {i.label}
                {i.needsConfirmation && <span className="text-[11px] font-semibold text-warn-text">needs confirmation</span>}
              </span>
            ))}
          </div>
        </div>
      ))}
      {canEdit && <button type="button" onClick={onAddRole} aria-label="Add a role from coverage" className={pillClass("glass", "sm", "self-start")}>+ Add a role</button>}
    </section>
  );
}

export function ConflictsPanel({ rows, openLabel, onFind }: { rows: ConflictRow[]; openLabel: string; onFind?: (seatKey: string) => void }) {
  return (
    <section aria-label="Availability conflicts" className="flex flex-col gap-2.5 rounded-surface bg-surface px-6 py-[22px] shadow-card">
      <div className="flex items-baseline justify-between"><span className="font-medium">Availability conflicts</span><span className="text-[13px] text-mute">{openLabel}</span></div>
      {rows.map((c) => (
        <div key={c.seatKey} className="flex items-center gap-3 rounded-lg bg-surface-muted px-3 py-2.5">
          <span className={clsx("size-2.5 flex-none rounded-full", DOT[c.tone])} aria-hidden="true" />
          <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{c.person} · {c.title}</span><span className="text-[13px] text-mute">{c.text}</span></span>
          {onFind && <button type="button" onClick={() => onFind(c.seatKey)} className={pillClass("default", "sm")}>Find alternative</button>}
        </div>
      ))}
      {rows.length === 0 && <p className="text-sm text-mute">No conflicts. Everyone placed is free before kick-off.</p>}
    </section>
  );
}

const BAR: Record<"ok" | "warn" | "overlap", string> = {
  ok: "bg-ok-bg text-ok-text",
  warn: "border-[1.5px] border-dashed border-amber bg-amber-bg text-warn-text",
  overlap: "bg-coral-skeleton text-coral-hover",
};

export function TimelinePanel({ timeline }: { timeline: Timeline }) {
  return (
    <section aria-label="Availability against kick-off" className="flex flex-col gap-3.5 rounded-surface bg-surface px-7 py-[26px] shadow-card">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[22px] font-normal tracking-[-0.015em]">Availability against kick-off</h2>
        <Link href="/planning" className="text-sm text-mute">Open Planning →</Link>
      </div>
      <div className="grid grid-cols-[240px_minmax(0,1fr)] gap-4 max-lg:grid-cols-[150px_minmax(0,1fr)]">
        <span />
        <div className="relative h-[18px]" aria-hidden="true">
          {timeline.ticks.map((t) => <span key={t.label + t.left} className="absolute text-xs text-mute" style={{ left: `${t.left}%` }}>{t.label}</span>)}
          <span className="absolute -translate-x-1/2 text-xs font-semibold text-coral-strong" style={{ left: `${timeline.kickoffLeft}%` }}>Kick-off</span>
        </div>
      </div>
      {timeline.rows.map((r) => (
        <div key={r.seatKey} className="grid grid-cols-[240px_minmax(0,1fr)] items-center gap-4 max-lg:grid-cols-[150px_minmax(0,1fr)]">
          <div className="flex flex-col"><span className="text-sm font-medium">{r.title}</span><span className="text-[13px] text-mute">{r.person}</span></div>
          <div className="relative h-7 rounded-pill bg-surface-muted">
            <span className="absolute -top-1 -bottom-1 w-0.5 bg-coral opacity-70" style={{ left: `${timeline.kickoffLeft}%` }} aria-hidden="true" />
            {r.filled && (
              <span className={clsx("absolute top-1 right-1 bottom-1 flex items-center overflow-hidden rounded-pill px-2.5 text-xs whitespace-nowrap", BAR[r.tone])} style={{ left: `${r.left}%` }}>{r.text}</span>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
