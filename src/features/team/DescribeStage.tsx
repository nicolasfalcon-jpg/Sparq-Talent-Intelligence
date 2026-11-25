"use client";
/**
 * Describe stage. The V4.2 "describe the project" step becomes choosing one of the EXISTING opportunities (a brand-new
 * opportunity would have no delivery lead to review it). The brief is prefilled from the opportunity and the team is composed
 * deterministically from its role requirements: no model is involved here.
 */
import Link from "next/link";
import { clsx } from "clsx";
import { formatShortDate } from "@/domain/dates";
import { SparqBadge, pillClass } from "@/design-system/primitives";
import { PROPOSAL_STATE_LABEL } from "@/domain/proposals";
import type { ProposalState } from "@/domain/schemas";
import { durationLabel, type TeamOpportunity } from "./model";

export type DraftLink = { id: string; title: string; opportunityName: string; state: ProposalState };

export function DescribeStage({ opportunities, selectedId, onSelect, brief, onBrief, onCompose, drafts, canCompose }: {
  opportunities: (TeamOpportunity & { deliveryLeadId: string | null })[]; selectedId: string | null; onSelect: (id: string) => void;
  brief: string; onBrief: (v: string) => void; onCompose: () => void; drafts: DraftLink[]; canCompose: boolean;
}) {
  const selected = opportunities.find((o) => o.id === selectedId) ?? null;
  return (
    <div className="flex flex-wrap items-stretch gap-7">
      <section className="relative flex min-h-[660px] max-w-[540px] min-w-[320px] flex-[1_1_420px] flex-col gap-[18px] overflow-hidden rounded-feature p-8 shadow-ai-card max-md:p-6" style={{ background: "var(--gradient-ai-card)" }}>
        <div className="flex items-center gap-3"><SparqBadge size={44} glyph={20} /><span className="font-medium">Ask Sparq</span></div>
        <div className="min-h-6 flex-1" />
        <h1 className="text-[40px] leading-[1.1] font-light tracking-[-0.035em] max-lg:text-[34px]">Pick the project. <span className="font-medium">I’ll compose the team.</span></h1>
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="sr-only-v">Opportunity</legend>
          {opportunities.map((o) => (
            <label key={o.id} className={clsx("flex cursor-pointer items-center gap-3 rounded-lg bg-white px-4 py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-coral", selectedId === o.id && "ring-2 ring-ink")}>
              <input type="radio" name="opportunity" value={o.id} checked={selectedId === o.id} onChange={() => onSelect(o.id)} className="size-4 accent-ink" />
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{o.client} · {o.name}</span><span className="block text-xs text-mute">Kick-off {formatShortDate(o.kickoff)} · {durationLabel(o.durationMonths)} · {o.roles.length} roles{o.deliveryLead ? ` · reviewer ${o.deliveryLead}` : " · no delivery lead assigned"}</span></span>
            </label>
          ))}
        </fieldset>
        <div className="rounded-card bg-white px-5 py-[18px]">
          <label htmlFor="team-brief" className="sr-only-v">Project description</label>
          <textarea id="team-brief" rows={5} value={brief} maxLength={2000} onChange={(e) => onBrief(e.target.value)} placeholder="Choose an opportunity to see its description."
            className="w-full resize-none border-0 bg-transparent text-base leading-[1.6] text-ink" />
        </div>
        {selected && !selected.deliveryLeadId && <p role="alert" className="text-sm text-coral-hover">This opportunity has no delivery lead yet, so a proposal could not be reviewed. Ask an administrator to assign one.</p>}
        <div className="flex items-center justify-between gap-3">
          <Link href="/opportunities/new/role" className="text-[13px] text-mute underline underline-offset-[3px]">Only need one person? Fill a role</Link>
          <button type="button" onClick={onCompose} disabled={!canCompose} className={pillClass("coral", "xl", "px-[26px]")}>Compose the team</button>
        </div>
        {drafts.length > 0 && (
          <div className="flex flex-col gap-1.5 border-t border-white/70 pt-3">
            <span className="text-[13px] text-mute">Your drafts</span>
            {drafts.map((d) => <Link key={d.id} href={`/opportunities/new/team?proposal=${d.id}`} className="flex items-center justify-between rounded-md bg-white/80 px-3 py-2 text-sm hover:bg-white"><span>{d.title}</span><span className="text-xs text-mute">{PROPOSAL_STATE_LABEL[d.state]}</span></Link>)}
          </div>
        )}
      </section>
      <section aria-label="Your team canvas" className="relative min-h-[660px] flex-[999_1_520px] overflow-hidden rounded-surface bg-surface shadow-card" style={{ backgroundImage: "radial-gradient(var(--color-line) 1.2px, transparent 1.2px)", backgroundSize: "24px 24px" }}>
        <div className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3.5 text-center">
          <div className="flex gap-[18px]" aria-hidden="true">
            <span className="size-[72px] rounded-full border-[1.5px] border-dashed border-seat-empty bg-white" /><span className="-mt-[26px] size-[72px] rounded-full border-[1.5px] border-dashed border-seat-empty bg-white" /><span className="size-[72px] rounded-full border-[1.5px] border-dashed border-seat-empty bg-white" />
          </div>
          <p className="mt-2.5 text-2xl font-light tracking-[-0.02em]">Your team canvas</p>
          <p className="max-w-[340px] text-mute">Roles appear as seats. Click a seat to explore people with documented experience and place them.</p>
        </div>
      </section>
    </div>
  );
}
