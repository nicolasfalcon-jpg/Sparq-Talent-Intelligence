import Link from "next/link";
import { clsx } from "clsx";
import { guardPage } from "@/lib/access";
import { getSessionUser } from "@/lib/session";
import { getPeopleView, type PeopleSearchParams } from "@/features/people/queries";
import { AddToCompareButton, CompareTray, MoreExperience, PeopleSearchBar } from "@/features/people/client";
import { ShortlistButton } from "@/features/shortlist/ShortlistButton";
import { Portrait } from "@/design-system/Portrait";
import { AvailabilityDot, DisplayTitle, EvidenceDot, pillClass, Tag, VerificationBadge } from "@/design-system/primitives";
import { describeEvidence, sourceWord } from "@/domain/rules";
import { DISCIPLINES } from "@/domain/schemas";

export const metadata = { title: "People" };

const TRY = [
  { label: "React Native and native iOS", href: "/people?q=Engineers+with+React+Native+and+native+iOS+experience" },
  { label: "AI engineers free soon", href: "/people?disc=AI&soon=1" },
  { label: "Mobile, free by January", href: "/people?disc=Mobile&soon=1" },
];

function withParams(sp: PeopleSearchParams, patch: Partial<Record<keyof PeopleSearchParams, string | null>>) {
  const p = new URLSearchParams();
  const merged = { ...sp, ...patch };
  for (const [k, v] of Object.entries(merged)) if (v !== null && v !== undefined && v !== "") p.set(k, v);
  const s = p.toString();
  return s ? `/people?${s}` : "/people";
}

