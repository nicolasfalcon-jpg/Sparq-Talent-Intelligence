import Link from "next/link";
import { clsx } from "clsx";
import { guardPage } from "@/lib/access";
import { getSessionUser } from "@/lib/session";
import { getInsightsView, type InsightsSearchParams } from "@/features/insights/queries";
import type { Supply } from "@/features/insights/model";
import { DisplayTitle, pillClass } from "@/design-system/primitives";

export const metadata = { title: "Insights" };

/** Supply bar: filled from the left in the share of the largest group shown; the three parts only when the split may be shown. */
function SupplyBar({ supply, scale }: { supply: Supply; scale: number }) {
  if (!supply.shown) return <span className="text-[13px] text-mute">{supply.reason}</span>;
  if (supply.total === 0) return <span className="text-[13px] text-mute">Not documented in any passport</span>;
  const w = (n: number) => `${Math.max(2, (n / Math.max(scale, 1)) * 100)}%`;
  return (
    <span className="flex items-center gap-3">
      <span className="flex h-2.5 min-w-0 flex-1 overflow-hidden rounded-pill bg-surface-muted" role="img" aria-label={`${supply.total} people with documented experience`}>
        {supply.split ? (
          <>
            <span className="h-full bg-ink" style={{ width: w(supply.split.verifiedPractical) }} />
            <span className="h-full bg-warn" style={{ width: w(supply.split.needsConfirmation) }} />
            <span className="h-full bg-line-strong" style={{ width: w(supply.split.learning) }} />
          </>
        ) : <span className="h-full bg-mute-2" style={{ width: w(supply.total) }} />}
      </span>
      <span className="w-6 text-right text-sm tabular-nums">{supply.total}</span>
    </span>
  );
}

function Demand({ n }: { n: number }) {
  if (n === 0) return <span className="text-[13px] text-mute-2">No open roles</span>;
  return <span className="inline-flex items-center gap-1.5 text-sm" title={`${n} open role${n === 1 ? "" : "s"} need this`}>{Array.from({ length: Math.min(n, 8) }).map((_, i) => <span key={i} className="size-3.5 rounded-full border-2 border-coral" aria-hidden="true" />)}<span className="ml-1 text-[13px] text-mute">{n} open role{n === 1 ? "" : "s"}</span></span>;
}

export default async function InsightsPage({ searchParams }: { searchParams: Promise<InsightsSearchParams> }) {
  const sp = await searchParams;
  const user = await getSessionUser();
  const { model, selected, peopleCount } = await guardPage(user, () => getInsightsView(sp, user));
  const scale = Math.max(1, ...model.groups.flatMap((g) => (g.supply.shown ? [g.supply.total] : [])));
  const sel = model.groups.find((g) => g.group === selected) ?? null;
  const capScale = sel ? Math.max(1, ...sel.capabilities.flatMap((c) => (c.supply.shown ? [c.supply.total] : []))) : 1;

  return (
    <main className="mx-auto flex max-w-page flex-col gap-9 px-10 pt-6 pb-[120px] max-xl:px-5">
      <header className="flex flex-col gap-2.5">
        <DisplayTitle light="What your organization" strong="knows." />
        <p className="max-w-[760px] text-[17px] text-mute">Documented experience across {peopleCount} professionals, set against {model.openRoles} open roles. Aggregates only: nobody is named, nothing is scored, and counts below {model.minGroup} people are not shown.</p>
      </header>

      <div className="flex flex-wrap items-start gap-6">
        <section aria-label="Capability supply and demand" className="min-w-0 flex-[999_1_620px] rounded-panel bg-white p-[18px] shadow-card">
          <div className="flex flex-wrap gap-5 px-[22px] pt-2 pb-3.5 text-[13px] text-mute">
            <span className="inline-flex items-center gap-2"><span className="size-3 rounded-full bg-ink" />Verified practical experience</span>
            <span className="inline-flex items-center gap-2"><span className="size-3 rounded-full bg-warn" />Practical, needs confirmation</span>
            <span className="inline-flex items-center gap-2"><span className="size-3 rounded-full bg-line-strong" />Training or learning</span>
            <span className="inline-flex items-center gap-2"><span className="size-3.5 rounded-full border-2 border-coral" />Open role needing it</span>
          </div>
          {model.groups.map((g) => {
            const on = g.group === selected;
            return (
              <Link key={g.group} scroll={false} href={on ? "/insights" : `/insights?group=${g.group}`} aria-current={on ? "true" : undefined}
                className={clsx("grid grid-cols-[200px_minmax(0,1fr)_190px] items-center gap-5 rounded-card px-[22px] py-4 text-ink max-md:grid-cols-1 max-md:gap-2", on ? "bg-surface-muted" : "hover:bg-surface-muted")}>
                <span className={clsx("text-lg tracking-[-0.01em]", on ? "font-medium" : "font-normal")}>{g.label}</span>
                <SupplyBar supply={g.supply} scale={scale} />
                <Demand n={g.demand} />
              </Link>
            );
          })}
          {model.uncatalogued.length > 0 && (
            <p className="px-[22px] pt-3 pb-2 text-[13px] text-mute">Also needed by open roles but not in the skills catalogue: {model.uncatalogued.map((u) => `${u.label} (${u.demand})`).join(", ")}. Not matched to anyone.</p>
          )}
        </section>

        <aside aria-label="Capability detail" className="sticky top-4 flex max-w-[440px] flex-[1_1_360px] flex-col gap-5 rounded-panel bg-white p-[30px] shadow-card">
          {!sel ? (
            <p className="text-2xl leading-[1.3] font-light tracking-[-0.02em]">Choose a group to see <span className="font-medium">the capabilities inside it</span> and how many roles need them.</p>
          ) : (
            <>
              <div>
                <span className="text-sm text-mute">{sel.demand} open role{sel.demand === 1 ? "" : "s"} need this group</span>
                <h2 className="mt-1.5 text-[34px] leading-[1.1] font-light tracking-[-0.03em]">{sel.label}</h2>
              </div>
              <div className="flex flex-col gap-0.5">
                {sel.capabilities.map((c) => (
                  <div key={c.id} className="grid grid-cols-[130px_minmax(0,1fr)] items-center gap-3 rounded-md px-3 py-2.5">
                    <span className="text-sm">{c.name}{c.demand > 0 && <span className="ml-1.5 text-[11px] font-semibold text-coral-strong" title={`${c.demand} open role${c.demand === 1 ? "" : "s"} need this`}>{c.demand} open</span>}</span>
                    <SupplyBar supply={c.supply} scale={capScale} />
                  </div>
                ))}
              </div>
              <p className="rounded-lg bg-surface-muted px-4 py-3.5 text-[13px] leading-[1.5] text-mute">“Not documented” describes what is written in passports, never what people can do. Counts below {model.minGroup} are hidden so no individual can be identified.</p>
              <Link href="/insights" className={pillClass("default", "sm", "self-start")}>All groups</Link>
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
