"use client";
/**
 * Build a Team (client orchestration). State: the seats being composed, the brief, the note for the reviewer, the saved proposal
 * (id/state/review) and the open drawer/modal. Persistence goes through the injected actions (F3's server actions in the page).
 *
 * PROPOSED ≠ ASSIGNED: sending a proposal assigns nobody; "confirmed" seats come only from the server (a delivery lead confirmed
 * them); after sending, the canvas is read-only until the reviewer returns it.
 */
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { Toast } from "@/design-system/overlays";
import { pillClass } from "@/design-system/primitives";
import { PROPOSAL_STATE_LABEL, placePerson } from "@/domain/proposals";
import type { ProposalState, SaveProposalInput, TeamProposal } from "@/domain/schemas";
import { DescribeStage, type DraftLink } from "./DescribeStage";
import { ProposalModal } from "./ProposalModal";
import { SeatDrawer } from "./SeatDrawer";
import { TeamCanvas } from "./TeamCanvas";
import { ConflictsPanel, CoveragePanel, TimelinePanel } from "./panels";
import {
  ROLE_TEMPLATES, candidateViews, compareHref, composeSeats, conflictRows, coverageGroups, isReadOnly, newSeatKey, openSeatsLabel, placeToast, placedCount, reviewNotes,
  seatsFromProposal, summaryLine, timeline, toSaveSeats, type CandidateView, type TeamContext, type TeamOpportunity, type TeamSeat,
} from "./model";

type Result = { ok: true; proposal: TeamProposal } | { ok: false; error: string };

export type TeamBuilderProps = {
  /** Everything except the chosen opportunity (the client picks it). */
  base: Omit<TeamContext, "opportunity">;
  opportunities: (TeamOpportunity & { deliveryLeadId: string | null })[];
  /** Preselected opportunity (?from= / ?opp=) or the one of the reopened proposal. */
  initialOpportunityId: string | null;
  /** A reopened proposal (?proposal=). */
  proposal: TeamProposal | null;
  drafts: DraftLink[];
  actions: {
    save: (input: SaveProposalInput) => Promise<Result>;
    submit: (input: { id: string; note?: string }) => Promise<Result>;
    withdraw?: (input: { id: string }) => Promise<Result>;
  };
};

