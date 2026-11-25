import { redirect } from "next/navigation";
import { TeamBuilder } from "@/features/team/TeamBuilder";
import { getTeamBuilderProps } from "@/features/team/load";
import { saveProposalAction, submitProposalAction, withdrawProposalAction } from "@/features/proposals/actions";
import { guardPage, homeFor } from "@/lib/access";
import { getSessionUser } from "@/lib/session";
import { ForbiddenError } from "@/domain/errors";

export const metadata = { title: "Build a team" };

/**
 * Build a Team: a visual team canvas (central project card, surrounding role seats). Staffing leads only (proposals:write; a
 * layout redirect is UX, the query is the protection). URL state: ?proposal=ID reopens a draft or a returned proposal,
 * ?from=ID (or ?opp=ID) preselects an existing opportunity.
 */
export default async function BuildTeamPage({ searchParams }: { searchParams: Promise<{ proposal?: string; from?: string; opp?: string }> }) {
  const sp = await searchParams;
  const user = await getSessionUser();
  let props;
  try {
    props = await guardPage(user, () => getTeamBuilderProps(user, { proposalId: sp.proposal, opportunityId: sp.from ?? sp.opp }));
  } catch (e) {
    if (e instanceof ForbiddenError) redirect(homeFor(user));
    throw e;
  }
  return (
    <main className="mx-auto max-w-page px-10 pt-3 pb-[120px] max-xl:px-5">
      <TeamBuilder key={`${sp.proposal ?? ""}|${sp.from ?? sp.opp ?? ""}`} {...props} actions={{ save: saveProposalAction, submit: submitProposalAction, withdraw: withdrawProposalAction }} />
    </main>
  );
}
