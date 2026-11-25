import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SaveProposalInput, TeamProposal } from "@/domain/schemas";
import { TeamBuilder, type TeamBuilderProps } from "@/features/team/TeamBuilder";
import { base, opportunity } from "./team-fixtures";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

type Result = { ok: true; proposal: TeamProposal } | { ok: false; error: string };

/** A fake of F3's actions that behaves like the repository: ids, states, seats echoed back. */
function fakeActions(overrides: Partial<TeamBuilderProps["actions"]> = {}) {
  const save = vi.fn(async (input: SaveProposalInput): Promise<Result> => ({
    ok: true,
    proposal: {
      id: input.id ?? "p1", opportunityId: input.opportunityId, title: input.title, brief: input.brief, noteForReviewer: input.noteForReviewer, state: "draft", version: 1, createdBy: "u-laura", createdByName: "Laura Gómez",
      submittedAt: null, updatedAt: "2026-11-24T10:00:00Z", review: null,
      seats: input.seats.map((s, i) => ({ id: `s${i}`, roleRequirementId: s.roleRequirementId, title: s.title, capabilities: s.capabilities, seniority: s.seniority, allocation: s.allocation, personId: s.personId, seatState: s.personId ? "proposed" : "open", assignmentId: null })),
    },
  }));
  const submit = vi.fn(async ({ id }: { id: string; note?: string }): Promise<Result> => {
    const last = (save.mock.results.at(-1) as { value: Promise<Result> }).value;
    const r = (await last) as Extract<Result, { ok: true }>;
    return { ok: true, proposal: { ...r.proposal, id, state: "submitted", submittedAt: "2026-11-24T10:05:00Z" } };
  });
  return { save, submit, ...overrides } as TeamBuilderProps["actions"] & { save: typeof save; submit: typeof submit };
}

const renderBuilder = (props: Partial<TeamBuilderProps> = {}, actions = fakeActions()) => {
  render(<TeamBuilder base={base} opportunities={[opportunity]} initialOpportunityId="kestrel" proposal={null} drafts={[]} actions={actions} {...props} />);
  return actions;
};
const compose = async (u: ReturnType<typeof userEvent.setup>) => { await u.click(screen.getByRole("button", { name: "Compose the team" })); };
const seat = (name: RegExp) => screen.getByRole("button", { name });
const card = (name: string) => within(screen.getByRole("group", { name }));

beforeEach(() => window.history.replaceState(null, "", "/"));
afterEach(cleanup);

