import Link from "next/link";
import { clsx } from "clsx";
import { guardPage } from "@/lib/access";
import { getSessionUser } from "@/lib/session";
import { getPlanningView, type PlanningSearchParams } from "@/features/planning/queries";
import type { BarKind } from "@/features/planning/model";
import { Portrait } from "@/design-system/Portrait";
import { AvailabilityDot, DisplayTitle, pillClass } from "@/design-system/primitives";
import { DISCIPLINES } from "@/domain/schemas";

export const metadata = { title: "Planning" };

const BAR_STYLE: Record<BarKind, string> = {
  assignment: "bg-line text-ink",
  available: "bg-ok-bg text-ok-text",
  pending: "border-[1.5px] border-dashed border-warn bg-[#FFF7EA] text-warn-text",
  proposed: "border-[1.5px] border-coral bg-peach-1 text-[#9E3119]",
};

function url(sp: PlanningSearchParams, patch: Partial<Record<keyof PlanningSearchParams, string | null>>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `/planning?${s}` : "/planning";
}

export default async function PlanningPage({ searchParams }: { searchParams: Promise<PlanningSearchParams> }) {
  const sp = await searchParams;
  const user = await getSessionUser();
  const v = await guardPage(user, () => getPlanningView(sp, user));
  const weekly = v.window.view === "w";
  const sel = v.selected;

  return (
    <main className="mx-auto flex max-w-page flex-col gap-[26px] px-10 pt-6 pb-[120px] max-xl:px-5">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex flex-col gap-2.5">
          <DisplayTitle light="Who’s free," strong="and when." />
          <p className="text-[17px] text-mute">{v.window.label} · read-only, computed from confirmed assignments and documented availability. A proposal is not an assignment.</p>
        </div>
        <div className="flex items-center gap-2.5">
          {weekly ? <Link scroll={false} href={url(sp, { off: String(v.offsetDays - v.step), sel: null })} aria-label="Earlier" className={pillClass("default", "sm", "size-10 px-0")}>←</Link> : <span className={pillClass("default", "sm", "size-10 px-0 opacity-40")} aria-hidden="true">←</span>}
          <Link scroll={false} href={url(sp, { off: null, sel: null })} className={pillClass("default", "sm", "h-10")}>Today</Link>
          {weekly ? <Link scroll={false} href={url(sp, { off: String(v.offsetDays + v.step), sel: null })} aria-label="Later" className={pillClass("default", "sm", "size-10 px-0")}>→</Link> : <span className={pillClass("default", "sm", "size-10 px-0 opacity-40")} aria-hidden="true">→</span>}
          <div className="ml-1.5 flex gap-1 rounded-pill bg-white p-1" role="group" aria-label="Scale">
            <Link scroll={false} href={url(sp, { view: null, off: null, sel: null })} aria-current={weekly ? "true" : undefined} className={pillClass(weekly ? "ink" : "default", "sm", "h-9")}>Weeks</Link>
            <Link scroll={false} href={url(sp, { view: "m", off: null, sel: null })} aria-current={!weekly ? "true" : undefined} className={pillClass(!weekly ? "ink" : "default", "sm", "h-9")}>Months</Link>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by discipline">
        {(["All", ...DISCIPLINES] as const).map((d) => (
          <Link key={d} scroll={false} href={url(sp, { disc: d === "All" ? null : d, sel: null })} aria-current={v.discipline === d ? "true" : undefined} className={pillClass(v.discipline === d ? "ink" : "default", "sm")}>{d}</Link>
        ))}
      </div>

      <div className="flex items-start gap-5">
        <section aria-label="Availability timeline" className="min-w-0 flex-1 overflow-hidden rounded-panel bg-white pt-3 pb-[18px] shadow-card">
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-[230px_minmax(0,1fr)] pr-6">
                <span />
                <div className="relative h-10">{v.ticks.map((t) => <span key={t.label + t.leftPct} className="absolute top-3 -translate-x-0.5 whitespace-nowrap text-xs text-mute" style={{ left: `${t.leftPct}%` }}>{t.label}</span>)}</div>
              </div>
              <div className="grid grid-cols-[230px_minmax(0,1fr)] pr-6">
                <div className="px-6 py-2 text-[13px] text-mute">Kick-offs</div>
                <div className="relative h-[76px]">
                  {v.kickoffs.map((k) => (
                    <Link key={k.opportunityId} href={`/opportunities?open=${k.opportunityId}`} title={`${k.client} kicks off ${k.date}`} className="absolute inline-flex h-[22px] items-center gap-1.5 rounded-pill bg-surface-muted py-0 pr-2.5 pl-1 text-[11px] font-medium text-ink" style={{ left: `${k.leftPct}%`, top: k.top }}>
                      <span className="inline-flex size-[18px] items-center justify-center rounded-full bg-coral text-[9px] text-white">{k.initials}</span>{k.client}
                    </Link>
                  ))}
                </div>
              </div>
              <div className="relative">
                {v.todayPct !== null && <div aria-hidden="true" className="pointer-events-none absolute top-0 bottom-0 z-[2] w-0.5 bg-coral opacity-80" style={{ left: `calc(230px + (100% - 254px) * ${v.todayPct / 100})` }} />}
                {v.rows.map((r) => (
                  <div key={r.person.id} className="grid grid-cols-[230px_minmax(0,1fr)] pr-6">
                    <div className="flex min-w-0 items-center gap-3 px-6 py-2">
                      <Portrait who={r.person.id} size={36} decorative />
                      <div className="min-w-0"><div className="text-sm font-medium whitespace-nowrap">{r.person.name}</div><div className="text-xs text-mute">{r.person.discipline}</div></div>
                    </div>
                    <div className="relative h-[50px]">
                      {r.bars.map((b) => {
                        const on = sel?.selKey === b.key;
                        return (
                          <Link key={b.key} scroll={false} href={url(sp, { sel: on ? null : b.key })} aria-label={b.aria} aria-current={on ? "true" : undefined} title={b.aria}
                            className={clsx("absolute top-[9px] flex h-8 items-center overflow-hidden rounded-pill px-3.5 text-xs font-medium whitespace-nowrap hover:shadow-[0_0_0_2px_var(--color-ink)]", BAR_STYLE[b.kind])}
                            style={{ left: `${b.leftPct}%`, width: `${b.widthPct}%`, boxShadow: on ? "0 0 0 2px var(--color-ink)" : undefined }}>{b.label}</Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {v.rows.length === 0 && <p className="px-6 py-10 text-center text-mute">Nobody in this discipline.</p>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-5 px-6 pt-[18px] text-[13px] text-mute">
            <span className="inline-flex items-center gap-2"><span className="h-3 w-[26px] rounded-pill bg-line" />On a project</span>
            <span className="inline-flex items-center gap-2"><span className="h-3 w-[26px] rounded-pill bg-ok-bg" />Available · confirmed</span>
            <span className="inline-flex items-center gap-2"><span className="h-3 w-[26px] rounded-pill border-[1.5px] border-dashed border-warn bg-[#FFF7EA]" />Available · pending confirmation</span>
            <span className="inline-flex items-center gap-2"><span className="h-3 w-[26px] rounded-pill border-[1.5px] border-coral bg-peach-1" />Proposed for a team (not assigned)</span>
          </div>
        </section>

        <aside aria-label="Details" className="sticky top-4 flex flex-[0_0_340px] flex-col gap-[18px] rounded-panel bg-white p-[26px] shadow-card max-lg:hidden">
          {sel ? (
            <>
              <div className="flex items-start justify-between">
                <span className="inline-flex h-[30px] items-center rounded-pill bg-surface-muted px-3 text-xs font-medium">{sel.kind}</span>
                <Link scroll={false} href={url(sp, { sel: null })} aria-label="Close details" className={pillClass("soft", "sm", "w-[34px] px-0")}>✕</Link>
              </div>
              <div className="flex items-center gap-3.5"><Portrait who={sel.personId} size={56} decorative /><div><div className="text-xl font-normal tracking-[-0.015em]">{sel.name}</div><div className="text-sm text-mute">{sel.headline}</div></div></div>
              <p className="text-[17px] leading-[1.45] font-light">{sel.line}</p>
              <div className="flex flex-col gap-2.5">{sel.facts.map((f) => <div key={f.k} className="flex justify-between text-sm"><span className="text-mute">{f.k}</span><span>{f.v}</span></div>)}</div>
              {sel.pending && (
                <>
                  <button type="button" disabled className={pillClass("ink", "xl")} title="Notifications are not available in this release">Ask {sel.leadName ?? "the delivery lead"} to confirm</button>
                  <p className="text-xs text-mute">Asking for confirmation will be available once notifications exist. Today, ask {sel.leadName ?? "the delivery lead"} directly.</p>
                </>
              )}
              <Link href={`/people/${sel.personId}`} className={pillClass("soft", "xl")}>Open profile</Link>
            </>
          ) : (
            <>
              <p className="text-xl leading-[1.3] font-light tracking-[-0.015em]">Free within 60 days</p>
              {v.freeSoon.length ? (
                <ul className="flex flex-col gap-2.5">
                  {v.freeSoon.map((f) => (
                    <li key={f.personId}><Link href={`/people/${f.personId}`} className="flex items-center gap-3 rounded-md bg-surface-muted px-3 py-2.5 text-sm text-ink"><Portrait who={f.personId} size={32} decorative /><span className="flex-1">{f.name}</span><AvailabilityDot confirmed={f.confirmed} /><span className="text-[13px] text-mute">{f.compact}</span></Link></li>
                  ))}
                </ul>
              ) : <p className="text-sm text-mute">Nobody is free in the next 60 days.</p>}
              <p className="text-xs text-mute">Choose a bar to see what it means.</p>
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
