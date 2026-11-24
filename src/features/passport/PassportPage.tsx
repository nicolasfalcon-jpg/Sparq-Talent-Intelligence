import Link from "next/link";
import { Portrait } from "@/design-system/Portrait";
import { EvidenceLegend, pillClass, SkillChip } from "@/design-system/primitives";
import { ShortlistButton } from "@/features/shortlist/ShortlistButton";
import { ExportButton, OwnerActions, PassportSummaryCard, StaffCompareLink, WorkList } from "./client";
import type { PassportView } from "./queries";

/**
 * Talent Passport — V4.2 `v4-passport`. One component, two modes:
 * - staff: viewed by a staffing lead (shortlist, compare, preview profile)
 * - personal: the owner's own passport (edit, add experience, preview & export)
 */
export function PassportPage({ view, mode }: { view: PassportView; mode: "staff" | "personal" }) {
  const { person, first, availability } = view;
  const staff = mode === "staff";
  const [firstName, ...rest] = person.name.split(" ");

  return (
    <main className="mx-auto flex max-w-passport flex-col gap-14 px-10 pt-4 pb-[120px] max-xl:px-5">
      <div className="flex flex-col gap-4">
        <Link href={staff ? "/people" : "/me"} className={pillClass("default", "sm", "self-start")}>{staff ? "← People" : "← My space"}</Link>
        <section className="flex flex-wrap items-end justify-between gap-10 rounded-hero bg-white p-12 shadow-card max-lg:p-8">
          <div className="flex max-w-[680px] flex-col gap-[22px]">
            <span className="relative inline-flex self-start rounded-full bg-white p-1.5 shadow-portrait">
              <Portrait who={person.id} size={148} />
              <span title={availability.text} className={`absolute right-3 bottom-3 size-[22px] rounded-full border-4 border-white ${availability.confirmed ? "bg-ok-bright" : "bg-warn"}`} />
            </span>
            <div>
              <h1 className="text-[64px] leading-none font-light tracking-[-0.045em] max-lg:text-[48px]">{firstName} <span className="font-medium">{rest.join(" ")}</span></h1>
              <p className="mt-2.5 text-xl text-ink-2">{person.headline}</p>
            </div>
            <p className="text-[21px] leading-[1.5] font-light tracking-[-0.012em]">{person.summary}</p>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-mute">{view.meta.map((m) => <span key={m}>{m}</span>)}</div>
          </div>
          <div className="flex min-w-[280px] flex-col gap-3">
            <div className="flex flex-col gap-1 rounded-card bg-surface-muted px-[22px] py-5">
              <span className="text-[13px] text-mute">Availability</span>
              <span className="flex items-center gap-2.5 text-xl font-normal tracking-[-0.01em]"><span className={`size-[9px] rounded-full ${availability.confirmed ? "bg-ok" : "border-[1.5px] border-warn bg-white"}`} aria-hidden="true" />{availability.headline}</span>
              <span className="text-[13px] text-mute">{availability.detail}</span>
            </div>
            {staff ? (
              <>
                <div className="flex gap-2">
                  <ShortlistButton personId={person.id} initialOn={view.onShortlist} offVariant="coral" size="lg" className="flex-1" />
                  <StaffCompareLink personId={person.id} />
                </div>
                <ExportButton view={view} label="Preview profile" />
              </>
            ) : (
              <OwnerActions view={view} />
            )}
          </div>
        </section>
      </div>

      <PassportSummaryCard
        heading={staff ? `Ask Sparq can summarize ${first}’s documented experience for a specific need` : "See how your documented experience reads for a specific need"}
        needs={view.needs} staff={staff} personId={person.id} first={first}
      />

      <section className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-[36px] font-light tracking-[-0.03em]">What {first} <span className="font-medium">does best</span></h2>
          <EvidenceLegend />
        </div>
        <div className="grid grid-cols-3 gap-4 max-xl:grid-cols-2 max-md:grid-cols-1">
          {view.groups.map((g) => (
            <div key={g.title} className="flex flex-col gap-[18px] rounded-surface bg-white p-7 shadow-card">
              <div><div className="text-xl font-normal tracking-[-0.015em]">{g.title}</div><div className="text-[13px] text-mute">{g.description}</div></div>
              <div className="flex flex-wrap gap-2">{g.skills.map((k) => <SkillChip key={k.id} label={k.label} level={k.level} title={k.detail} isNew={k.selfReported} />)}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="text-[36px] font-light tracking-[-0.03em]">Selected <span className="font-medium">work</span></h2>
        <WorkList projects={view.projects} />
      </section>

      {person.journey.length > 0 && (
        <section className="flex flex-col gap-7">
          <h2 className="text-[36px] font-light tracking-[-0.03em]">The <span className="font-medium">journey</span></h2>
          <ol className="relative m-0 grid list-none grid-cols-4 gap-5 p-0 max-md:grid-cols-2">
            <div className="absolute top-2 right-2 left-2 h-0.5" style={{ background: "var(--gradient-journey)" }} aria-hidden="true" />
            {person.journey.map((j, i) => (
              <li key={j.when} className="relative flex flex-col gap-2.5">
                <span className="-mt-1 -ml-1 box-content size-[18px] rounded-full border-4 border-canvas" style={{ background: j.current ? "#F15B40" : i === person.journey.length - 2 ? "#F7A58E" : "#D2D2D7" }} aria-hidden="true" />
                <span className="text-sm text-mute">{j.when}</span>
                <span className="text-[19px] font-normal tracking-[-0.01em]">{j.role}</span>
                <span className="text-sm text-mute">{j.org}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4 max-lg:grid-cols-1">
        <section className="flex flex-col gap-[18px] rounded-surface bg-white p-8 shadow-card">
          <h2 className="text-2xl font-normal tracking-[-0.02em]">Learning &amp; certifications</h2>
          {person.certifications.length === 0 && <p className="text-mute">No certifications documented yet.</p>}
          {person.certifications.map((c) => <div key={c.name} className="flex justify-between gap-4"><span className="text-[15px]">{c.name}</span><span className="text-sm whitespace-nowrap text-mute">{c.date}</span></div>)}
        </section>
        <section className="flex flex-col gap-[18px] rounded-surface bg-white p-8 shadow-card">
          <h2 className="text-2xl font-normal tracking-[-0.02em]">Looking forward to</h2>
          {view.interestsOn.length === 0
            ? <p className="text-mute">{staff ? `${first} hasn’t shared career interests yet.` : "Add interests in “Edit my passport” to see matching opportunities."}</p>
            : <div className="flex flex-wrap gap-2">{view.interestsOn.map((i) => <span key={i} className="inline-flex h-9 items-center rounded-pill bg-surface-muted px-4 text-sm">{i}</span>)}</div>}
          {person.workPreferences && <p className="text-sm text-mute">{person.workPreferences}</p>}
        </section>
      </div>
      <p className="text-center text-[13px] text-mute">{person.passportUpdated ?? "Project evidence confirmed by delivery leads"} · fictional demo data</p>
    </main>
  );
}
