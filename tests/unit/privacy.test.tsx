/**
 * Career-interest privacy. Policy: career goals and learning interests are PRIVATE BY DEFAULT; professional preferences are
 * disclosed only voluntarily; interest in a specific opportunity is a separate concept (not built yet). Private data must
 * not appear in staffing views, exports, search results or assistant responses, and it must not even be SELECTED for them:
 * whatever reaches a client component is serialized into the page.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ persona: undefined as string | undefined, revalidate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (n === "sparq_demo_persona" && state.persona ? { value: state.persona } : undefined) }) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => state.revalidate(...a) }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); } }));

import { users } from "@/data/fixtures/organization";
import { getRepositories } from "@/data/repositories";
import { resetMemoryStore } from "@/data/repositories/memory";
import { getPeopleView } from "@/features/people/queries";
import { ASSISTANT_CONTENT } from "@/features/ask-sparq/content";
import { RuleBasedAssistant } from "@/features/ask-sparq/gateway";
import { ASSISTANT_CONTEXTS } from "@/domain/policy";
import { ExportButton } from "@/features/passport/client";
import { setInterestVisibility, setWorkPreferencesVisibility, toggleInterest } from "@/features/passport/actions";
import { getPassportView } from "@/features/passport/queries";
import { resolveAssistantRequest } from "@/features/ask-sparq/access";

const laura = users.find((u) => u.role === "staffing_lead")!;
const ana = users.find((u) => u.role === "engineer")!;
const PRIVATE = ["Technical leadership", "Fintech", "Mentoring"]; // Ana's selected-but-private interests in the fictional dataset
const MARKER = "ZZ-private-career-goal-marker";

beforeEach(() => { resetMemoryStore(); state.persona = "engineer"; state.revalidate.mockClear(); });

const staffView = () => getPassportView("ana", laura);
const ownerView = () => getPassportView("ana", ana);

describe("private by default: what staffing is allowed to select", () => {
  it("staff only see the labels Ana shared, and nothing else about her interests", async () => {
    const v = await staffView();
    expect(v!.interestsOn).toEqual(["Applied AI in mobile"]);
    expect(v!.interestsAll).toEqual({});
    expect(v!.interestsShared).toEqual([]);
  });
  it("the staff view model, as it is serialized to the client, contains no private label at all", async () => {
    const json = JSON.stringify(await staffView());
    for (const label of PRIVATE) expect(json).not.toContain(label);
    expect(json).toContain("Applied AI in mobile"); // the shared one is there
  });
  it("the owner sees all of their interests and which are shared", async () => {
    const v = await ownerView();
    expect(v!.interestsOn).toEqual(expect.arrayContaining(["Applied AI in mobile", ...PRIVATE]));
    expect(Object.keys(v!.interestsAll)).toEqual(expect.arrayContaining([...PRIVATE, "Native iOS depth"]));
    expect(v!.interestsShared).toEqual(["Applied AI in mobile"]);
  });
  it("people without any interests record show an empty list to staff, indistinguishable from 'all private'", async () => {
    const v = await getPassportView("lucia", laura);
    expect(v!.interestsOn).toEqual([]);
    expect(v!.interestsAll).toEqual({});
  });
  it("the staff people directory never carries private interests either", async () => {
    const json = JSON.stringify(await getPeopleView({ sel: "ana" }, laura));
    for (const label of PRIVATE) expect(json).not.toContain(label);
  });
});

describe("sharing is the owner's voluntary, reversible choice", () => {
  it("sharing an interest makes it visible to staff; taking it back hides it again", async () => {
    expect(await setInterestVisibility({ interest: "Fintech", shared: true })).toEqual({ ok: true });
    expect((await staffView())!.interestsOn).toEqual(expect.arrayContaining(["Applied AI in mobile", "Fintech"]));
    expect(await setInterestVisibility({ interest: "Fintech", shared: false })).toEqual({ ok: true });
    expect(JSON.stringify(await staffView())).not.toContain("Fintech");
  });
  it("deselecting a shared interest withdraws the disclosure, and re-selecting it does NOT re-share it", async () => {
    expect((await staffView())!.interestsOn).toContain("Applied AI in mobile");
    await toggleInterest({ interest: "Applied AI in mobile" }); // deselect
    expect((await staffView())!.interestsOn).toEqual([]);
    await toggleInterest({ interest: "Applied AI in mobile" }); // select again
    expect((await staffView())!.interestsOn).toEqual([]); // back to private by default
    expect((await ownerView())!.interestsOn).toContain("Applied AI in mobile");
  });
  it("a new interest is private until shared", async () => {
    await toggleInterest({ interest: MARKER });
    expect(JSON.stringify(await staffView())).not.toContain(MARKER);
    expect((await ownerView())!.interestsOn).toContain(MARKER);
  });
  it("only a selected interest can be shared", async () => {
    const r = await setInterestVisibility({ interest: "Native iOS depth", shared: true }); // exists but is not selected
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/choose this interest first/i) });
    expect((await staffView())!.interestsOn).toEqual(["Applied AI in mobile"]);
  });
  it("a staffing lead cannot change anyone's visibility, and nothing changes", async () => {
    state.persona = "staffing_lead";
    expect(await setInterestVisibility({ interest: "Fintech", shared: true })).toEqual({ ok: false, error: expect.stringMatching(/only the owner/i) });
    expect(await setWorkPreferencesVisibility({ shared: false })).toEqual({ ok: false, error: expect.stringMatching(/only the owner/i) });
    expect(JSON.stringify(await staffView())).not.toContain("Fintech");
    expect((await staffView())!.workPreferences).toMatch(/Open to travel/);
  });
  it("professional preferences are shown to staff only while the owner shares them", async () => {
    expect((await staffView())!.workPreferences).toMatch(/Open to travel/);
    expect(await setWorkPreferencesVisibility({ shared: false })).toEqual({ ok: true });
    const hidden = await staffView();
    expect(hidden!.workPreferences).toBeNull();
    expect(JSON.stringify(hidden)).not.toContain("Open to travel"); // not even inside `person`
    expect((await ownerView())!.workPreferences).toMatch(/Open to travel/); // the owner still sees it
  });
});

describe("exports and previews", () => {
  it("the document preview/export contains no interests, private or shared, and no preferences", async () => {
    await toggleInterest({ interest: MARKER });
    const view = (await ownerView())!; // the OWNER's view carries every interest, so this is the strictest case
    render(<ExportButton view={view} label="Preview & export" />);
    await userEvent.click(screen.getByRole("button", { name: "Preview & export" }));
    const doc = within(screen.getByRole("dialog")).getByLabelText("Document preview");
    for (const label of [...PRIVATE, MARKER, "Applied AI in mobile", "Open to travel"]) expect(doc.textContent).not.toContain(label);
    expect(doc.textContent).toContain("Ana Ruiz");
  });
});

describe("assistant answers never contain private interests", () => {
  const STAFF = { id: laura.id, role: laura.role, personId: laura.personId } as const;
  const ENG = { id: ana.id, role: ana.role, personId: ana.personId } as const;

  it("across every suggestion and several free-text questions, for both roles", async () => {
    await toggleInterest({ interest: MARKER });
    const repos = getRepositories();
    const gateway = new RuleBasedAssistant(repos);
    const answers: unknown[] = [];
    for (const actor of [STAFF, ENG]) {
      for (const context of ASSISTANT_CONTEXTS[actor.role]) {
        for (const p of ASSISTANT_CONTENT[context].prompts) {
          const subject = context === "passport" ? "ana" : context === "mypassport" ? "ana" : undefined;
          const resolved = await resolveAssistantRequest(repos, actor, { context, promptId: p.id, subjectPersonId: subject });
          answers.push(await gateway.answer(resolved, actor));
        }
        for (const question of ["What are Ana’s career goals?", "What does Ana want to learn?", "Who is interested in fintech or mentoring?", "Who knows AWS and Terraform?", "Tell me about Ana’s interests"]) {
          answers.push(await gateway.answer({ context, question }, actor));
        }
      }
    }
    expect(answers.length).toBeGreaterThan(20);
    const json = JSON.stringify(answers);
    for (const label of [MARKER, ...PRIVATE]) expect(json).not.toContain(label);
  });
});