export function TeamBuilder({ base, opportunities, initialOpportunityId, proposal, drafts, actions }: TeamBuilderProps) {
  const [stage, setStage] = useState<"describe" | "canvas">(proposal ? "canvas" : "describe");
  const [oppId, setOppId] = useState<string | null>(proposal?.opportunityId ?? initialOpportunityId);
  const opp = opportunities.find((o) => o.id === oppId) ?? null;
  const [brief, setBrief] = useState(proposal?.brief || opp?.description || "");
  const [seats, setSeats] = useState<TeamSeat[]>(proposal ? seatsFromProposal(proposal) : []);
  const [note, setNote] = useState(proposal?.noteForReviewer ?? "");
  const [saved, setSaved] = useState<{ id: string | null; state: ProposalState | null; review: TeamProposal["review"]; version: number }>({ id: proposal?.id ?? null, state: proposal?.state ?? null, review: proposal?.review ?? null, version: proposal?.version ?? 1 });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [modal, setModal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(!proposal);
  const [error, setError] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);

  const ctx: TeamContext | null = useMemo(() => (opp ? { ...base, opportunity: opp } : null), [base, opp]);
  const readOnly = isReadOnly(saved.state);

  const chooseOpportunity = (id: string) => { setOppId(id); setBrief(opportunities.find((o) => o.id === id)?.description ?? ""); };
  const compose = () => {
    if (!opp) return;
    setSeats((cur) => (cur.length > 0 && saved.id ? cur : composeSeats(opp)));
    setStage("canvas"); setDirty(true);
    window.history.replaceState(null, "", saved.id ? `?proposal=${saved.id}` : `?opp=${opp.id}`);
  };

  const edit = (next: TeamSeat[]) => { if (readOnly) return; setSeats(next); setDirty(true); setError(null); };
  const patchSeat = (key: string, patch: Partial<TeamSeat>) => edit(seats.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const addRole = (t: (typeof ROLE_TEMPLATES)[number]) => { const key = newSeatKey(); edit([...seats, { key, roleRequirementId: null, title: t.title, capabilities: [...t.capabilities], seniority: t.seniority, allocation: 1, personId: null, confirmed: false }]); setAddOpen(false); setSelectedKey(key); };
  const removeSeat = (key: string) => { edit(seats.filter((s) => s.key !== key)); setSelectedKey(null); };

  const place = (seat: TeamSeat, v: CandidateView) => {
    const idx = seats.findIndex((s) => s.key === seat.key);
    const previous = seat.personId ? ctx?.candidates.find((c) => c.personId === seat.personId)?.name : undefined;
    edit(placePerson(seats, idx, v.action === "remove" ? null : v.personId));
    setToast(placeToast(v.action, v.name, seat.title, previous));
  };

  const payload = (): SaveProposalInput => ({
    ...(saved.id ? { id: saved.id } : {}), opportunityId: opp!.id, title: `${opp!.client} team`, brief, noteForReviewer: note, seats: toSaveSeats(seats),
  });
  /** Persist the draft; keeps local seat keys aligned with the server's (same order) so the open drawer survives. */
  const persist = async (): Promise<TeamProposal | null> => {
    const r = await actions.save(payload());
    if (!r.ok) { setError(r.error); return null; }
    setSeats((cur) => cur.map((s, i) => ({ ...s, key: r.proposal.seats[i]?.id ?? s.key })));
    setSelectedKey((k) => { const i = seats.findIndex((s) => s.key === k); return i >= 0 ? (r.proposal.seats[i]?.id ?? k) : k; });
    setSaved({ id: r.proposal.id, state: r.proposal.state, review: r.proposal.review, version: r.proposal.version });
    setDirty(false);
    window.history.replaceState(null, "", `?proposal=${r.proposal.id}`);
    return r.proposal;
  };
  const saveDraft = async () => {
    if (!opp || seats.length === 0 || busy) return;
    setBusy(true); const p = await persist(); setBusy(false);
    if (p) setToast("Draft saved · only visible to you"); else setToast("Couldn’t save the draft. Your team is still here.");
  };
  const send = async () => {
    if (!opp || placedCount(seats) === 0 || busy) return;
    setBusy(true); setError(null);
    const p = await persist();
    if (!p) { setBusy(false); return; }
    const r = await actions.submit({ id: p.id, note: note || undefined });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setSaved({ id: r.proposal.id, state: r.proposal.state, review: r.proposal.review, version: r.proposal.version });
    setSeats(seatsFromProposal(r.proposal)); setModal(false); setSelectedKey(null);
  };
  const withdraw = async () => {
    if (!saved.id || !actions.withdraw || busy) return;
    setBusy(true); const r = await actions.withdraw({ id: saved.id }); setBusy(false);
    if (r.ok) { setSaved({ id: r.proposal.id, state: r.proposal.state, review: r.proposal.review, version: r.proposal.version }); setToast("Proposal withdrawn"); } else setToast(r.error);
  };

  if (stage === "describe" || !ctx || !opp) {
    return <DescribeStage opportunities={opportunities} selectedId={oppId} onSelect={chooseOpportunity} brief={brief} onBrief={setBrief} onCompose={compose} drafts={drafts} canCompose={!!opp && !!opp.deliveryLeadId} />;
  }

  const reviewer = saved.review?.reviewerName || opp.deliveryLead || "the delivery lead of this opportunity";
  const selected = seats.find((s) => s.key === selectedKey) ?? null;
  const cands = selected ? candidateViews(ctx, seats, selected) : null;
  const { groups } = coverageGroups(ctx, seats);
  const conflicts = conflictRows(ctx, seats);
  const resubmit = saved.state === "changes_requested";
  const state = saved.state;
  const saveLabel = busy ? "Saving…" : !dirty && saved.id ? "✓ Saved" : "Save draft";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          {!readOnly && <button type="button" onClick={() => setStage("describe")} className="cursor-pointer self-start border-0 bg-transparent p-0 text-sm text-mute">← Edit the brief</button>}
          <h1 className="text-[44px] leading-[1.05] font-light tracking-[-0.035em] max-lg:text-4xl">{opp.client} <span className="font-medium">team</span></h1>
          <p className="text-base text-mute">{summaryLine(ctx, seats)}</p>
        </div>
        <div id="add-role-anchor" className="relative flex items-center gap-2">
          {!readOnly && <button type="button" className={pillClass("default", "lg")} aria-expanded={addOpen} onClick={() => setAddOpen((o) => !o)}>+ Add a role</button>}
          {addOpen && (
            <div role="menu" aria-label="Add a role" className="absolute top-[50px] left-0 z-20 w-[260px] rounded-xl bg-white p-2 shadow-popover">
              {ROLE_TEMPLATES.filter((t) => !seats.some((s) => s.title === t.title)).map((t) => (
                <button key={t.kind} type="button" role="menuitem" onClick={() => addRole(t)} className="block w-full cursor-pointer rounded-md border-0 bg-transparent px-3.5 py-3 text-left text-sm hover:bg-surface-muted">
                  <span className="block font-medium">{t.title}</span><span className="block text-xs text-mute">{t.capabilities.join(" · ")}</span>
                </button>
              ))}
              {ROLE_TEMPLATES.every((t) => seats.some((s) => s.title === t.title)) && <p className="px-3.5 py-3 text-sm text-mute">Every catalogue role is already on the canvas.</p>}
            </div>
          )}
          {!readOnly && <button type="button" className={pillClass("default", "lg")} onClick={saveDraft} disabled={busy || seats.length === 0}>{saveLabel}</button>}
          <button type="button" className={pillClass("ink", "lg")} onClick={() => { setError(null); setModal(true); setSelectedKey(null); }} disabled={readOnly || placedCount(seats) === 0 || busy}>
            {state === "submitted" ? "✓ Sent for review" : resubmit ? "Resubmit for review" : "Review & propose"}
          </button>
        </div>
      </div>

      {state && state !== "draft" && (
        <div role="status" className="flex flex-wrap items-center gap-3.5 rounded-card bg-ok-bg-2 px-5 py-4 data-[tone=warn]:bg-amber-bg" data-tone={state === "changes_requested" || state === "declined" || state === "withdrawn" ? "warn" : "ok"}>
          <span className="inline-flex size-8 flex-none items-center justify-center rounded-full bg-ok-bright text-white" aria-hidden="true">{state === "submitted" || state === "approved" ? "✓" : "!"}</span>
          <span className="min-w-[240px] flex-1 text-[15px]">
            <strong className="font-medium">{PROPOSAL_STATE_LABEL[state]}.</strong>{" "}
            {state === "submitted" && <>Proposal sent to <strong className="font-medium">{reviewer}</strong> for review. Nobody has been assigned; people are contacted only after review.</>}
            {state === "approved" && <>{reviewer} approved the proposal. Approval does not assign anyone: each seat is confirmed separately.</>}
            {state === "declined" && <>{reviewer} declined the proposal.{saved.review?.note ? ` “${saved.review.note}”` : ""}</>}
            {state === "changes_requested" && <>{reviewer} asked for changes.{saved.review?.note ? ` “${saved.review.note}”` : ""} Edit the team and resubmit.</>}
            {state === "withdrawn" && <>This proposal was withdrawn. Nobody has been assigned.</>}
          </span>
          {state === "submitted" && actions.withdraw && <button type="button" onClick={withdraw} disabled={busy} className={pillClass("default", "sm")}>Withdraw</button>}
          <Link href="/planning" className={pillClass("default", "sm")}>See availability</Link>
          <Link href="/" className={pillClass("default", "sm")}>Back home</Link>
        </div>
      )}

      {seats.length === 0 ? (
        <section aria-label="Team canvas" className="flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-surface bg-surface text-center shadow-card">
          <p className="text-2xl font-light">No roles on the canvas</p>
          <p className="max-w-[360px] text-mute">Add a role to start composing. The team is only a proposal until a delivery lead decides.</p>
          <button type="button" className={pillClass("default", "lg")} onClick={() => setAddOpen(true)}>+ Add a role</button>
        </section>
      ) : (
        <TeamCanvas ctx={ctx} seats={seats} selectedKey={selectedKey} onSelect={setSelectedKey} />
      )}

      <div className="grid grid-cols-2 items-start gap-4 max-lg:grid-cols-1">
        <CoveragePanel groups={groups} canEdit={!readOnly} onAddRole={() => { setAddOpen(true); document.getElementById("add-role-anchor")?.scrollIntoView?.({ behavior: "smooth", block: "center" }); }} />
        <ConflictsPanel rows={conflicts} openLabel={openSeatsLabel(seats)} onFind={readOnly ? undefined : setSelectedKey} />
      </div>
      <TimelinePanel timeline={timeline(ctx, seats)} />

      {selected && cands && (
        <SeatDrawer ctx={ctx} seat={selected} readOnly={readOnly} views={cands.views} uncatalogued={cands.uncatalogued} compareHref={compareHref(ctx, selected, cands.views)} reviewerName={reviewer}
          onClose={() => setSelectedKey(null)} onPatch={(p) => patchSeat(selected.key, p)} onPlace={(v) => place(selected, v)}
          onClearPerson={() => { patchSeat(selected.key, { personId: null }); setToast("Seat reopened"); }} onRemoveSeat={() => removeSeat(selected.key)} />
      )}

      <ProposalModal open={modal} onOpenChange={setModal} ctx={ctx} seats={seats} notes={reviewNotes(ctx, seats)} note={note} onNote={(v) => { setNote(v); setDirty(true); }} reviewer={reviewer}
        resubmit={resubmit} busy={busy} error={error} saveLabel={saveLabel} onSaveDraft={saveDraft} onSend={send} />
      <Toast message={toast} onDone={clearToast} ms={2400} />
    </div>
  );
}
