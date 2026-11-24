import Link from "next/link";
import { clsx } from "clsx";
import { getSessionUser } from "@/lib/session";
import { getHomeView } from "@/features/home/queries";
import { HomeAskCard } from "@/features/home/HomeAskCard";
import { Icon } from "@/design-system/icons";
import { Portrait } from "@/design-system/Portrait";
import { InfoChip, liftCard, pillClass } from "@/design-system/primitives";

export const metadata = { title: "Home" };

export default async function HomePage() {
  const [user, view] = await Promise.all([getSessionUser(), getHomeView()]);
  const firstName = user.name.split(" ")[0];

  return (
    <main className="mx-auto flex max-w-page flex-wrap items-start gap-8 px-10 pt-3 pb-24 max-xl:px-5">
      <HomeAskCard />

      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-11">
        <header className="flex flex-wrap items-end justify-between gap-6 pt-5">
          <div className="flex flex-col gap-2.5">
            <span className="flex flex-wrap items-center gap-2.5">
              <span className="text-sm text-mute">{view.dateLabel}</span>
              <InfoChip>Fictional demo dataset</InfoChip>
            </span>
            <h1 className="text-[56px] leading-[1.02] font-light tracking-[-0.04em] max-lg:text-[44px]">Good morning, <span className="font-medium">{firstName}.</span></h1>
          </div>
          <div className="flex gap-10">
            {view.stats.map((s) => (
              <Link key={s.label} href={s.href} className="flex flex-col gap-1.5">
                <span className="text-[44px] leading-none font-light tracking-[-0.045em]">{s.value}</span>
                <span className="text-[13px] text-mute">{s.label}</span>
              </Link>
            ))}
          </div>
        </header>

        <section className="flex flex-col gap-[18px]" aria-labelledby="teams-h">
          <div className="flex items-center justify-between">
            <h2 id="teams-h" className="text-2xl font-normal tracking-[-0.02em]">Teams in the making</h2>
            <Link href="/opportunities" className={pillClass("default", "sm")}>All opportunities</Link>
          </div>
          <div className="grid grid-cols-2 gap-[18px] max-md:grid-cols-1">
            {view.teams.map((o) => (
              <Link key={o.id} href={`/opportunities?open=${o.id}`} className={clsx("group flex flex-col gap-[22px] rounded-surface bg-surface p-[26px] shadow-card", liftCard)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1.5"><span className="text-sm text-mute">{o.client}</span><h3 className="text-2xl leading-[1.2] font-normal tracking-[-0.02em]">{o.name}</h3></div>
                  <div className="flex-none text-right"><div className="text-[30px] leading-none font-light tracking-[-0.03em]">{o.day}</div><div className="mt-1 text-xs text-mute">{o.month} kick-off</div></div>
                </div>
                <div className="flex items-center justify-between">
                  {/* The label shrinks beside the seats first (as before); it drops under them only when even its narrowest form cannot fit. */}
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
                    <div className="flex items-center gap-1.5">
                      {o.seats.map((s) => (
                        <span key={s.id} className={clsx("inline-flex size-[38px] flex-none items-center justify-center overflow-hidden rounded-full bg-white", !s.personId && "border-[1.5px] border-dashed border-seat-empty")}>
                          {s.personId && <Portrait who={s.personId} size={38} decorative />}
                        </span>
                      ))}
                    </div>
                    <span className="min-w-min flex-[1_1_0px] text-[13px] text-mute">{o.seatsLabel}</span>
                  </div>
                  <span aria-hidden="true" className="inline-flex size-10 flex-none items-center justify-center rounded-full bg-surface-muted transition-colors group-hover:bg-ink group-hover:text-white"><Icon name="arrowUpRight" size={16} strokeWidth={1.8} /></span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-[18px]" aria-labelledby="ready-h">
          <div className="flex items-center justify-between">
            <h2 id="ready-h" className="text-2xl font-normal tracking-[-0.02em]">Ready for their next team</h2>
            <Link href="/people" className={pillClass("default", "sm")}>All people</Link>
          </div>
          <div className="grid grid-cols-5 gap-3.5 max-xl:grid-cols-3">
            {view.ready.map((p) => (
              <Link key={p.id} href={`/people/${p.id}`} className={clsx("flex flex-col items-start gap-3.5 rounded-card bg-surface px-[18px] py-5 shadow-card", liftCard)}>
                <Portrait who={p.id} size={72} />
                <div><div className="text-[15px] font-medium">{p.name}</div><div className="text-[13px] text-mute">{p.headline}</div></div>
                <div className="flex items-center gap-[7px] text-[13px]"><span className="size-[7px] rounded-full bg-ok-bright" aria-hidden="true" />{p.when}</div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
