"use client";
/**
 * Proposal review and explicit assignment confirmation (delivery lead), and a read-only view for staffing leads.
 * APPROVING ASSIGNS NOBODY. Confirming a seat is a separate, explicit act with dates and allocation; the server refuses it when the
 * person would go above full-time. Everything shown is documented evidence, availability and coverage: no score, no ranking.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { clsx } from "clsx";
import { addDays, formatShortDate } from "@/domain/dates";
import { PROPOSAL_STATE_LABEL } from "@/domain/proposals";
import type { ReviewDecision } from "@/domain/schemas";
import { Modal } from "@/design-system/overlays";
import { Portrait } from "@/design-system/Portrait";
import { EvidenceDot, pillClass } from "@/design-system/primitives";
import { confirmSeatAction, reviewProposalAction } from "@/features/proposals/actions";
import type { ProposalView, SeatView } from "@/features/proposals/view";

const chip: Record<string, string> = { open: "bg-surface-muted text-ink-2", proposed: "bg-[#FFE4D6] text-ink", confirmed: "bg-[#DDF1E5] text-ink" };
const SEAT_LABEL = { open: "Open", proposed: "Proposed", confirmed: "Confirmed" } as const;

/** List of proposals as cards (the "Proposals to review" section). */
export function ProposalList({ views, heading, hrefs, empty }: { views: ProposalView[]; heading: string; /** proposal id → link (data, not a function: this is a client component) */ hrefs: Record<string, string>; empty?: string }) {
  return (
    <section aria-label={heading} className="flex flex-col gap-3">
      <h2 className="text-[22px] font-light tracking-[-0.02em]">{heading}</h2>
      {views.length === 0 && empty && <p className="rounded-panel bg-white px-5 py-4 text-sm text-mute shadow-card">{empty}</p>}
      {views.map((v) => {
        const filled = v.seats.filter((s) => s.person).length;
        return (
          <Link key={v.proposal.id} href={hrefs[v.proposal.id] ?? "/opportunities"} scroll={false} className="flex flex-wrap items-center gap-4 rounded-panel bg-white px-5 py-4 shadow-card transition-shadow hover:shadow-card-lift">
            <div className="flex -space-x-2" aria-hidden="true">{v.seats.filter((s) => s.person).slice(0, 4).map((s) => <span key={s.seat.id} className="rounded-full ring-2 ring-white"><Portrait who={s.person!.id} size={36} decorative /></span>)}</div>
            <div className="min-w-[200px] flex-1"><div className="font-medium">{v.opportunity ? `${v.opportunity.client} · ${v.opportunity.name}` : v.proposal.title}</div><div className="text-[13px] text-mute">{filled} of {v.seats.length} seats proposed · by {v.proposal.createdByName}{v.proposal.version > 1 ? ` · version ${v.proposal.version}` : ""}</div></div>
            <span className="rounded-pill bg-surface-muted px-3 py-1 text-[13px]">{PROPOSAL_STATE_LABEL[v.proposal.state]}</span>
          </Link>
        );
      })}
    </section>
  );
}

function SeatCard({ s, view, canConfirm, onChanged }: { s: SeatView; view: ProposalView; canConfirm: boolean; onChanged: () => void }) {
  const opp = view.opportunity;
  const [form, setForm] = useState(false);
  const [startsOn, setStartsOn] = useState(opp?.kickoff ?? "");
  const [endsOn, setEndsOn] = useState(opp ? addDays(opp.kickoff, opp.durationMonths * 30 - 1) : "");
  const [alloc, setAlloc] = useState(String(s.seat.allocation));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    setBusy(true); setError(null);
    const r = await confirmSeatAction({ seatId: s.seat.id, startsOn, endsOn: endsOn || null, availableFrom: endsOn ? addDays(endsOn, 1) : null, allocation: Number(alloc) });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setForm(false); onChanged();
  };
  return (
    <div className="flex flex-col gap-3 rounded-[22px] bg-surface-muted p-4">
      <div className="flex flex-wrap items-center gap-3">
        {s.person ? <Portrait who={s.person.id} size={44} decorative /> : <span className="inline-flex size-11 items-center justify-center rounded-full border-[1.5px] border-dashed border-line-strong text-mute" aria-hidden="true">+</span>}
        <div className="min-w-[180px] flex-1"><div className="font-medium">{s.seat.title}{s.seat.seniority ? ` · ${s.seat.seniority}` : ""} <span className="font-normal text-mute">· {s.seat.allocation === 1 ? "Full-time" : `${s.seat.allocation} FTE`}</span></div>
          <div className="text-[13px] text-mute">{s.person ? <Link href={`/people/${s.person.id}`} className="underline">{s.person.name}</Link> : "Open seat"}{s.fit ? <span className={s.fit.conflict ? "text-warn-text" : ""}> · {s.fit.text}</span> : null}</div></div>
        <span className={clsx("rounded-pill px-3 py-1 text-[13px]", chip[s.seat.seatState])}>{SEAT_LABEL[s.seat.seatState]}</span>
      </div>
      {s.person && <div className="flex flex-col gap-1 text-[13px]">{s.evidence.map((e) => <span key={e.label} className="flex items-center gap-2"><EvidenceDot level={e.level as never} /><strong className="font-medium">{e.label}</strong> · {e.text}</span>)}</div>}
      {canConfirm && s.person && s.seat.seatState !== "confirmed" && (
        !form ? <button type="button" onClick={() => setForm(true)} className={pillClass("ink", "sm", "self-start")}>Confirm assignment</button> : (
          <div className="flex flex-col gap-2.5 rounded-xl bg-white p-3.5">
            <p className="text-[13px] text-mute">Confirming makes {s.person.name} assigned. This is separate from approving the proposal.</p>
            <div className="flex flex-wrap gap-3 text-[13px]">
              <label className="flex flex-col gap-1">Starts<input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className="h-10 rounded-pill bg-surface-muted px-3 text-sm text-ink" /></label>
              <label className="flex flex-col gap-1">Last day (optional)<input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className="h-10 rounded-pill bg-surface-muted px-3 text-sm text-ink" /></label>
              <label className="flex flex-col gap-1">Allocation<select value={alloc} onChange={(e) => setAlloc(e.target.value)} className="h-10 rounded-pill bg-surface-muted px-3 text-sm text-ink">{[1, 0.75, 0.5, 0.25].map((a) => <option key={a} value={a}>{a === 1 ? "Full-time" : `${a} FTE`}</option>)}</select></label>
            </div>
            {error && <p role="alert" className="text-sm text-coral-strong">{error}</p>}
            <div className="flex gap-2"><button type="button" disabled={busy || !startsOn} onClick={confirm} className={pillClass("coral", "sm")}>{busy ? "Confirming…" : "Confirm"}</button><button type="button" onClick={() => setForm(false)} className={pillClass("soft", "sm")}>Cancel</button></div>
          </div>
        )
      )}
    </div>
  );
}

