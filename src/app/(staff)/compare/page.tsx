import Link from "next/link";
import { guardPage } from "@/lib/access";
import { getSessionUser } from "@/lib/session";
import { getCompareView, type CompareSearchParams } from "@/features/compare/queries";
import { ShortlistButton } from "@/features/shortlist/ShortlistButton";
import { Portrait } from "@/design-system/Portrait";
import { AvailabilityDot, DisplayTitle, EvidenceDot, EvidenceLegend, pillClass, VerificationBadge } from "@/design-system/primitives";

export const metadata = { title: "Compare" };

function href(sp: CompareSearchParams, ids: string[]) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ids: ids.join(",") })) if (v) p.set(k, v);
  return `/compare?${p.toString()}`;
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<CompareSearchParams> }) {
  const sp = await searchParams;
  const user = await getSessionUser();
  const v = await guardPage(user, () => getCompareView(sp, user));
  const ids = v.idsParam ? v.idsParam.split(",") : [];
  const context = v.roleTitle && v.context ? `${v.context.client} · ${v.roleTitle}` : v.context ? v.context.client : null;
  const canAdd = v.people.length < v.max && v.addable.length > 0;

  return (
    <main className="mx-auto flex max-w-page flex-col gap-7 px-10 pt-4 pb-[120px] max-xl:px-5">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex flex-col gap-2.5">
          <Link href={v.back.href} className="text-sm text-mute">← {v.back.label}</Link>
          <DisplayTitle size={52} light="Side by side," strong="on the evidence." />
          <p className="max-w-[760px] text-base text-mute">
            {context ? `Comparing for ${context}. ` : ""}Requirements: {v.requirements.length ? v.requirements.join(", ") : "none chosen"}. Documented experience only; nothing is ranked and people appear in the order you chose.
          </p>
        </div>
        <Link href="/planning" className={pillClass("default", "lg")}>See availability</Link>
      </header>

      {v.truncated && <p role="status" className="rounded-card bg-coral-tint px-[18px] py-3.5 text-sm text-ink-2">You can compare up to {v.max} profiles at a time. The first {v.max} are shown.</p>}

      {v.people.length < 2 ? (
        <section className="flex flex-col gap-4 rounded-surface bg-white p-10 shadow-card">
          <p className="text-2xl font-light tracking-[-0.02em]">Choose at least two people to compare.</p>
          <p className="text-mute">Add people to the compare tray from People or from a passport, then open Compare. {v.people.length === 1 ? "One profile is selected." : ""}</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/people" className={pillClass("ink", "lg")}>Browse people</Link>
            {v.addable.map((a) => <Link key={a.id} href={href(sp, [...ids, a.id])} className={pillClass("default", "lg", "pl-1.5")}><Portrait who={a.id} size={28} decorative />{a.name}</Link>)}
          </div>
        </section>
      ) : (
        <>
          <EvidenceLegend />
          <div className="grid items-stretch gap-4" style={{ gridTemplateColumns: `repeat(${v.people.length + (canAdd ? 1 : 0)}, minmax(0, 1fr))` }}>
            {v.people.map((c) => (
              <article key={c.person.id} aria-label={c.person.name} className="flex flex-col gap-[22px] rounded-panel bg-white p-7 shadow-card">
                <div className="flex items-start justify-between">
                  <Portrait who={c.person.id} size={76} />
                  <Link href={href(sp, ids.filter((x) => x !== c.person.id))} aria-label={`Remove ${c.person.name}`} className={pillClass("default", "sm", "w-[34px] px-0")}>✕</Link>
                </div>
                <div><h2 className="text-[26px] font-normal tracking-[-0.02em]">{c.person.name}</h2><p className="text-mute">{c.person.headline} · {c.person.yearsExperience} years</p></div>
                <div className="flex items-center gap-2.5 rounded-lg bg-surface-muted px-4 py-3 text-sm">
                  <AvailabilityDot confirmed={c.availability.confirmed} size={9} />
                  <span className="flex-1">{c.fit ? c.fit.text : c.availability.text}</span>
                  <span className="text-[13px] text-mute">{c.availability.statusLabel}</span>
                </div>
                <div className="flex flex-col gap-3">
                  <span className="pt-1.5 text-[13px] text-mute">Requirements</span>
                  {c.cells.map((cell) => (
                    <div key={cell.requirement} className="flex items-start gap-3">
                      <span className="mt-1"><EvidenceDot level={cell.level} size={14} /></span>
                      <div className="min-w-0">
                        <div className={cell.level ? "text-[15px] text-ink" : "text-[15px] text-mute-2"}>{cell.requirement}{cell.verification && <> <VerificationBadge verification={cell.verification} /></>}</div>
                        <div className="text-[13px] text-mute">{cell.uncatalogued ? "not in the skills catalogue" : cell.text}{cell.detail ? ` · ${cell.detail}` : ""}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-2"><span className="pt-1.5 text-[13px] text-mute">Relevant work</span>{c.work.length ? c.work.map((w) => <div key={w} className="text-[15px]">{w}</div>) : <div className="text-[15px] text-mute-2">No projects documented</div>}</div>
                <div className="flex flex-col gap-2"><span className="pt-1.5 text-[13px] text-mute">Still to confirm</span>
                  {c.toConfirm.length ? c.toConfirm.map((t) => <div key={t} className="text-[15px] text-warn-text">{t}</div>) : <div className="text-[15px] text-mute">Nothing pending</div>}
                </div>
                <div className="flex-1" />
                <div className="flex gap-2">
                  <ShortlistButton personId={c.person.id} initialOn={v.shortlist.includes(c.person.id)} offVariant="coral" className="flex-1" />
                  <Link href={`/people/${c.person.id}`} className={pillClass("default", "xl")}>Passport</Link>
                </div>
              </article>
            ))}
            {canAdd && (
              <div className="flex flex-col justify-center gap-3 rounded-panel border-[1.5px] border-dashed border-line-strong p-7">
                <p className="text-xl font-light tracking-[-0.015em]">Add someone to compare</p>
                {v.addable.map((a) => <Link key={a.id} href={href(sp, [...ids, a.id])} className={pillClass("default", "md", "justify-start pl-1.5")}><Portrait who={a.id} size={28} decorative />{a.name}</Link>)}
                <p className="text-xs text-mute">People with documented experience in at least one requirement, in alphabetical order.</p>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
