import Link from "next/link";
import { clsx } from "clsx";
import { formatShortDate } from "@/domain/dates";
import { requirementSummary, seatCounts } from "@/domain/rules";
import { OpportunityStatus } from "@/domain/schemas";
import { Icon, RoleGlyph, TeamGlyph } from "@/design-system/icons";
import { DisplayTitle, pillClass, Tag } from "@/design-system/primitives";
import { OpportunityDrawer, type OpportunityDetail } from "@/features/opportunities/OpportunityDrawer";
import { ProposalList, ProposalReviewModal } from "@/features/opportunities/ReviewPanel";
import { getOpportunitiesData } from "@/features/opportunities/queries";
import { getReviewInbox } from "@/features/proposals/queries";
import { buildProposalView } from "@/features/proposals/view";
import { PROPOSAL_STATE_LABEL } from "@/domain/proposals";
import { guardPage } from "@/lib/access";
import { getSessionUser } from "@/lib/session";

export const metadata = { title: "Opportunities" };

const STATUS_DOT: Record<OpportunityStatus, string> = { Staffing: "bg-coral", Open: "bg-ok", Upcoming: "bg-faint" };
const card = "flex flex-col rounded-panel bg-white shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-card-lift";

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<{ status?: string; open?: string; review?: string }> }) {
  const sp = await searchParams;
  const user = await getSessionUser();
  const { all, nameOf, proposals } = await guardPage(user, () => getOpportunitiesData(user));
  const inbox = await guardPage(user, () => getReviewInbox(user));
  const isLead = user.role === "delivery_lead";
  const views = inbox.proposals.map((p) => buildProposalView(p, inbox.opportunities, inbox.people, inbox.capabilities, inbox.today));
  const reviewView = sp.review ? views.find((v) => v.proposal.id === sp.review) : undefined;
  const toReview = views.filter((v) => v.proposal.state === "submitted");
  const toConfirm = views.filter((v) => v.proposal.state === "approved" && v.seats.some((s) => s.person && s.seat.seatState !== "confirmed"));
  const mine = views.filter((v) => v.proposal.createdBy === user.id && (v.proposal.state === "draft" || v.proposal.state === "changes_requested"));
  /** Latest proposal per opportunity that still counts (not withdrawn or declined): its seats give each role's Open / Proposed / Confirmed state. */
  const live = (oppId: string) => proposals.find((p) => p.opportunityId === oppId && (p.state === "submitted" || p.state === "approved"));
  const latestState = (oppId: string) => proposals.find((p) => p.opportunityId === oppId && p.state !== "withdrawn")?.state ?? null;
  const status = OpportunityStatus.safeParse(sp.status);
  const list = status.success ? all.filter((o) => o.status === status.data) : all;
  const openRoles = all.reduce((n, o) => n + seatCounts(o).open, 0);
  const first = [...all].sort((a, b) => a.kickoff.localeCompare(b.kickoff))[0];
  const href = (patch: { status?: string | null; open?: string | null; review?: string | null }) => {
    const p = new URLSearchParams();
    const s = patch.status === undefined ? sp.status : patch.status;
    const o = patch.open === undefined ? sp.open : patch.open;
    const rv = patch.review === undefined ? sp.review : patch.review;
    if (s) p.set("status", s);
    if (o) p.set("open", o);
    if (rv) p.set("review", rv);
    const q = p.toString();
    return q ? `/opportunities?${q}` : "/opportunities";
  };
  const reviewHrefs = (vs: { proposal: { id: string } }[]): Record<string, string> => Object.fromEntries(vs.map((v) => [v.proposal.id, href({ review: v.proposal.id })]));

  const det = sp.open ? all.find((o) => o.id === sp.open) : undefined;
  const detail: OpportunityDetail | null = det ? {
    id: det.id, client: det.client, industry: det.industry, name: det.name, description: det.description,
    kickoff: formatShortDate(det.kickoff), duration: `${det.durationMonths} months`, lead: det.deliveryLead, interestNote: det.interestNote,
    summary: requirementSummary(det, `${det.durationMonths} months`, formatShortDate(det.kickoff)),
    viewerRole: user.role,
    roles: det.roles.map((r) => {
      const seat = live(det.id)?.seats.find((x) => x.roleRequirementId === r.id && x.personId);
      return { id: r.id, title: r.title, caps: r.capabilities.join(" · "), person: r.proposedPersonId ? { id: r.proposedPersonId, name: nameOf(r.proposedPersonId) } : null, seat: (seat?.assignmentId ? "confirmed" : seat ? "proposed" : "open") as "open" | "proposed" | "confirmed" };
    }),
    proposals: proposals.filter((p) => p.opportunityId === det.id && p.state !== "draft").map((p) => ({ id: p.id, label: `${PROPOSAL_STATE_LABEL[p.state]} · ${p.createdByName}`, href: href({ open: det.id, review: p.id }) })),
  } : null;

  const tabs: { v: OpportunityStatus | null; label: string }[] = [{ v: null, label: "All" }, { v: "Staffing", label: "Staffing" }, { v: "Open", label: "Open" }, { v: "Upcoming", label: "Upcoming" }];

  return (
    <main className="mx-auto flex max-w-page flex-col gap-8 px-10 pt-6 pb-[120px] max-xl:px-5">
      <div className="flex flex-wrap items-stretch gap-6">
        <header className="flex flex-[999_1_520px] flex-col justify-end gap-3">
          {isLead ? <DisplayTitle light="Proposals" strong="waiting for you." /> : <DisplayTitle light="Work that’s" strong="waiting for a team." />}
          <p className="text-[17px] text-mute">{isLead ? `${all.length} opportunities you lead · ${toReview.length} to review · ${toConfirm.length} approved, waiting for you to confirm` : `${all.length} opportunities · ${openRoles} open roles${first ? ` · first kick-off on ${formatShortDate(first.kickoff)}` : ""}`}</p>
        </header>
        {!isLead && <div className="grid max-w-[540px] flex-[1_1_440px] grid-cols-2 gap-3">
          <Link href="/opportunities/new/role" className={clsx(card, "gap-2.5 rounded-surface p-6")}>
            <span className="inline-flex size-[42px] items-center justify-center rounded-full bg-surface-muted"><RoleGlyph /></span>
            <span className="text-[19px] font-medium tracking-[-0.01em]">Fill a role</span><span className="text-[13px] text-mute">Find documented expertise for one position</span>
          </Link>
          <Link href="/opportunities/new/team" className={clsx(card, "gap-2.5 rounded-surface p-6")} style={{ background: "var(--gradient-ai-soft)" }}>
            <span className="inline-flex size-[42px] items-center justify-center rounded-full bg-coral text-white"><TeamGlyph /></span>
            <span className="text-[19px] font-medium tracking-[-0.01em]">Build a team</span><span className="text-[13px] text-mute">Compose a whole project team</span>
          </Link>
        </div>}
      </div>

      {isLead ? (
        <>
          <ProposalList views={toReview} heading="Proposals to review" hrefs={reviewHrefs(toReview)} empty="Nothing is waiting for your review." />
          {toConfirm.length > 0 && <ProposalList views={toConfirm} heading="Approved: confirm assignments" hrefs={reviewHrefs(toConfirm)} />}
        </>
      ) : (
        <>
          {mine.length > 0 && <ProposalList views={mine} heading="Your drafts and returned proposals" hrefs={Object.fromEntries(mine.map((v) => [v.proposal.id, `/opportunities/new/${v.seats.length > 1 ? "team" : "role"}?proposal=${v.proposal.id}`]))} />}
          {views.some((v) => v.proposal.state !== "draft" && v.proposal.state !== "withdrawn") && <ProposalList views={views.filter((v) => v.proposal.state !== "draft" && v.proposal.state !== "withdrawn")} heading="Proposals" hrefs={reviewHrefs(views)} />}
        </>
      )}

      <nav aria-label="Filter by status" className="flex gap-1.5 self-start rounded-pill bg-white p-[5px]">
        {tabs.map((t) => {
          const on = (status.success ? status.data : null) === t.v;
          const n = t.v ? all.filter((o) => o.status === t.v).length : all.length;
          return <Link key={t.label} href={href({ status: t.v, open: null })} aria-current={on ? "true" : undefined} className={pillClass(on ? "ink" : "default", "lg", "h-[38px]")}>{t.label} <span className="opacity-55">{n}</span></Link>;
        })}
      </nav>

      <div className="grid grid-cols-2 gap-5 max-lg:grid-cols-1">
        {list.map((o) => {
          const { total, proposed } = seatCounts(o);
          return (
            <Link key={o.id} href={href({ open: o.id })} scroll={false} aria-label={`Open ${o.client}, ${o.name}`} className={clsx(card, "group gap-[22px] p-8")}>
              <div className="flex w-full items-center justify-between">
                <div className="flex items-center gap-3"><span className="inline-flex size-11 items-center justify-center rounded-full bg-surface-muted text-[13px] font-medium">{o.clientInitials}</span><div><div className="font-medium">{o.client}</div><div className="text-[13px] text-mute">{o.industry}</div></div></div>
                <span className="inline-flex h-8 items-center gap-2 rounded-pill bg-surface-muted px-3.5 text-[13px]"><span className={clsx("size-[7px] rounded-full", STATUS_DOT[o.status])} aria-hidden="true" />{o.status}</span>
              </div>
              <div className="flex flex-col gap-2"><h2 className="text-[32px] leading-[1.1] font-light tracking-[-0.03em]">{o.name}</h2><p className="text-base text-mute">{o.short}</p></div>
              <div className="flex flex-wrap gap-1.5">{o.capabilities.map((c) => <Tag key={c} size="lg">{c}</Tag>)}</div>
              <div className="flex w-full items-end justify-between">
                <div className="flex gap-9">
                  <div><div className="text-[13px] text-mute">Starts</div><div className="text-2xl font-light tracking-[-0.02em]">{formatShortDate(o.kickoff)}</div></div>
                  <div><div className="text-[13px] text-mute">Team · {proposed}/{total} proposed{latestState(o.id) ? ` · ${PROPOSAL_STATE_LABEL[latestState(o.id)!]}` : ""}</div>
                    <div className="mt-2.5 flex gap-1.5" aria-hidden="true">{o.roles.map((r) => <span key={r.id} className={clsx("size-3.5 rounded-full border-[1.5px] border-ink", r.proposedPersonId ? "bg-ink" : "bg-transparent")} />)}</div>
                  </div>
                </div>
                <span aria-hidden="true" className="inline-flex size-11 items-center justify-center rounded-full bg-surface-muted transition-colors group-hover:bg-ink group-hover:text-white"><Icon name="arrowUpRight" size={17} strokeWidth={1.8} /></span>
              </div>
            </Link>
          );
        })}
      </div>
      {list.length === 0 && <div className="rounded-surface bg-white p-12 text-center shadow-card"><p className="text-lg">No opportunities in this status.</p><Link href="/opportunities" className="text-mute underline">Show all</Link></div>}

      {detail && <OpportunityDrawer detail={detail} closeHref={href({ open: null, review: null })} />}
      {reviewView && <ProposalReviewModal key={reviewView.proposal.id + reviewView.proposal.state} view={reviewView} canReview={inbox.canReview} closeHref={href({ review: null })} />}
    </main>
  );
}
