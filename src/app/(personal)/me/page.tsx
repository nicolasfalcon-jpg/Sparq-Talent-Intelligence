import Link from "next/link";
import { notFound } from "next/navigation";
import { guardPage } from "@/lib/access";
import { getSessionUser } from "@/lib/session";
import { getMeView } from "@/features/me/queries";
import { ExpressInterestButton, LookingFor } from "@/features/me/client";
import { DisplayTitle, pillClass, Tag } from "@/design-system/primitives";

export const metadata = { title: "My space" };

export default async function MySpace() {
  const user = await getSessionUser();
  if (!user.personId) notFound();
  const v = await guardPage(user, () => getMeView(user));
  if (!v) notFound();
  const count = v.fits.length;

  return (
    <main className="mx-auto flex max-w-page flex-col gap-8 px-10 pt-6 pb-[120px] max-xl:px-5">
      <header className="flex flex-col gap-2.5">
        <DisplayTitle light="Hi," strong={`${v.firstName}.`} />
        <p className="text-[17px] text-mute">{count > 0 ? `${count} open ${count === 1 ? "role fits" : "roles fit"} what you have documented or want to do next.` : "No open roles match yet. Keep your passport current and check back."}</p>
      </header>

      <div className="flex items-start gap-6 max-lg:flex-col">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <section aria-label="Now and next" className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
            <article className="flex flex-col gap-2 rounded-surface bg-white p-7 shadow-card">
              <span className="text-[13px] text-mute">Now</span>
              {v.now ? (<><span className="text-[22px] font-light tracking-[-0.02em]">{v.now.project}</span><span className="text-sm text-mute">{v.now.until ? `until ${v.now.until}` : "ongoing"}{v.now.allocationNote ? ` · ${v.now.allocationNote}` : ""}</span></>) : <span className="text-[22px] font-light tracking-[-0.02em]">No assignment right now</span>}
            </article>
            <article className="flex flex-col gap-2 rounded-surface bg-white p-7 shadow-card">
              <span className="text-[13px] text-mute">Next</span>
              <span className="text-[22px] font-light tracking-[-0.02em]">{v.next.headline}</span>
              <span className="text-sm text-mute">{v.next.detail}</span>
            </article>
          </section>

          <section aria-label="What I’m looking for" className="flex flex-col gap-4 rounded-surface bg-white p-7 shadow-card">
            <div><h2 className="text-xl font-medium tracking-[-0.015em]">What I’m looking for</h2><p className="text-sm text-mute">Tell staffing which technical areas you’d like to grow into. It’s never used to evaluate you.</p></div>
            <LookingFor all={v.interestsAll} shared={v.interestsShared} />
          </section>

          <section aria-label="Opportunities that fit you" className="flex flex-col gap-4">
            <h2 className="text-xl font-medium tracking-[-0.015em]">Opportunities that fit you</h2>
            {v.fits.length === 0 && <p className="rounded-surface bg-white p-8 text-mute shadow-card">No open opportunities match yet. Update your skills or interests to see more.</p>}
            {v.fits.map((f) => (
              <article key={f.roleId} className="flex flex-col gap-4 rounded-surface bg-white p-7 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div><h3 className="text-[22px] font-light tracking-[-0.02em]">{f.client} · <span className="font-medium">{f.roleTitle}</span></h3><p className="text-sm text-mute">{f.opportunityName} · starts {f.startsLabel} · {f.durationMonths} months</p></div>
                  <ExpressInterestButton roleId={f.roleId} roleTitle={f.roleTitle} client={f.client} shared={f.shared} availabilityText={v.availabilityText} />
                </div>
                <p className="text-[15px] leading-[1.5]">{f.description}</p>
                <div className="flex flex-col gap-2"><span className="text-[13px] text-mute">Why you’re seeing this</span>
                  <div className="flex flex-wrap gap-1.5">
                    {f.reasons.skills.map((s) => <Tag key={`s-${s}`}>Your skill: {s}</Tag>)}
                    {f.reasons.interests.map((s) => <span key={`i-${s}`} className="inline-flex h-7 items-center rounded-pill bg-coral-tint px-3 text-[13px] font-medium text-ink">Your interest: {s}</span>)}
                  </div>
                </div>
              </article>
            ))}
          </section>

          {v.shared.length > 0 && (
            <section aria-label="Interests you’ve shared" className="flex flex-col gap-3 rounded-surface bg-white p-7 shadow-card">
              <div><h2 className="text-xl font-medium tracking-[-0.015em]">Interests you’ve shared</h2><p className="text-sm text-mute">Only staffing leads and the opportunity’s delivery lead can see these.</p></div>
              {v.shared.map((s) => (
                <div key={s.roleRequirementId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-muted px-4 py-3">
                  <span className="text-sm">{s.client} · {s.roleTitle} <span className="text-mute">· shared {s.sharedOn}</span></span>
                  <ExpressInterestButton roleId={s.roleRequirementId} roleTitle={s.roleTitle} client={s.client} shared availabilityText={v.availabilityText} />
                </div>
              ))}
            </section>
          )}
        </div>

        <aside aria-label="My Talent Passport" className="flex flex-[0_0_340px] flex-col gap-5 rounded-panel bg-white p-7 shadow-card max-lg:w-full max-lg:flex-none">
          <div className="flex items-center justify-between"><h2 className="text-xl font-medium tracking-[-0.015em]">My Talent Passport</h2><Link href="/me/passport" className={pillClass("ink", "sm")}>View</Link></div>
          <p className="text-sm text-mute">{v.checklistDone} of {v.checklist.length} things in place. A hint about your passport, not about you.</p>
          <ul className="flex flex-col gap-3">
            {v.checklist.map((c) => (
              <li key={c.key} className="flex items-start gap-3 text-sm">
                <span aria-hidden="true" className={c.done ? "mt-0.5 inline-flex size-[18px] flex-none items-center justify-center rounded-full bg-ok text-[11px] text-white" : "mt-0.5 inline-block size-[18px] flex-none rounded-full border-[1.5px] border-dashed border-line-strong"}>{c.done ? "✓" : ""}</span>
                <span><span className={c.done ? "text-ink" : "text-ink-2"}>{c.label}</span>{!c.done && <span className="block text-[13px] text-mute">{c.hint}</span>}</span>
              </li>
            ))}
          </ul>
          <Link href="/me/passport" className={pillClass("default", "lg")}>Update my passport</Link>
        </aside>
      </div>
    </main>
  );
}