export default async function PeoplePage({ searchParams }: { searchParams: Promise<PeopleSearchParams> }) {
  const sp = await searchParams;
  const user = await getSessionUser();
  const v = await guardPage(user, () => getPeopleView(sp, user));
  const hasFilters = v.discipline !== "All" || v.soonOn;
  const sel = v.selected;

  return (
    <main className="mx-auto flex max-w-page flex-col gap-7 px-10 pt-6 pb-[120px] max-xl:px-5">
      <header className="flex flex-col gap-2.5">
        <DisplayTitle light="Find the right" strong="expertise." />
        <p className="text-[17px] text-mute">{v.total} professionals · matched on documented experience, never on scores.</p>
      </header>

      <div className="flex flex-col gap-3.5">
        <PeopleSearchBar initialQ={v.q} />
        {!v.searched && (
          <div className="flex flex-wrap items-center gap-2 pl-5">
            <span className="text-[13px] text-mute">Try</span>
            {TRY.map((t) => <Link key={t.label} href={t.href} className={pillClass("default", "sm")}>{t.label}</Link>)}
          </div>
        )}
        {v.searched && v.criteria.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-card bg-coral-tint px-[18px] py-3.5">
            <span className="mr-1 text-sm text-ink-2">I looked for</span>
            {v.criteria.map((c) => (
              <span key={c.id} className="inline-flex h-[34px] items-center gap-2 rounded-pill bg-white pr-1.5 pl-3.5 text-sm font-medium">
                {c.name}
                <Link href={withParams(sp, { caps: v.criteria.filter((x) => x.id !== c.id).map((x) => x.id).join(",") || "-", sel: null })} aria-label={`Remove ${c.name}`} className="inline-flex size-6 items-center justify-center rounded-full bg-surface-muted text-[11px] text-ink-2">✕</Link>
              </span>
            ))}
            <span className="ml-auto text-[13px] text-mute" title="Per requested capability: verified experience first (professional before independent), then experience that needs confirmation, then training or learning, then earlier availability. Nothing is scored.">Ordered by verified evidence for these requirements, then availability</span>
          </div>
        )}
        {v.unmatchedQuery && (
          <div className="rounded-card bg-coral-tint px-[18px] py-3.5 text-sm text-ink-2">I couldn’t map “{v.q}” to a documented capability yet. Try a skill such as “React Native”, “AWS” or “LLM”.</div>
        )}
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by discipline">
          {(["All", ...DISCIPLINES] as const).map((d) => (
            <Link key={d} href={withParams(sp, { disc: d === "All" ? null : d, sel: null })} aria-current={v.discipline === d ? "true" : undefined} className={pillClass(v.discipline === d ? "ink" : "default", "sm")}>{d}</Link>
          ))}
          <span className="mx-1.5 h-6 w-px bg-line" aria-hidden="true" />
          <Link href={withParams(sp, { soon: v.soonOn ? null : "1", sel: null })} aria-current={v.soonOn ? "true" : undefined} className={pillClass(v.soonOn ? "ink" : "default", "sm")}>{v.soonLabel}</Link>
          {hasFilters && <Link href={withParams(sp, { disc: null, soon: null, sel: null })} className={pillClass("soft", "sm")}>Clear filters ✕</Link>}
        </div>
      </div>

      <div className="flex items-start gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-3.5">
          <span className="text-sm text-mute" aria-live="polite">{v.cards.length} {v.searched && v.criteria.length ? "people with documented matches" : "people"}</span>
          <div className={clsx("grid gap-4", sel ? "grid-cols-2 max-lg:grid-cols-1" : "grid-cols-3 max-xl:grid-cols-2 max-md:grid-cols-1")}>
            {v.cards.map(({ person, availability, matches }) => {
              const on = sel?.person.id === person.id;
              return (
                <Link key={person.id} scroll={false} href={withParams(sp, { sel: on ? null : person.id })} aria-current={on ? "true" : undefined}
                  style={on ? { boxShadow: "0 0 0 2px var(--color-ink)" } : undefined}
                  className="flex flex-col gap-4 rounded-card bg-white p-[22px] shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-card-lift">
                  <div className="flex w-full items-center gap-3.5">
                    <span className={clsx("inline-flex flex-none rounded-full", availability.confirmed ? "shadow-[0_0_0_3px_#fff,0_0_0_5px_var(--color-ok-ring)]" : "shadow-[0_0_0_3px_#fff,0_0_0_5px_var(--color-warn-ring)]")}><Portrait who={person.id} size={60} decorative /></span>
                    <div className="min-w-0 flex-1"><div className="text-[17px] font-medium tracking-[-0.01em]">{person.name}</div><div className="text-sm text-mute">{person.headline}</div></div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">{person.topSkills.map((s) => <Tag key={s}>{s}</Tag>)}</div>
                  {matches.length > 0 && (
                    <div className="flex flex-wrap gap-3 text-[13px]">
                      {matches.map((m) => (
                        <span key={m.capabilityId} className="inline-flex items-center gap-1.5" title={describeEvidence(m.level, m.verification).text}>
                          <EvidenceDot level={m.level} size={8} />
                          <span className={m.level === "professional" ? "text-ink" : m.level ? "text-ink-2" : "text-mute-2"}>{m.name}{m.level && m.level !== "professional" ? ` · ${sourceWord(m.level)}` : ""}{!m.level ? " · not documented" : ""}</span>
                          {m.needsConfirmation && m.verification && <VerificationBadge verification={m.verification} />}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-auto flex items-center gap-2 text-sm"><AvailabilityDot confirmed={availability.confirmed} />{availability.text}</div>
                </Link>
              );
            })}
          </div>
          {v.cards.length === 0 && (
            <div className="rounded-surface bg-white p-12 text-center shadow-card">
              <p className="text-lg">No documented matches yet.</p>
              <p className="text-mute">Remove a criterion or try another capability.</p>
            </div>
          )}
        </div>

        {sel && (
          <aside aria-label="Profile preview" className="sticky top-4 flex flex-[0_0_380px] flex-col gap-5 rounded-panel bg-white p-7 shadow-card max-lg:hidden">
            <div className="flex items-start justify-between">
              <Portrait who={sel.person.id} size={96} />
              <Link href={withParams(sp, { sel: null })} scroll={false} aria-label="Close preview" className={pillClass("default", "sm", "w-9 px-0")}>✕</Link>
            </div>
            <div><h2 className="text-[28px] font-normal tracking-[-0.025em]">{sel.person.name}</h2><p className="text-mute">{sel.person.headline} · {sel.person.location}</p></div>
            <div className="flex items-center gap-2.5 rounded-lg bg-white px-4 py-3.5 shadow-[inset_0_0_0_1px_var(--color-line)]">
              <AvailabilityDot confirmed={sel.availability.confirmed} size={9} />
              <span className="flex-1 text-sm">{sel.availability.text}</span>
              <span className="text-[13px] text-mute">{sel.availability.statusLabel}</span>
            </div>
            <p className="text-base leading-[1.55]">{sel.person.summary}</p>
            <div className="flex flex-col gap-2.5">
              <span className="text-[13px] text-mute">Documented experience</span>
              {sel.evidence.map((e) => <div key={e.id} className="flex flex-col"><span className="flex items-center gap-2 text-sm font-medium">{e.label}<VerificationBadge verification={e.verification} /></span><span className="text-[13px] text-mute">{e.detail}</span></div>)}
              <MoreExperience projects={sel.projects} />
            </div>
            <div className="flex flex-col gap-2">
              <Link href={`/people/${sel.person.id}`} className={pillClass("ink", "xl")}>Open Talent Passport</Link>
              <ShortlistButton key={sel.person.id} personId={sel.person.id} initialOn={sel.onShortlist} />
              <AddToCompareButton personId={sel.person.id} />
            </div>
          </aside>
        )}
      </div>
      <CompareTray />
      {/* Small screens: the preview is replaced by navigating to the passport (see responsive spec). */}
      {sel && <div className="hidden max-lg:block"><Link href={`/people/${sel.person.id}`} className={pillClass("ink", "xl", "w-full")}>Open {sel.person.name}’s passport</Link></div>}
    </main>
  );
}
