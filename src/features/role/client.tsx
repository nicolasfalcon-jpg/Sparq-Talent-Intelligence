"use client";
/**
 * Fill a Role (V4.2 `v4-role`): requirements → people → sent. Deterministic: requirements come from the role, candidates from
 * documented evidence (`candidatesForSeat`, ordered by documented evidence then availability; never a score).
 * Proposing is not assigning: "Send" creates a one-seat proposal for the opportunity's delivery lead to review.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { clsx } from "clsx";
import type { Capability, Seniority, SkillEvidence, TeamProposal } from "@/domain/schemas";
import type { Availability, Person } from "@/domain/schemas";
import { PROPOSAL_STATE_LABEL, candidatesForSeat, isEditableState, resolveCapability, seatFit } from "@/domain/proposals";
import { bestEvidence, describeEvidence } from "@/domain/rules";
import { formatShortDate } from "@/domain/dates";
import { SparkGlyph } from "@/design-system/icons";
import { Modal, Toast } from "@/design-system/overlays";
import { Portrait } from "@/design-system/Portrait";
import { AvailabilityDot, DisplayTitle, EvidenceDot, EvidenceLegend, pillClass } from "@/design-system/primitives";
import { saveProposalAction, submitProposalAction } from "@/features/proposals/actions";

export type RoleCandidate = { person: Person; evidence: SkillEvidence[]; availability: Availability };
export type RoleContext = {
  opportunity: { id: string; client: string; name: string; description: string; kickoff: string; durationMonths: number };
  reviewerName: string | null;
  role: { id: string; title: string; capabilities: string[] } | null;
  proposal: TeamProposal | null;
  candidates: RoleCandidate[];
  capabilities: Capability[];
  shortlist: string[];
  /** Person ids that shared an expression of interest in this role. */
  interestedIds: string[];
  today: string;
};
type Req = { label: string; must: boolean; source: string };

const NICE_RE = /\n*Nice to have: (.*)$/;
const LEVELS: Seniority[] = ["Mid", "Senior", "Lead"];
const ALLOCS: { n: string; v: number }[] = [{ n: "Full-time", v: 1 }, { n: "Half-time", v: 0.5 }];

function initialReqs(c: RoleContext): Req[] {
  const seat = c.proposal?.seats[0];
  if (seat) {
    const nice = (NICE_RE.exec(c.proposal?.brief ?? "")?.[1] ?? "").split(", ").filter(Boolean);
    return [...seat.capabilities.map((label) => ({ label, must: true, source: "Saved with the draft" })), ...nice.map((label) => ({ label, must: false, source: "Saved with the draft" }))];
  }
  return (c.role?.capabilities ?? []).map((label) => ({ label, must: true, source: "From the role’s requirements" }));
}

const SYSTEM_BG = { background: "radial-gradient(120% 60% at 0% 0%, #FFE4D6 0%, #F7EEF8 55%, #EEF0FA 100%)" };

