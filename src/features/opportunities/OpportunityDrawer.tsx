"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SparkGlyph } from "@/design-system/icons";
import { Drawer } from "@/design-system/overlays";
import { Portrait } from "@/design-system/Portrait";
import { pillClass } from "@/design-system/primitives";
import { ProvenanceTag } from "@/features/ask-sparq/client";

export type OpportunityDetail = {
  id: string; client: string; industry: string; name: string; description: string;
  kickoff: string; duration: string; lead: string; interestNote: string; summary: string[];
  viewerRole: string;
  roles: { id: string; title: string; caps: string; person: { id: string; name: string } | null; seat: "open" | "proposed" | "confirmed" }[];
  proposals: { id: string; label: string; href: string }[];
};
const SEAT_CHIP = { open: "Open", proposed: "Proposed", confirmed: "Confirmed" } as const;

/** Opportunity details drawer (URL-addressable: /opportunities?open=<id>). */
export function OpportunityDrawer({ detail, closeHref }: { detail: OpportunityDetail; closeHref: string }) {
  const router = useRouter();
  const [showSummary, setShowSummary] = useState(false);
  return (
    <Drawer open onOpenChange={(o) => { if (!o) router.push(closeHref, { scroll: false }); }} title={`${detail.client}, ${detail.name}`} width={540}
      header={
        <div className="flex items-start justify-between gap-3 px-[30px] pt-[30px]">
          <div><div className="text-sm text-mute">{detail.client} · {detail.industry}</div><h2 className="mt-1.5 text-[32px] leading-[1.1] font-light tracking-[-0.03em]">{detail.name}</h2></div>
          <Link href={closeHref} scroll={false} className={pillClass("default", "sm", "w-9 px-0")} aria-label="Close">✕</Link>
        </div>
      }
      footer={detail.viewerRole !== "staffing_lead" ? undefined : <><Link href="/planning" className={pillClass("default", "lg", "flex-1")}>See availability</Link><Link href={`/opportunities/new/team?from=${detail.id}`} className={pillClass("coral", "lg", "flex-[1.4]")}>Build the team</Link></>}>
      <div className="flex flex-col gap-2.5 rounded-xl px-[18px] py-4" style={{ background: "var(--gradient-ai-soft)" }}>
        {!showSummary ? (
          <button type="button" onClick={() => setShowSummary(true)} className="flex cursor-pointer items-center gap-2.5 border-0 bg-transparent p-0 text-left text-sm font-medium">
            <span className="inline-flex size-[30px] flex-none items-center justify-center rounded-full bg-coral"><SparkGlyph size={14} /></span>Summarize the requirements
          </button>
        ) : (
          <>
            <ProvenanceTag provenance="computed" />
            {detail.summary.map((l) => <div key={l} className="flex gap-2.5 text-sm"><span className="text-coral" aria-hidden="true">●</span><span>{l}</span></div>)}
          </>
        )}
      </div>
      <p className="text-base text-ink-2">{detail.description}</p>
      <div className="flex gap-8">
        {[["Kick-off", detail.kickoff], ["Duration", detail.duration], ["Delivery lead", detail.lead]].map(([k, v]) => (
          <div key={k}><div className="text-[13px] text-mute">{k}</div><div className="text-[22px] font-light">{v}</div></div>
        ))}
      </div>
      <div className="flex flex-col gap-2.5">
        <span className="text-[13px] text-mute">The team</span>
        {detail.roles.map((r) => (
          <div key={r.id} className="flex items-center gap-3.5 rounded-xl bg-surface-muted p-4">
            <div className="min-w-0 flex-1"><div className="font-medium">{r.title}</div><div className="text-[13px] text-mute">{r.caps}</div></div>
            {r.person
              ? <span className="flex items-center gap-2 text-[13px]">{detail.viewerRole === "staffing_lead" ? <Link href={`/people/${r.person.id}`} className="flex items-center gap-2"><Portrait who={r.person.id} size={32} decorative />{r.person.name}</Link> : <><Portrait who={r.person.id} size={32} decorative />{r.person.name}</>}<span className="rounded-pill bg-white px-2.5 py-0.5 text-xs">{SEAT_CHIP[r.seat]}</span></span>
              : detail.viewerRole === "staffing_lead" ? <Link href={`/opportunities/new/role?opportunity=${detail.id}&role=${r.id}`} className={pillClass("soft", "sm")}>Fill this role</Link> : <span className="rounded-pill bg-white px-2.5 py-0.5 text-xs">{SEAT_CHIP.open}</span>}
          </div>
        ))}
      </div>
      {detail.proposals.length > 0 && (
        <div className="flex flex-col gap-2"><span className="text-[13px] text-mute">Proposals</span>
          {detail.proposals.map((p) => <Link key={p.id} href={p.href} scroll={false} className="rounded-xl bg-surface-muted px-4 py-3 text-sm">{p.label}</Link>)}
        </div>
      )}
      <p className="text-[13px] text-mute">{detail.interestNote}</p>
    </Drawer>
  );
}
