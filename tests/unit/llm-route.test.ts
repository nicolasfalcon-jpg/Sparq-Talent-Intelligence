/**
 * Route-level behaviour with the Claude gateway selected (ANTHROPIC_API_KEY present) and the SDK replaced by a fake:
 * provenance, 429 on the per-user limit, deterministic selection, page-context authorization and server-only credentials.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ persona: undefined as string | undefined, create: vi.fn(), constructed: [] as unknown[] }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (n === "sparq_demo_persona" && state.persona ? { value: state.persona } : undefined) }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); } }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class FakeAnthropic {
    messages = { create: (...a: unknown[]) => state.create(...a) };
    constructor(opts: unknown) { state.constructed.push(opts); }
  },
}));

import { POST } from "@/app/api/assistant/route";
import { users } from "@/data/fixtures/organization";
import { getRepositories } from "@/data/repositories";
import { resetMemoryStore } from "@/data/repositories/memory";
import { resolveAssistantRequest } from "@/features/ask-sparq/access";
import { resetUsage } from "@/features/ask-sparq/llm/limiter";
import { AssistantRequest } from "@/domain/schemas";

const aiMessage = (answer = "Two people have documented React Native experience.") => ({
  id: "m", type: "message", role: "assistant", model: "claude-sonnet-5-5", stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
  content: [{ type: "text", text: JSON.stringify({ answer, bullets: [], refs: [] }) }],
});
const call = (body: unknown) => POST(new Request("http://localhost/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
const staff = users.find((u) => u.role === "staffing_lead")!;
const eng = users.find((u) => u.role === "engineer")!;
const A = (u: typeof staff) => ({ id: u.id, role: u.role, personId: u.personId });

const ENV_KEYS = ["ANTHROPIC_API_KEY", "SPARQ_ASSISTANT_PROVIDER", "SPARQ_ASSISTANT_DAILY_LIMIT", "SPARQ_ASSISTANT_MODEL"] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  resetMemoryStore(); resetUsage(); state.persona = "staffing_lead"; state.create.mockReset(); state.constructed.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

describe("provider selection", () => {
  it("without ANTHROPIC_API_KEY the deterministic gateway answers and no SDK client is built", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await call({ context: "people", promptId: "people-rn-ios" });
    expect(res.status).toBe(200);
    expect((await res.json()).provenance).toBe("computed");
    expect(state.constructed).toHaveLength(0);
  });

  it('SPARQ_ASSISTANT_PROVIDER="rules" forces the deterministic gateway even with a key', async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-not-real"; process.env.SPARQ_ASSISTANT_PROVIDER = "rules";
    expect((await (await call({ context: "people", promptId: "people-rn-ios" })).json()).provenance).toBe("computed");
    expect(state.create).not.toHaveBeenCalled();
  });

  it("with a key, a model answer is labelled ai and the client is built with bounded retries", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-not-real";
    state.create.mockResolvedValue(aiMessage());
    const res = await call({ context: "people", question: "Who has React Native experience?" });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.provenance).toBe("ai");
    expect(body.model).toBe("claude-sonnet-5-5");
    expect(state.constructed[0]).toMatchObject({ maxRetries: 1 });
  });

  it("the model is configurable with SPARQ_ASSISTANT_MODEL", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-not-real"; process.env.SPARQ_ASSISTANT_MODEL = "claude-opus-5-5";
    state.create.mockResolvedValue(aiMessage());
    await call({ context: "people", question: "Who has React Native experience?" });
    expect(state.create.mock.calls[0]![0].model).toBe("claude-opus-5-5");
  });

  it("a deterministic suggestion is also answered by the model when a key is present (live from this page)", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-not-real";
    state.create.mockResolvedValue(aiMessage("Documented coverage looks reasonable."));
    const body = await (await call({ context: "team", promptId: "team-coverage", opportunityId: "cobalt", seats: [{ capabilities: ["Swift"], personId: "javier" }] })).json();
    expect(body.provenance).toBe("ai");
    expect(String(state.create.mock.calls[0]![0].messages[0].content)).toContain('"opportunityId":"cobalt"');
  });

  it("a model failure answers with the deterministic result labelled fallback (HTTP 200)", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-not-real";
    state.create.mockRejectedValue(new Error("upstream down"));
    const res = await call({ context: "people", promptId: "people-rn-ios" });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.provenance).toBe("fallback");
    expect(body.notice).toBeTruthy();
    expect(body.refs.length).toBeGreaterThan(0);
  });
});

describe("usage limit", () => {
  it("returns 429 with a friendly message once the daily limit is used, without calling the model", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-not-real"; process.env.SPARQ_ASSISTANT_DAILY_LIMIT = "2";
    state.create.mockResolvedValue(aiMessage());
    const q = { context: "people", question: "Who has React Native experience?" };
    expect((await call(q)).status).toBe(200);
    expect((await call(q)).status).toBe(200);
    const res = await call(q);
    expect(res.status).toBe(429);
    expect((await res.json()).error).toEqual({ code: "quota_exceeded", message: expect.stringMatching(/limit/i) });
    expect(state.create).toHaveBeenCalledTimes(2);
  });
});

describe("page context is re-authorized on the server", () => {
  const repos = () => getRepositories();
  const parse = (o: unknown) => AssistantRequest.parse(o);

  it("the request schema stays strict", () => {
    expect(AssistantRequest.safeParse({ context: "team", question: "hi", asAdmin: true }).success).toBe(false);
    expect(AssistantRequest.safeParse({ context: "team", question: "hi", seats: [{ capabilities: ["x"], personId: null, role: "admin" }] }).success).toBe(false);
    expect(AssistantRequest.safeParse({ context: "team", question: "hi", seats: Array.from({ length: 13 }, () => ({ capabilities: [] })) }).success).toBe(false);
  });

  it("staff can pass an existing opportunity and readable people", async () => {
    const r = await resolveAssistantRequest(repos(), A(staff), parse({ context: "team", promptId: "team-coverage", opportunityId: "cobalt", seats: [{ capabilities: ["Swift"], personId: "javier" }, { capabilities: ["Kotlin"] }] }));
    expect(r.opportunityId).toBe("cobalt");
    expect(r.seats).toHaveLength(2);
  });

  it.each([
    ["an unknown opportunity", { context: "team", question: "hi", opportunityId: "nope" }, /doesn’t exist/],
    ["an unknown person in a seat", { context: "team", question: "hi", seats: [{ capabilities: ["Swift"], personId: "ghost" }] }, /doesn’t exist/],
    ["seats on a page that has none", { context: "home", question: "hi", seats: [{ capabilities: ["Swift"] }] }, /can’t be passed/],
    ["an opportunity on a page that has none", { context: "people", question: "hi", opportunityId: "cobalt" }, /can’t be named/],
  ])("%s is refused", async (_n, body, msg) => {
    await expect(resolveAssistantRequest(repos(), A(staff), parse(body))).rejects.toThrow(msg);
  });

  it("an engineer cannot attach staff page context, even where the context is theirs", async () => {
    await expect(resolveAssistantRequest(repos(), A(eng), parse({ context: "me", question: "hi", opportunityId: "cobalt" }))).rejects.toThrow();
    await expect(resolveAssistantRequest(repos(), A(eng), parse({ context: "team", question: "hi", seats: [{ capabilities: ["Swift"], personId: "lucia" }] }))).rejects.toThrow();
  });

  it("over HTTP an engineer naming a staff context is 403 and an unknown seat person is 404", async () => {
    state.persona = "engineer";
    expect((await call({ context: "team", question: "hi", seats: [{ capabilities: ["Swift"], personId: "lucia" }] })).status).toBe(403);
    state.persona = "staffing_lead";
    expect((await call({ context: "team", question: "hi", seats: [{ capabilities: ["Swift"], personId: "ghost" }] })).status).toBe(404);
  });
});

describe("server-only credentials", () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) ? [p] : []; });
  const files = walk("src").map((p) => ({ p, text: readFileSync(p, "utf8") }));

  it("no client component imports the Anthropic SDK or reads the key", () => {
    const clients = files.filter((f) => /^\s*["']use client["']/.test(f.text));
    expect(clients.length).toBeGreaterThan(5);
    for (const f of clients) {
      expect(f.text, f.p).not.toMatch(/@anthropic-ai\/sdk/);
      expect(f.text, f.p).not.toMatch(/ANTHROPIC_API_KEY/);
    }
  });

  it("only the assistant's server modules touch the SDK or the key, and each is server-only", () => {
    for (const f of files) {
      if (!/@anthropic-ai\/sdk|ANTHROPIC_API_KEY/.test(f.text)) continue;
      expect(f.p, f.p).toMatch(/src\/features\/ask-sparq\/(service|llm\/.+)\.ts$/);
      expect(f.text, f.p).toMatch(/import "server-only"/);
    }
  });

  it("nothing in src reads the Supabase service-role key or the database URL", () => {
    for (const f of files) expect(f.text, f.p).not.toMatch(/SERVICE_ROLE|SUPABASE_DB_URL/);
  });

  it("there is no fallbacks parameter and no second model anywhere in the gateway", () => {
    for (const f of files.filter((x) => x.p.includes("ask-sparq/llm") || x.p.endsWith("ask-sparq/service.ts"))) {
      expect(f.text, f.p).not.toMatch(/fallbacks\s*:|server-side-fallback|betas\s*:/);
    }
  });
});