export function FillRole({ ctx }: { ctx: RoleContext }) {
  const router = useRouter();
  const initialSeat = ctx.proposal?.seats[0] ?? null;
  const locked = ctx.proposal ? !isEditableState(ctx.proposal.state) : false;
  const [stage, setStage] = useState<"review" | "people" | "sent">(locked || ctx.proposal?.state === "submitted" ? "sent" : initialSeat?.personId ? "people" : "review");
  const [title, setTitle] = useState(initialSeat?.title ?? ctx.role?.title ?? "");
  const [level, setLevel] = useState<Seniority | null>(initialSeat?.seniority ?? "Senior");
  const [alloc, setAlloc] = useState(initialSeat?.allocation ?? 1);
  const [reqs, setReqs] = useState<Req[]>(() => initialReqs(ctx));
  const [newReq, setNewReq] = useState("");
  const [proposed, setProposed] = useState<string | null>(initialSeat?.personId ?? null);
  const [proposalId, setProposalId] = useState<string | null>(ctx.proposal?.id ?? null);
  const [state, setState] = useState(ctx.proposal?.state ?? "draft");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [dialog, setDialog] = useState(false);
  const [note, setNote] = useState(ctx.proposal?.noteForReviewer ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readOnly = stage === "sent" && state !== "changes_requested";

  const labels = reqs.map((r) => r.label);
  const { matches } = useMemo(() => candidatesForSeat(labels, ctx.candidates, ctx.capabilities), [labels.join("|"), ctx.candidates, ctx.capabilities]); // eslint-disable-line react-hooks/exhaustive-deps
  const byId = new Map(ctx.candidates.map((c) => [c.person.id, c]));
  const people = matches.map((m) => byId.get(m.personId)).filter((c): c is RoleCandidate => !!c);
  const proposedRow = proposed ? byId.get(proposed) : undefined;
  const first = (n: string) => n.split(" ")[0] ?? n;
  const { opportunity: opp } = ctx;

  const toggleReq = (label: string) => setReqs((rs) => rs.map((r) => (r.label === label ? { ...r, must: !r.must } : r)));
  const addReq = () => {
    const l = newReq.trim();
    if (!l || reqs.some((r) => r.label.toLowerCase() === l.toLowerCase())) { setNewReq(""); return; }
    setReqs((rs) => [...rs, { label: l, must: true, source: "Added by you" }]);
    setNewReq("");
  };
  const propose = (id: string, name: string) => {
    if (readOnly) return;
    if (proposed === id) { setProposed(null); setToast(`${name} removed`); return; }
    const prev = proposedRow?.person.name;
    setProposed(id);
    setToast(prev ? `${name} replaces ${prev}` : `${name} proposed`);
  };

  const payload = () => {
    const musts = reqs.filter((r) => r.must).map((r) => r.label);
    const nice = reqs.filter((r) => !r.must).map((r) => r.label);
    return {
      ...(proposalId ? { id: proposalId } : {}), opportunityId: opp.id, title: `${opp.client} · ${title || "Role"}`,
      brief: `${opp.description}${nice.length ? `\n\nNice to have: ${nice.join(", ")}` : ""}`.slice(0, 2000), noteForReviewer: note,
      seats: [{ roleRequirementId: ctx.role?.id ?? null, title: title || "Role", capabilities: musts, seniority: level, allocation: alloc, personId: proposed }],
    };
  };
  const save = async (): Promise<string | null> => {
    const r = await saveProposalAction(payload());
    if (!r.ok) { setError(r.error); return null; }
    setProposalId(r.proposal.id);
    return r.proposal.id;
  };
  const saveDraft = async () => {
    setBusy(true); setError(null);
    const id = await save();
    setBusy(false);
    if (id) { setToast("Draft saved · only visible to you"); router.replace(`/opportunities/new/role?proposal=${id}`, { scroll: false }); }
  };
  const send = async () => {
    setBusy(true); setError(null);
    const id = await save();
    if (!id) { setBusy(false); return; }
    const r = await submitProposalAction({ id, note });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setState(r.proposal.state); setStage("sent"); setDialog(false);
    router.replace(`/opportunities/new/role?proposal=${id}`, { scroll: false });
  };

  const needsMsg = people.length === 0 ? "No one has documented experience with these capabilities yet. Try making one a nice to have." : `${people.length} ${people.length === 1 ? "person has" : "people have"} documented experience with at least one capability. I show where experience is documented. I don’t rank or decide.`;

  return (
    <main className="mx-auto flex max-w-page flex-wrap items-start gap-7 px-10 pt-3 pb-[140px] max-xl:px-5">
      <section aria-label="Conversation with Ask Sparq" className="relative flex min-h-[560px] max-w-[440px] flex-[1_1_380px] flex-col gap-4 overflow-hidden rounded-[36px] p-7 lg:sticky lg:top-4" style={SYSTEM_BG}>
        <div className="relative flex items-center gap-3"><span className="inline-flex size-11 items-center justify-center rounded-full bg-coral"><SparkGlyph size={20} /></span><span className="font-medium">Ask Sparq</span></div>
        <div className="min-h-10 flex-1" />
        <p className="relative text-[26px] leading-[1.25] font-light tracking-[-0.025em]">{stage === "review" ? <>Which role is this? <span className="font-medium">Review what it needs.</span></> : stage === "people" ? <>Here is who has <span className="font-medium">documented experience.</span></> : <>Sent for <span className="font-medium">human review.</span></>}</p>
        <div className="relative self-end rounded-[22px] rounded-br-[6px] bg-ink px-4 py-3 text-sm text-white">{opp.client} · {title || "Role"}</div>
        {stage === "review" && <div className="relative rounded-[22px] bg-white/90 px-[18px] py-4 text-sm">I took the requirements from the role. <span className="text-mute">Tap a capability to switch must-have and nice to have. Nothing is decided automatically.</span></div>}
        {stage !== "review" && <div className="relative rounded-[22px] bg-white/90 px-[18px] py-4 text-sm">{needsMsg} <span className="text-mute">Ordered by documented evidence, then availability.</span></div>}
      </section>

      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
        <div className="flex flex-col gap-1.5 pt-2">
          <Link href="/opportunities" className="text-sm text-mute">← Opportunities</Link>
          <DisplayTitle light={`${opp.client} ·`} strong={title || "New role"} size={36} />
        </div>

        {stage === "sent" && (
          <div role="status" className="flex flex-wrap items-center gap-3.5 rounded-panel px-5 py-4" style={{ background: state === "declined" ? "#FDEDEA" : "#EEF7F1" }}>
            <span className="inline-flex size-8 items-center justify-center rounded-full bg-ok text-white" aria-hidden="true">✓</span>
            <span className="flex-1 text-[15px]">
              {state === "submitted" && <><strong>{proposedRow?.person.name ?? "Your proposal"}</strong> was sent to <strong>{ctx.reviewerName ?? "the delivery lead"}</strong> for review. Nobody has been assigned.</>}
              {state === "approved" && <>Approved by {ctx.proposal?.review?.reviewerName ?? "the delivery lead"}. The delivery lead confirms the assignment separately: nobody is assigned yet.</>}
              {state === "declined" && <>Declined: {ctx.proposal?.review?.note}</>}
              {state === "changes_requested" && <>{ctx.proposal?.review?.reviewerName} asked for changes: “{ctx.proposal?.review?.note}”. Edit and send it again.</>}
              {state === "withdrawn" && <>This proposal was withdrawn. Nobody was assigned.</>}
            </span>
            <span className="text-[13px] text-mute">{PROPOSAL_STATE_LABEL[state]}</span>
            <Link href="/opportunities" className={pillClass("default", "sm")}>Back to opportunities</Link>
          </div>
        )}
        {error && <p role="alert" className="rounded-panel bg-[#FDEDEA] px-5 py-3 text-sm text-ink">{error}</p>}

        <section className="flex flex-col gap-5 rounded-surface bg-white p-[28px_30px] shadow-card">
          {!ctx.role && stage !== "sent" && (
            <label className="flex flex-col gap-1.5 text-sm text-mute">Role title
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. QA Automation Engineer" className="h-11 rounded-pill bg-surface-muted px-4 text-[15px] text-ink" />
            </label>
          )}
          <div className="flex flex-wrap items-center gap-2.5">
            <div role="group" aria-label="Level" className="inline-flex gap-0.5 rounded-pill bg-surface-muted p-[3px]">
              {LEVELS.map((l) => <button key={l} type="button" disabled={readOnly} aria-pressed={level === l} onClick={() => setLevel(l)} className={clsx("h-8 cursor-pointer rounded-pill border-0 px-3.5 text-[13px] font-medium", level === l ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,.1)]" : "bg-transparent text-ink-2")}>{l}</button>)}
            </div>
            <div role="group" aria-label="Allocation" className="inline-flex gap-0.5 rounded-pill bg-surface-muted p-[3px]">
              {ALLOCS.map((a) => <button key={a.n} type="button" disabled={readOnly} aria-pressed={alloc === a.v} onClick={() => setAlloc(a.v)} className={clsx("h-8 cursor-pointer rounded-pill border-0 px-3.5 text-[13px] font-medium", alloc === a.v ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,.1)]" : "bg-transparent text-ink-2")}>{a.n}</button>)}
            </div>
            <span className="ml-1.5 text-sm text-mute">Kick-off {formatShortDate(opp.kickoff)} · {opp.durationMonths} months</span>
          </div>
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xl tracking-[-0.015em]">What this role needs</span><span className="flex gap-3.5 text-[13px] text-mute"><span><span className="mr-1.5 inline-block size-2.5 rounded-full bg-ink align-middle" />Must-have</span><span><span className="mr-1.5 inline-block size-2.5 rounded-full border-[1.5px] border-ink align-middle" />Nice to have</span></span></div>
            <div className="flex flex-wrap items-center gap-2">
              {reqs.map((r) => (
                <span key={r.label} title={r.source} className={clsx("inline-flex h-10 items-center gap-1 rounded-pill border-[1.5px] border-ink pr-1.5 pl-4 text-sm font-medium", r.must ? "bg-ink text-white" : "bg-white text-ink")}>
                  <button type="button" disabled={readOnly} aria-pressed={r.must} aria-label={`${r.label}: ${r.must ? "must-have" : "nice to have"}. Toggle`} onClick={() => toggleReq(r.label)} className="cursor-pointer border-0 bg-transparent p-0 font-[inherit] text-inherit">{r.label}</button>
                  {!readOnly && <button type="button" aria-label={`Remove ${r.label}`} onClick={() => setReqs((rs) => rs.filter((x) => x.label !== r.label))} className="inline-flex size-7 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-inherit opacity-70">✕</button>}
                </span>
              ))}
              {!readOnly && <input aria-label="Add a capability" value={newReq} onChange={(e) => setNewReq(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addReq(); } }} onBlur={addReq} placeholder="+ Add" className="h-10 w-[120px] rounded-pill bg-surface-muted px-4 text-sm font-medium" />}
            </div>
            <span className="text-[13px] text-mute">Hover a capability to see where it came from. Capabilities not in the catalogue can’t be matched to anyone yet: that means “not documented”, not “no”.</span>
          </div>
          {stage === "review" && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={pillClass("coral", "xl")} disabled={reqs.length === 0 || !title.trim()} onClick={() => setStage("people")}>Find people with this experience</button>
              <button type="button" className={pillClass("default", "xl")} disabled={busy || !title.trim()} onClick={saveDraft}>Save draft</button>
            </div>
          )}
        </section>

        {stage !== "review" && (
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 className="text-[28px] font-light tracking-[-0.025em]">People with <span className="font-medium">documented experience</span></h2>
              <EvidenceLegend />
            </div>
            {people.length === 0 && <p className="rounded-surface bg-white p-8 text-center text-mute shadow-card">{needsMsg}</p>}
            {people.map((c) => {
              const id = c.person.id;
              const fit = seatFit(c.availability, opp.kickoff, opp.id, ctx.today);
              const isP = proposed === id;
              return (
                <article key={id} className={clsx("flex flex-col gap-3.5 rounded-[28px] bg-white px-[22px] py-5", isP ? "shadow-[0_0_0_2px_#1D1D1F]" : "shadow-card")}>
                  <div className="flex flex-wrap items-center gap-4">
                    <Portrait who={id} size={52} decorative />
                    <div className="min-w-[200px] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/people/${id}`} className="text-base font-medium">{c.person.name}</Link>
                        {ctx.interestedIds.includes(id) && <span className="rounded-pill bg-[#FFE4D6] px-2.5 py-0.5 text-xs font-medium">Shared interest</span>}
                        {ctx.shortlist.includes(id) && <span className="rounded-pill bg-surface-muted px-2.5 py-0.5 text-xs font-medium">On your shortlist</span>}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[13px] text-mute"><span>{c.person.discipline}</span><span aria-hidden="true">·</span><AvailabilityDot confirmed={fit.kind === "free"} /><span className={fit.conflict ? "text-warn-text" : ""}>{fit.text}</span></div>
                    </div>
                    <div className="flex items-end gap-3">
                      {reqs.map((r) => {
                        const cap = resolveCapability(r.label, ctx.capabilities);
                        const best = cap ? bestEvidence(c.evidence, cap.id) : null;
                        const d = describeEvidence(best?.level ?? null, best?.verification ?? null);
                        return (
                          <span key={r.label} title={`${r.label}: ${d.text}`} className="flex w-16 flex-col items-center gap-1">
                            <EvidenceDot level={best?.level ?? null} size={16} />
                            <span className="max-w-full truncate text-[11px] text-mute">{r.label}</span>
                            {d.needsConfirmation && <span className="text-[10px] font-semibold text-warn-text">to confirm</span>}
                          </span>
                        );
                      })}
                    </div>
                    <div className="flex gap-1.5">
                      <button type="button" aria-expanded={!!open[id]} onClick={() => setOpen((o) => ({ ...o, [id]: !o[id] }))} className={pillClass("soft", "sm")}>{open[id] ? "Hide evidence" : "Evidence"}</button>
                      {!readOnly && <button type="button" onClick={() => propose(id, c.person.name)} className={pillClass(isP ? "ink" : proposed ? "default" : "coral", "sm")}>{isP ? "✓ Proposed" : proposed ? "Propose instead" : "Propose"}</button>}
                    </div>
                  </div>
                  {open[id] && (
                    <div className="ml-[68px] flex flex-col gap-1.5 rounded-xl bg-surface-muted px-4 py-3.5 text-sm">
                      {reqs.map((r) => {
                        const cap = resolveCapability(r.label, ctx.capabilities);
                        const rows = cap ? c.evidence.filter((e) => e.capabilityId === cap.id) : [];
                        return rows.length === 0
                          ? <span key={r.label}><strong>{r.label}</strong> · not documented</span>
                          : rows.map((e) => <span key={e.id}><strong>{r.label}</strong> · {describeEvidence(e.level, e.verification).text} · <span className="text-mute">{e.detail}</span></span>);
                      })}
                      <Link href={`/people/${id}`} className="mt-1 font-medium underline">Open {first(c.person.name)}’s passport →</Link>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        )}
      </div>

      {proposedRow && stage !== "sent" && (
        <div className="fixed bottom-7 left-1/2 z-[44] flex h-16 -translate-x-1/2 items-center gap-3 rounded-pill bg-ink p-2.5 text-white shadow-[0_16px_40px_rgba(0,0,0,.25)]">
          <Portrait who={proposedRow.person.id} size={44} decorative />
          <span className="mx-1.5 text-sm">{proposedRow.person.name} proposed for this role</span>
          <Link href={`/compare?ids=${[proposedRow.person.id, ...people.filter((p) => p.person.id !== proposedRow.person.id).slice(0, 2).map((p) => p.person.id)].join(",")}&role=${ctx.role?.id ?? ""}`} className="inline-flex h-[46px] items-center rounded-pill bg-[#333336] px-[18px] text-sm font-medium text-white">Compare</Link>
          <button type="button" onClick={saveDraft} disabled={busy} className="inline-flex h-[46px] cursor-pointer items-center rounded-pill border-0 bg-[#333336] px-[18px] text-sm font-medium text-white">Save draft</button>
          <button type="button" onClick={() => setDialog(true)} className={pillClass("coral", "lg", "h-[46px]")}>Send for review</button>
        </div>
      )}

      <Toast message={toast} onDone={() => setToast(null)} ms={2400} />

      <Modal open={dialog} onOpenChange={setDialog} title="Send for human review" className="max-w-[520px] bg-white p-8">
        <div className="flex flex-col gap-[18px]">
          <h2 className="text-[28px] font-light tracking-[-0.025em]">Send for <span className="font-medium">human review</span></h2>
          {proposedRow && (
            <div className="flex items-center gap-3.5 rounded-[22px] bg-surface-muted p-4">
              <Portrait who={proposedRow.person.id} size={52} decorative />
              <div className="flex-1"><div className="font-medium">{proposedRow.person.name}</div><div className="text-[13px] text-mute">{level ? `${level} · ` : ""}{title} · {opp.client} · {seatFit(proposedRow.availability, opp.kickoff, opp.id, ctx.today).text}</div></div>
            </div>
          )}
          <div className="flex justify-between text-sm"><span className="text-mute">Reviewer</span><span>{ctx.reviewerName ? `${ctx.reviewerName}, delivery lead` : "The opportunity’s delivery lead"}</span></div>
          <label className="flex flex-col gap-1.5 text-[13px] text-mute">Note for the reviewer (optional)
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} className="rounded-xl bg-surface-muted p-3 text-sm text-ink" />
          </label>
          <p className="text-[13px] text-mute">Proposing isn’t assigning. {ctx.reviewerName ? first(ctx.reviewerName) : "The delivery lead"} decides, and {proposedRow ? first(proposedRow.person.name) : "the person"} is contacted only after review.</p>
          {error && <p role="alert" className="text-sm text-coral-strong">{error}</p>}
          <div className="flex justify-end gap-2"><button type="button" className={pillClass("soft")} onClick={() => setDialog(false)}>Keep editing</button><button type="button" disabled={busy} className={pillClass("coral")} onClick={send}>{busy ? "Sending…" : "Send"}</button></div>
        </div>
      </Modal>
    </main>
  );
}