describe("describe stage", () => {
  it("offers existing opportunities, prefills the brief and composes seats from the role requirements", async () => {
    const u = userEvent.setup(); renderBuilder();
    expect(screen.getByRole("radio", { name: /Kestrel Travel · AI trip companion/ })).toBeChecked();
    expect(screen.getByLabelText("Project description")).toHaveValue(opportunity.description);
    await compose(u);
    expect(seat(/^iOS Engineer, open seat/)).toBeInTheDocument();
    expect(seat(/^Senior Android Engineer, open seat/)).toBeInTheDocument();
    expect(seat(/^QA Automation, open seat/)).toBeInTheDocument();
    expect(screen.getByText("3 roles · 0 placed · kick-off Jan 12")).toBeInTheDocument();
    expect(window.location.search).toBe("?opp=kestrel");
  });
  it("cannot compose for an opportunity without a delivery lead (nobody could review it)", () => {
    renderBuilder({ opportunities: [{ ...opportunity, deliveryLead: "", deliveryLeadId: null }] });
    expect(screen.getByRole("button", { name: "Compose the team" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/no delivery lead yet/i);
  });
  it("lists the viewer's drafts as links", () => {
    renderBuilder({ drafts: [{ id: "p9", title: "Kestrel Travel team", opportunityName: "Kestrel Travel", state: "changes_requested" }] });
    expect(screen.getByRole("link", { name: /Kestrel Travel team/ })).toHaveAttribute("href", "/opportunities/new/team?proposal=p9");
  });
});

describe("canvas: placing people (propose / replace / move / remove)", () => {
  it("proposes a person: toast, Proposed chip, coverage and counts update", async () => {
    const u = userEvent.setup(); renderBuilder(); await compose(u);
    expect(screen.getByRole("button", { name: "Review & propose" })).toBeDisabled();           // nobody placed yet
    await u.click(seat(/^iOS Engineer/));
    await u.click(card("Ana Ruiz").getByRole("button", { name: "Propose" }));
    expect(await screen.findByText("Ana Ruiz proposed for iOS Engineer")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Close" }));
    expect(seat(/^iOS Engineer, Ana Ruiz, proposed/)).toBeInTheDocument();
    expect(screen.getByText("3 roles · 1 placed · kick-off Jan 12")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review & propose" })).toBeEnabled();
    expect(within(screen.getByRole("region", { name: "Coverage" })).getByText(/Documented on this team · 1/)).toBeInTheDocument();
  });

  it("'Propose instead' replaces, '✓ Proposed' removes", async () => {
    const u = userEvent.setup(); renderBuilder(); await compose(u);
    await u.click(seat(/^iOS Engineer/));
    await u.click(card("Ana Ruiz").getByRole("button", { name: "Propose" }));
    await u.click(card("Javier Morales").getByRole("button", { name: "Propose instead" }));
    expect(await screen.findByText("Javier Morales replaces Ana Ruiz")).toBeInTheDocument();
    await u.click(card("Javier Morales").getByRole("button", { name: "✓ Proposed" }));
    expect(await screen.findByText("Javier Morales removed from iOS Engineer")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Close" }));
    expect(seat(/^iOS Engineer, open seat/)).toBeInTheDocument();
  });

  it("'Move here' keeps a person in at most one seat", async () => {
    const u = userEvent.setup(); renderBuilder(); await compose(u);
    // Camila has Kotlin training evidence, so she is a candidate for both the Android and QA seats.
    await u.click(seat(/^QA Automation/));
    await u.click(card("Camila Duarte").getByRole("button", { name: "Propose" }));
    await u.click(screen.getByRole("button", { name: "Close" }));
    await u.click(seat(/^Senior Android Engineer/));
    await u.click(card("Camila Duarte").getByRole("button", { name: "Move here" }));
    await u.click(screen.getByRole("button", { name: "Close" }));
    expect(seat(/^Senior Android Engineer, Camila Duarte, proposed/)).toBeInTheDocument();
    expect(seat(/^QA Automation, open seat/)).toBeInTheDocument();
  });

  it("shows evidence source and verification honestly, and shortlist / shared-interest badges", async () => {
    const u = userEvent.setup(); renderBuilder(); await compose(u);
    await u.click(seat(/^iOS Engineer/));
    const javier = card("Javier Morales");
    expect(javier.getByText("Shared interest")).toBeInTheDocument();
    expect(javier.getByText("self-reported")).toBeInTheDocument();                           // professional source, not confirmed
    expect(javier.getByText("not documented")).toBeInTheDocument();                          // WidgetKit: never "no"
    await u.click(javier.getByRole("button", { name: "Show evidence" }));
    expect(javier.getByText(/Swift work · professional · self-reported \(needs confirmation\)/)).toBeInTheDocument();
    expect(screen.getByText(/Ordered by documented matches, then availability/)).toBeInTheDocument();
  });

  it("edits needs, level and allocation in the drawer and removes a role (confirming when filled)", async () => {
    const u = userEvent.setup(); renderBuilder(); await compose(u);
    await u.click(seat(/^QA Automation/));
    await u.type(screen.getByLabelText("Add a capability"), "Playwright{Enter}");
    expect(screen.getByRole("button", { name: "Remove Playwright" })).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Lead" }));
    await u.click(screen.getByRole("button", { name: "Half-time" }));
    await u.click(screen.getByRole("button", { name: "Close" }));
    expect(seat(/^QA Automation/)).toHaveTextContent("Playwright");
    await u.click(seat(/^QA Automation/));
    await u.click(card("Camila Duarte").getByRole("button", { name: "Propose" }));
    await u.click(screen.getByRole("button", { name: "Remove this role" }));
    expect(screen.getByText(/Remove this role and un-place Camila Duarte\?/)).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Yes, remove" }));
    expect(screen.queryByRole("button", { name: /^QA Automation/ })).not.toBeInTheDocument();
  });

  it("adds a catalogue role once, from the menu", async () => {
    const u = userEvent.setup(); renderBuilder(); await compose(u);
    await u.click(screen.getByRole("button", { name: "+ Add a role" }));
    await u.click(screen.getByRole("menuitem", { name: /Cloud Engineer/ }));
    expect(screen.getByRole("dialog", { name: /Position details: Cloud Engineer/ })).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Close" }));
    await u.click(screen.getByRole("button", { name: "+ Add a role" }));
    expect(screen.queryByRole("menuitem", { name: /Cloud Engineer/ })).not.toBeInTheDocument();
  });
});

describe("conflicts and coverage panels", () => {
  it("surfaces a person proposed for another team and a late, pending person, with 'Find alternative'", async () => {
    const u = userEvent.setup(); renderBuilder(); await compose(u);
    expect(within(screen.getByRole("region", { name: "Availability conflicts" })).getByText(/No conflicts/)).toBeInTheDocument();
    await u.click(seat(/^QA Automation/));
    await u.click(card("Camila Duarte").getByRole("button", { name: "Propose" }));
    await u.click(screen.getByRole("button", { name: "Close" }));
    await u.click(seat(/^iOS Engineer/));
    await u.click(card("Javier Morales").getByRole("button", { name: "Propose" }));
    await u.click(screen.getByRole("button", { name: "Close" }));
    const panel = within(screen.getByRole("region", { name: "Availability conflicts" }));
    expect(panel.getByText("Proposed for Vela Bank from Jan 12")).toBeInTheDocument();
    expect(panel.getByText(/after kick-off, pending/)).toBeInTheDocument();
    expect(panel.getAllByRole("button", { name: "Find alternative" })).toHaveLength(2);
    await u.click(panel.getAllByRole("button", { name: "Find alternative" })[0]!);
    expect(screen.getByRole("dialog", { name: /Position details/ })).toBeInTheDocument();
  });
});

describe("review, send and read-only", () => {
  const placeAna = async (u: ReturnType<typeof userEvent.setup>) => {
    await u.click(seat(/^iOS Engineer/));
    await u.click(card("Ana Ruiz").getByRole("button", { name: "Propose" }));
    await u.click(screen.getByRole("button", { name: "Close" }));
  };

  it("saves a draft through the action with the seats, and reflects it in the URL", async () => {
    const u = userEvent.setup(); const a = renderBuilder(); await compose(u); await placeAna(u);
    await u.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(a.save).toHaveBeenCalledTimes(1));
    const input = a.save.mock.calls[0]![0];
    expect(input).toMatchObject({ opportunityId: "kestrel", title: "Kestrel Travel team" });
    expect(input.seats.find((s) => s.personId === "ana")).toMatchObject({ title: "iOS Engineer", roleRequirementId: "kestrel-ios" });
    expect(Object.keys(input).sort()).toEqual(["brief", "noteForReviewer", "opportunityId", "seats", "title"]);   // never state or verification
    expect(await screen.findByText("Draft saved · only visible to you")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "✓ Saved" })).toBeInTheDocument();
    expect(window.location.search).toBe("?proposal=p1");
  });

  it("the review dialog names the real reviewer, lists what to confirm, and sending assigns nobody; the canvas becomes read-only", async () => {
    const u = userEvent.setup(); const a = renderBuilder(); await compose(u); await placeAna(u);
    await u.click(screen.getByRole("button", { name: "Review & propose" }));
    const dialog = within(screen.getByRole("dialog", { name: "Team proposal" }));
    expect(dialog.getByText(/Reviewer: Inés Vidal, delivery lead · nothing is assigned automatically/)).toBeInTheDocument();
    expect(dialog.getByText("Senior Android Engineer seat is still open")).toBeInTheDocument();
    await u.type(dialog.getByLabelText("Note for the reviewer"), "Ana is free from Dec 1.");
    await u.click(dialog.getByRole("button", { name: "Send for review" }));
    await waitFor(() => expect(a.submit).toHaveBeenCalledWith({ id: "p1", note: "Ana is free from Dec 1." }));
    expect(await screen.findByText(/Nobody has been assigned; people are contacted only after review\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "✓ Sent for review" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "+ Add a role" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
    await u.click(seat(/^iOS Engineer, Ana Ruiz, proposed/));                                   // viewable, not editable
    const drawer = within(screen.getByRole("dialog", { name: /Position details/ }));
    expect(drawer.queryByRole("button", { name: "Propose instead" })).not.toBeInTheDocument();
    expect(drawer.queryByRole("button", { name: "Remove this role" })).not.toBeInTheDocument();
    expect(drawer.getByText(/with the reviewer/)).toBeInTheDocument();
  });

  it("a failed send keeps the team and says why", async () => {
    const u = userEvent.setup();
    const a = renderBuilder({}, fakeActions({ submit: vi.fn(async () => ({ ok: false as const, error: "Only the author can send it." })) }));
    await compose(u); await placeAna(u);
    await u.click(screen.getByRole("button", { name: "Review & propose" }));
    await u.click(screen.getByRole("button", { name: "Send for review" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Only the author can send it. Your team is still on the canvas: nothing was lost.");
    expect(a.save).toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Team proposal" })).toBeInTheDocument();
  });

  it("a returned proposal shows the reviewer's note, is editable and can be resubmitted", () => {
    const returned: TeamProposal = {
      id: "p7", opportunityId: "kestrel", title: "Kestrel Travel team", brief: "", noteForReviewer: "", state: "changes_requested", version: 1, createdBy: "u-laura", createdByName: "Laura Gómez", submittedAt: "2026-11-24T09:00:00Z", updatedAt: "2026-11-24T09:00:00Z",
      seats: [{ id: "s1", roleRequirementId: "kestrel-ios", title: "iOS Engineer", capabilities: ["Swift"], seniority: "Mid", allocation: 1, personId: "ana", seatState: "proposed", assignmentId: null }],
      review: { decision: "changes_requested", note: "Please find a second Swift engineer.", reviewerId: "u-ines", reviewerName: "Inés Vidal", at: "2026-11-24T09:30:00Z" },
    };
    renderBuilder({ proposal: returned, initialOpportunityId: "kestrel" });
    expect(screen.getByRole("status")).toHaveTextContent(/Inés Vidal asked for changes\. “Please find a second Swift engineer\.”/);
    expect(screen.getByRole("button", { name: "Resubmit for review" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "+ Add a role" })).toBeInTheDocument();
  });

  it("only a server-confirmed seat shows Confirmed; an approved proposal is read-only and says approval assigns nobody", () => {
    const approved: TeamProposal = {
      id: "p8", opportunityId: "kestrel", title: "Kestrel Travel team", brief: "", noteForReviewer: "", state: "approved", version: 1, createdBy: "u-laura", createdByName: "Laura Gómez", submittedAt: "2026-11-24T09:00:00Z", updatedAt: "2026-11-24T09:00:00Z",
      seats: [
        { id: "s1", roleRequirementId: "kestrel-ios", title: "iOS Engineer", capabilities: ["Swift"], seniority: "Mid", allocation: 1, personId: "ana", seatState: "confirmed", assignmentId: "as1" },
        { id: "s2", roleRequirementId: "kestrel-android", title: "Senior Android Engineer", capabilities: ["Kotlin"], seniority: "Senior", allocation: 1, personId: "ethan", seatState: "proposed", assignmentId: null },
      ],
      review: { decision: "approved", note: null, reviewerId: "u-ines", reviewerName: "Inés Vidal", at: "2026-11-24T09:30:00Z" },
    };
    renderBuilder({ proposal: approved });
    expect(seat(/^iOS Engineer, Ana Ruiz, confirmed/)).toBeInTheDocument();
    expect(seat(/^Senior Android Engineer, Ethan Brooks, proposed/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/Approval does not assign anyone/);
    expect(screen.getByRole("button", { name: /Review & propose|Sent for review/ })).toBeDisabled();
  });
});
