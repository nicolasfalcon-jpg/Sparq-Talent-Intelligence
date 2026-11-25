import Link from "next/link";
import { DisplayTitle, pillClass } from "@/design-system/primitives";
import { formatShortDate } from "@/domain/dates";
import { PROPOSAL_STATE_LABEL } from "@/domain/proposals";
import { FillRole } from "@/features/role/client";
import { getProposalWorkbench } from "@/features/proposals/queries";
import { guardPage } from "@/lib/access";
import { getSessionUser } from "@/lib/session";

export const metadata = { title: "Fill a role" };

/** Fill a Role: /opportunities/new/role?opportunity=<slug>&role=<role slug> or ?proposal=<id>. Without them, choose the role first. */
export default async function Page({ searchParams }: { searchParams: Promise<{ opportunity?: string; role?: string; proposal?: string }> }) {
  const sp = await searchParams;
  const user = await getSessionUser();
  const wb = await guardPage(user, () => getProposalWorkbench(user, { opportunityId: sp.opportunity, proposalId: sp.proposal }));
  const opp = wb.opportunity ?? wb.opportunities.find((o) => o.roles.some((r) => r.id === sp.role)) ?? null;

  if (!opp) {
    return (
      <main className="mx-auto flex max-w-page flex-col gap-8 px-10 pt-6 pb-[120px] max-xl:px-5">
        <div className="flex flex-col gap-2"><Link href="/opportunities" className="text-sm text-mute">← Opportunities</Link><DisplayTitle light="Which role" strong="do you need to fill?" /></div>
        <p className="max-w-[620px] text-[17px] text-mute">Choose an opportunity and a role. Requirements and people with documented experience come next, and nothing is decided automatically: you review everything before it goes to a delivery lead.</p>
        {wb.myDrafts.length > 0 && (
          <section aria-label="Your drafts" className="flex flex-col gap-2.5"><h2 className="text-xl">Your drafts</h2>
            {wb.myDrafts.map((d) => <Link key={d.id} href={`/opportunities/new/${d.seats.length > 1 ? "team" : "role"}?proposal=${d.id}`} className="flex items-center justify-between rounded-panel bg-white px-5 py-4 shadow-card"><span>{d.title}</span><span className="text-[13px] text-mute">{PROPOSAL_STATE_LABEL[d.state]}</span></Link>)}
          </section>
        )}
        <div className="grid grid-cols-2 gap-5 max-lg:grid-cols-1">
          {wb.opportunities.map((o) => (
            <section key={o.id} className="flex flex-col gap-3 rounded-surface bg-white p-6 shadow-card">
              <div><div className="text-[13px] text-mute">{o.client} · kick-off {formatShortDate(o.kickoff)} · reviewer {o.deliveryLead}</div><h2 className="text-2xl font-light tracking-[-0.02em]">{o.name}</h2></div>
              <div className="flex flex-col gap-2">
                {o.roles.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface-muted px-4 py-3"><div><div className="font-medium">{r.title}</div><div className="text-[13px] text-mute">{r.capabilities.join(" · ")}</div></div>
                    {r.proposedPersonId ? <span className="text-[13px] text-mute">Someone is proposed</span> : <Link href={`/opportunities/new/role?opportunity=${o.id}&role=${r.id}`} className={pillClass("soft", "sm")}>Fill this role</Link>}
                  </div>
                ))}
              </div>
              <Link href={`/opportunities/new/role?opportunity=${o.id}`} className="self-start text-sm text-mute underline">Add a different role</Link>
            </section>
          ))}
        </div>
      </main>
    );
  }

  const role = wb.proposal?.seats[0]?.roleRequirementId ? opp.roles.find((r) => r.id === wb.proposal?.seats[0]?.roleRequirementId) : opp.roles.find((r) => r.id === sp.role);
  return (
    <FillRole
      key={wb.proposal?.id ?? `${opp.id}:${sp.role ?? ""}`}
      ctx={{
        opportunity: { id: opp.id, client: opp.client, name: opp.name, description: opp.description, kickoff: opp.kickoff, durationMonths: opp.durationMonths },
        reviewerName: opp.deliveryLead || null,
        role: role ? { id: role.id, title: role.title, capabilities: role.capabilities } : null,
        proposal: wb.proposal,
        candidates: wb.candidates,
        capabilities: wb.capabilities, shortlist: wb.shortlist, today: wb.today,
        interestedIds: wb.sharedInterests.filter((e) => e.roleRequirementId === role?.id).map((e) => e.personId),
      }}
    />
  );
}