export function ProposalReviewModal({ view, canReview, closeHref }: { view: ProposalView; canReview: boolean; closeHref: string }) {
  const router = useRouter();
  const p = view.proposal;
  const [decision, setDecision] = useState<ReviewDecision>("approved");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = () => router.refresh();
  const submit = async () => {
    setBusy(true); setError(null);
    const r = await reviewProposalAction({ id: p.id, decision, note });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    changed();
  };
  const cov = view.coverage;
  const group = (title: string, items: string[], text: string) => items.length > 0 && <div key={title}><div className="text-sm font-medium">{title} · {items.length}</div><div className="text-[13px] text-mute">{items.join(", ")}. {text}</div></div>;
  return (
    <Modal open onOpenChange={(o) => { if (!o) router.push(closeHref, { scroll: false }); }} title="Proposal for human review" className="max-w-[760px] bg-white p-8">
      <div className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-3">
          <div><div className="text-sm text-mute">{view.opportunity ? `${view.opportunity.client} · kick-off ${formatShortDate(view.opportunity.kickoff)}` : "Proposal"} · by {p.createdByName} · {PROPOSAL_STATE_LABEL[p.state]}{p.version > 1 ? ` · version ${p.version}` : ""}</div>
            <h2 className="text-[30px] leading-[1.1] font-light tracking-[-0.03em]">{view.opportunity?.name ?? p.title}</h2></div>
          <Link href={closeHref} scroll={false} aria-label="Close" className={pillClass("default", "sm", "w-9 px-0")}>✕</Link>
        </div>
        {p.noteForReviewer && <p className="rounded-xl bg-surface-muted p-3.5 text-sm"><span className="text-mute">Note from {p.createdByName}: </span>{p.noteForReviewer}</p>}
        <div className="flex flex-col gap-2.5">{view.seats.map((s) => <SeatCard key={s.seat.id} s={s} view={view} canConfirm={canReview && p.state === "approved"} onChanged={changed} />)}</div>
        <div className="flex flex-col gap-2 rounded-xl border border-line p-4">
          <div className="text-[13px] text-mute">To confirm during review</div>
          {view.notes.map((n) => <div key={n} className="flex gap-2 text-sm"><span className="text-coral" aria-hidden="true">●</span>{n}</div>)}
        </div>
        <div className="flex flex-col gap-2.5"><div className="text-[13px] text-mute">Coverage, from documented capabilities</div>
          {group("Documented on this team", cov.documented, "Professional project experience recorded in a passport.")}
          {group("Training or independent work only", cov.trainingOrIndependent, "Learning is documented; client project experience is not yet.")}
          {group("Not documented", cov.notDocumented, "May be a real gap or simply undocumented: ask the people involved.")}
          {group("Waiting on an open seat", cov.waitingOnOpenSeats, "Propose someone for these roles to see coverage.")}
        </div>
        {p.review && <p className="rounded-xl bg-surface-muted p-3.5 text-sm"><strong>{p.review.reviewerName}</strong>: {p.review.decision === "approved" ? "Approved" : p.review.decision === "declined" ? "Declined" : "Asked for changes"}{p.review.note ? ` · “${p.review.note}”` : ""}</p>}
        {canReview && p.state === "submitted" && (
          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <div role="radiogroup" aria-label="Decision" className="flex flex-wrap gap-2">
              {([["approved", "Approve"], ["changes_requested", "Request changes"], ["declined", "Decline"]] as const).map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={decision === v} onClick={() => setDecision(v)} className={pillClass(decision === v ? "ink" : "default", "md")}>{l}</button>
              ))}
            </div>
            <label className="flex flex-col gap-1.5 text-[13px] text-mute">{decision === "approved" ? "Note (optional)" : "Note for the author (required)"}
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} className="rounded-xl bg-surface-muted p-3 text-sm text-ink" /></label>
            <p className="text-[13px] text-mute">Approving does not assign anyone. After approving you confirm each seat separately.</p>
            {error && <p role="alert" className="text-sm text-coral-strong">{error}</p>}
            <div className="flex justify-end"><button type="button" disabled={busy || (decision !== "approved" && !note.trim())} onClick={submit} className={pillClass("coral", "lg")}>{busy ? "Saving…" : "Record decision"}</button></div>
          </div>
        )}
        {canReview && p.state === "approved" && <p className="text-[13px] text-mute">Approved. Confirm each seat above to create its assignment. Nobody is assigned until you do.</p>}
      </div>
    </Modal>
  );
}
