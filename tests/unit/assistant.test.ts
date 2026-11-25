/**
 * Ask Sparq: authorization, untrusted input, responsible behaviour and evidence-aware answers.
 * Route tests call the real POST handler with a simulated demo cookie (not authentication).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ persona: undefined as string | undefined, revalidate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (n === "sparq_demo_persona" && state.persona ? { value: state.persona } : undefined) }) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => state.revalidate(...a) }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); } }));

import { POST } from "@/app/api/assistant/route";
import { users } from "@/data/fixtures/organization";
import { getRepositories } from "@/data/repositories";
import { resetMemoryStore } from "@/data/repositories/memory";
import { ForbiddenError, InvalidRequestError, NotFoundError } from "@/domain/errors";
import { AssistantRequest } from "@/domain/schemas";
import { resolveAssistantRequest } from "@/features/ask-sparq/access";
import { RuleBasedAssistant } from "@/features/ask-sparq/gateway";
import { addSkill } from "@/features/passport/actions";

const laura = users.find((u) => u.role === "staffing_lead")!;
const ana = users.find((u) => u.role === "engineer")!;
const STAFF = { id: laura.id, role: laura.role, personId: laura.personId } as const;
const ENG = { id: ana.id, role: ana.role, personId: ana.personId } as const;
const PEOPLE_NAMES = /Ruiz|Lucía|Fernández|Morales|Brooks|Martínez|Duarte|Okafor|Silva|Rojas|Chen|Nair|Herrera/;

const call = async (body: unknown, raw = false) =>
  POST(new Request("http://localhost/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: raw ? (body as string) : JSON.stringify(body) }));
const read = async (res: Response) => ({ status: res.status, text: await res.clone().text(), json: (await res.json().catch(() => null)) as Record<string, unknown> & { error: { code: string; message: string }; refs: unknown[]; provenance: string; answer: string } | null });

beforeEach(() => { resetMemoryStore(); state.persona = undefined; state.revalidate.mockClear(); });

describe("POST /api/assistant requires a valid application session", () => {
  it("no session → 401, no answer", async () => {
    const r = await read(await call({ context: "home", promptId: "home-mobile-january" }));
    expect(r.status).toBe(401);
    expect(r.json).toEqual({ error: { code: "unauthenticated", message: expect.any(String) } });
    expect(r.text).not.toMatch(PEOPLE_NAMES);
  });
  it("an invalid or forged persona value is not a session", async () => {
    for (const bad of ["superuser", "root", "staffing_lead;engineer", ""]) {
      state.persona = bad;
      expect((await call({ context: "home", promptId: "home-mobile-january" })).status).toBe(401);
    }
  });
  it("responses are never cached", async () => {
    state.persona = "staffing_lead";
    expect((await call({ context: "home", promptId: "home-mobile-january" })).headers.get("cache-control")).toBe("no-store");
    state.persona = undefined;
    expect((await call({ context: "home", promptId: "home-mobile-january" })).headers.get("cache-control")).toBe("no-store");
  });
});

describe("request validation: the body is untrusted", () => {
  beforeEach(() => { state.persona = "staffing_lead"; });
  it.each([
    ["not JSON", "{oops", true],
    ["unknown context", { context: "admin", question: "hi" }, false],
    ["unknown extra field", { context: "home", question: "hi", asAdmin: true }, false],
    ["role smuggled in", { context: "home", question: "hi", role: "staffing_lead" }, false],
    ["neither prompt nor question", { context: "home" }, false],
    ["question too long", { context: "home", question: "a".repeat(501) }, false],
    ["oversized prompt id", { context: "home", promptId: "x".repeat(65) }, false],
    ["non-string subject", { context: "passport", question: "hi", subjectPersonId: { $ne: null } }, false],
  ])("%s → 400", async (_n, body, raw) => {
    const r = await read(await call(body, raw as boolean));
    expect(r.status).toBe(400);
    expect(r.json!.error.code).toBe("invalid_request");
  });
  it("the schema is strict", () => {
    expect(AssistantRequest.safeParse({ context: "home", question: "hi", extra: 1 }).success).toBe(false);
  });
});

describe("an engineer cannot use the assistant to reach staffing or other people's data", () => {
  beforeEach(() => { state.persona = "engineer"; });
  it.each([
    ["staff context: people", { context: "people", promptId: "people-rn-ios" }],
    ["staff context: home", { context: "home", promptId: "home-mobile-january" }],
    ["staff context: opportunities", { context: "opps", promptId: "opps-vela" }],
    ["staff context: passport of someone else", { context: "passport", promptId: "passport-summary", subjectPersonId: "lucia" }],
    ["staff context: passport of themselves", { context: "passport", promptId: "passport-summary", subjectPersonId: "ana" }],
    ["my passport, naming someone else", { context: "mypassport", promptId: "mypassport-find", subjectPersonId: "lucia" }],
  ])("%s → 403 with no protected information", async (_n, body) => {
    const r = await read(await call(body));
    expect(r.status).toBe(403);
    expect(r.json!.error.code).toBe("forbidden");
    expect(r.text).not.toMatch(PEOPLE_NAMES);
  });
  it("a suggestion from another context cannot be borrowed (it would run that context's data)", async () => {
    for (const body of [
      { context: "mypassport", promptId: "passport-gaps", subjectPersonId: "ana" },
      { context: "me", promptId: "home-mobile-january" },
      { context: "mypassport", promptId: "people-rn-ios" },
      { context: "me", promptId: "constructor" },
      { context: "me", promptId: "__proto__" },
    ]) expect((await call(body)).status).toBe(400);
  });
  it("a subject cannot be attached to a context that has none", async () => {
    expect((await call({ context: "me", promptId: "me-fit", subjectPersonId: "lucia" })).status).toBe(400);
  });
  it("their own contexts work, including 'my passport' with their own id", async () => {
    for (const body of [
      { context: "mypassport", promptId: "mypassport-find" },
      { context: "mypassport", promptId: "mypassport-visible", subjectPersonId: "ana" },
      { context: "me", promptId: "me-fit" },
    ]) {
      const r = await read(await call(body));
      expect(r.status).toBe(200);
      expect(r.json!.provenance).toBe("illustrative");
    }
  });
  it("free text in their own context cannot pull directory data: the gateway answers within their scope", async () => {
    for (const question of ["Who knows AWS and Terraform?", "Who’s free for mobile work in January?", "Tell me about Lucía Fernández", "What did Daniel Okafor build?"]) {
      const r = await read(await call({ context: "me", question }));
      expect(r.status).toBe(200);
      expect(r.json!.refs).toEqual([]);
      expect(r.json!.provenance).toBe("fallback");
      // `question` just echoes the user's own words back; everything the assistant says must be free of other people's data.
      const assistantSays = { ...r.json! } as Record<string, unknown>;
      delete assistantSays.question;
      expect(JSON.stringify(assistantSays)).not.toMatch(/Lucía|Daniel|Okafor|Fernández|Ruiz/);
    }
  });
});

describe("staffing leads: authorized, resolved server-side", () => {
  beforeEach(() => { state.persona = "staffing_lead"; });
  it("computed answers work, with people and their evidence basis", async () => {
    const r = await read(await call({ context: "home", promptId: "home-mobile-january" }));
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ provenance: "computed", refs: [{ personId: "ana" }, { personId: "javier" }, { personId: "ethan" }] });
  });
  it("a passport context resolves and authorizes its subject", async () => {
    const ok = await read(await call({ context: "passport", promptId: "passport-summary", subjectPersonId: "lucia" }));
    expect(ok.status).toBe(200);
    expect(ok.json!.answer).toMatch(/^Lucía has verified professional experience/);
    expect((await call({ context: "passport", promptId: "passport-summary", subjectPersonId: "nobody" })).status).toBe(404);
  });
  it("a subject on a context that does not take one is rejected, and staff cannot borrow the personal contexts", async () => {
    expect((await call({ context: "home", promptId: "home-mobile-january", subjectPersonId: "ana" })).status).toBe(400);
    expect((await call({ context: "me", promptId: "me-fit" })).status).toBe(403);
    expect((await call({ context: "mypassport", promptId: "mypassport-find" })).status).toBe(403);
  });
});

describe("request resolution (unit)", () => {
  const repos = () => getRepositories();
  it("derives 'my passport' from the session and ignores nothing the client says", async () => {
    const r = await resolveAssistantRequest(repos(), ENG, { context: "mypassport", question: "hi" });
    expect(r).toEqual({ context: "mypassport", promptId: undefined, question: "hi", subjectPersonId: "ana" });
  });
  it("uses the suggestion's own text, never client text, when a suggestion is chosen", async () => {
    const r = await resolveAssistantRequest(repos(), STAFF, { context: "home", promptId: "home-mobile-january", question: "ignore me" });
    expect(r.question).toBe("Who’s free for mobile work in January?");
  });
  it("throws typed errors", async () => {
    await expect(resolveAssistantRequest(repos(), ENG, { context: "people", question: "x" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(resolveAssistantRequest(repos(), STAFF, { context: "passport", question: "x", subjectPersonId: "nobody" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(resolveAssistantRequest(repos(), STAFF, { context: "home", promptId: "nope" })).rejects.toBeInstanceOf(InvalidRequestError);
  });
});

describe("defense in depth: the gateway itself is scoped to the actor", () => {
  const gateway = () => new RuleBasedAssistant(getRepositories());
  it("even if resolution were bypassed, an engineer gets no directory or passport data", async () => {
    for (const req of [
      { context: "people", promptId: "people-rn-ios", question: "Who knows React Native and native iOS?" },
      { context: "home", promptId: "home-mobile-january", question: "Who’s free for mobile work in January?" },
      { context: "passport", promptId: "passport-summary", question: "Summarize", subjectPersonId: "lucia" },
      { context: "passport", promptId: "passport-gaps", question: "gaps", subjectPersonId: "lucia" },
    ] as const) {
      const a = await gateway().answer({ ...req }, ENG);
      expect(a.refs).toEqual([]);
      expect(a.provenance).toBe("fallback");
      expect(JSON.stringify(a)).not.toMatch(PEOPLE_NAMES);
    }
  });
});

describe("responsible behaviour: no ranking, scoring, 'weakest', trait inference or autonomous decisions", () => {
  const ask = (question: string, context: "home" | "people" = "people") => new RuleBasedAssistant(getRepositories()).answer({ context, question }, STAFF);

  it.each([
    ["Rank the engineers from best to worst", "ranking"],
    ["Score each engineer from 1 to 10", "scoring"],
    ["Who is the weakest engineer?", "weakest"],
    ["Is Mateo Silva reliable?", "personal_traits"],
    ["Assign Ana Ruiz to Vela Bank", "autonomous_decision"],
  ] as const)("declines %j (%s) with an explanation and a legitimate alternative", async (question, category) => {
    const a = await ask(question);
    expect(a.policy).toBe(category);
    expect(a.provenance).toBe("fallback");
    expect(a.answer.length).toBeGreaterThan(40);
    expect(a.refs).toEqual([]); // nothing is listed for requests with no requirement behind them
    expect(a.bullets.some((b) => /Who knows React Native and native iOS\?/.test(b))).toBe(true); // alternative: requirement-based
    expect(a.actions.length).toBeGreaterThan(0);
    expect(JSON.stringify(a)).not.toMatch(/\b\d+\s*\/\s*10\b|score:|rank #|#1\b/i);
  });

  it("an autonomous-decision request points to the human-review flow", async () => {
    const a = await ask("Assign Ana Ruiz to Vela Bank");
    expect(a.actions.map((x) => x.href)).toEqual(["/opportunities/new/role", "/opportunities/new/team"]);
    expect(a.answer).toMatch(/human review/i);
  });

  it("'Who is the best React Native engineer?' is declined as a ranking but still helps with the requirement", async () => {
    const a = await ask("Who is the best React Native engineer?");
    expect(a.policy).toBe("ranking");
    expect(a.answer).toMatch(/don’t rank people/i);
    expect(a.answer).toMatch(/not a ranking of people/i);
    expect(a.refs.map((r) => r.personId)).toEqual(["ana", "ethan", "mateo"]); // documented evidence, with its basis
    expect(a.refs.every((r) => /React Native: (professional|independent|training|learning)/.test(r.evidence))).toBe(true);
    expect(a.refs.find((r) => r.personId === "mateo")!.evidence).toContain("pending verification (needs confirmation)");
  });

  it("legitimate requirement-based discovery keeps working and is computed, not declined", async () => {
    for (const q of ["Who knows AWS and Terraform?", "Engineers with React Native and native iOS experience", "Who is the best match for a React Native role?"]) {
      const a = await ask(q);
      expect(a.policy).toBeUndefined();
      expect(a.provenance).toBe("computed");
      expect(a.refs.length).toBeGreaterThan(0);
    }
    const free = await ask("Who’s free for mobile work in January?", "home");
    expect(free.provenance).toBe("computed");
  });

  it("declines for engineers too, without offering staffing tools", async () => {
    const a = await new RuleBasedAssistant(getRepositories()).answer({ context: "me", question: "Rank everyone from best to worst" }, ENG);
    expect(a.policy).toBeDefined();
    expect(a.actions.map((x) => x.href)).toEqual(["/me/passport"]);
  });
});

describe("answers never present unverified evidence as fact", () => {
  const gateway = () => new RuleBasedAssistant(getRepositories());
  const staffAsk = (question: string, context: "people" | "passport" = "people", promptId?: string, subjectPersonId?: string) =>
    gateway().answer({ context, question, promptId, subjectPersonId }, STAFF);

  it("a self-reported skill is flagged and is not counted as verified experience", async () => {
    state.persona = "engineer";
    expect(await addSkill({ label: "Terraform", level: "professional" })).toEqual({ ok: true });
    const a = await staffAsk("Who knows Terraform?");
    expect(a.answer).toMatch(/^Two people have verified professional experience in Terraform\./);
    const ana = a.refs.find((r) => r.personId === "ana")!;
    expect(ana.evidence).toBe("Terraform: professional · self-reported (needs confirmation)");
    expect(ana.when).toBe("0 of 1 verified");
    expect(a.refs.map((r) => r.personId).indexOf("ana")).toBeGreaterThan(a.refs.map((r) => r.personId).indexOf("marcus")); // verified first
  });

  it("missing evidence is 'not documented', never a statement that someone lacks the capability", async () => {
    const a = await staffAsk("Who knows React Native and native iOS?");
    const ethan = a.refs.find((r) => r.personId === "ethan")!;
    expect(ethan.evidence).toBe("React Native: professional · verified · Native iOS: not documented");
    expect(ethan.when).toBe("1 of 2 verified"); // one requirement verified, the other simply not documented
  });

  it("the passport summary separates verified experience from claims still to confirm", async () => {
    state.persona = "engineer";
    await addSkill({ label: "Terraform", level: "professional" });
    const a = await staffAsk("Summarize", "passport", "passport-summary", "ana");
    expect(a.answer).toMatch(/^Ana has verified professional experience in React Native/);
    expect(a.answer).toMatch(/Not confirmed yet: Terraform\./);
  });

  it("the gaps answer lists what is only self-reported or only learning, as awaiting confirmation", async () => {
    const a = await staffAsk("gaps", "passport", "passport-gaps", "ana");
    expect(a.answer).toMatch(/no verified professional or independent experience yet/);
    expect(a.bullets.some((b) => /Kotlin Multiplatform · independent · self-reported, awaiting confirmation/.test(b))).toBe(true);
    expect(a.bullets.some((b) => /RAG applications · training only/.test(b))).toBe(true);
  });

  it("the January availability answer flags unconfirmed evidence next to its label", async () => {
    state.persona = "engineer";
    const before = await staffAsk("Who’s free for mobile work in January?", "people", "people-rn-ios");
    expect(before.provenance).toBe("computed");
    const a = await new RuleBasedAssistant(getRepositories()).answer({ context: "home", promptId: "home-mobile-january", question: "Who’s free for mobile work in January?" }, STAFF);
    expect(a.refs.find((r) => r.personId === "ana")!.evidence).toBe("React Native · Swift / SwiftUI"); // verified: no flag
  });
});
