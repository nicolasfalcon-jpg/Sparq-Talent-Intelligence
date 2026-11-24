/**
 * Phase 2B.1 end-to-end coverage: application authorization, private interests, evidence verification in discovery,
 * and responsible Ask Sparq behaviour. Every test has its own server (see ./fixtures), so mutating tests need no cleanup.
 *
 * The demo persona cookie used here is NOT authentication; it is the simulated session of the fictional demo.
 */
import { expect, test } from "./fixtures";

const ENGINEER = { cookie: "sparq_demo_persona=engineer" };
const STAFF = { cookie: "sparq_demo_persona=staffing_lead" };
const PRIVATE_LABELS = ["Fintech", "Technical leadership", "Mentoring"];

test.describe("authorization over HTTP (bypassing the UI)", () => {
  test("the assistant API requires a session, and treats the request as untrusted", async ({ request }) => {
    const ask = (headers: Record<string, string>, data: unknown) => request.post("/api/assistant", { headers, data });

    const anonymous = await ask({}, { context: "home", promptId: "home-mobile-january" });
    expect(anonymous.status()).toBe(401);
    expect(await anonymous.json()).toEqual({ error: { code: "unauthenticated", message: expect.any(String) } });

    expect((await ask({ cookie: "sparq_demo_persona=admin" }, { context: "home", promptId: "home-mobile-january" })).status()).toBe(401); // forged value

    for (const data of [
      { context: "people", promptId: "people-rn-ios" },
      { context: "home", promptId: "home-mobile-january" },
      { context: "passport", promptId: "passport-summary", subjectPersonId: "lucia" },
      { context: "mypassport", promptId: "mypassport-find", subjectPersonId: "lucia" },
    ]) {
      const r = await ask(ENGINEER, data);
      expect(r.status(), JSON.stringify(data)).toBe(403);
      expect(await r.text()).not.toMatch(/Lucía|Fernández|Ruiz|Okafor/);
    }
    expect((await ask(ENGINEER, { context: "mypassport", promptId: "passport-gaps", subjectPersonId: "ana" })).status()).toBe(400); // borrowed suggestion
    expect((await ask(STAFF, { context: "home", question: "hi", role: "staffing_lead" })).status()).toBe(400); // unknown field

    const own = await ask(ENGINEER, { context: "mypassport", promptId: "mypassport-find" });
    expect(own.status()).toBe(200);
    const staff = await ask(STAFF, { context: "home", promptId: "home-mobile-january" });
    expect(staff.status()).toBe(200);
    expect((await staff.json()).provenance).toBe("computed");
  });

  test("an engineer cannot fetch staffing pages, as HTML or as a framework (RSC) payload", async ({ request }) => {
    for (const path of ["/people", "/people/lucia", "/opportunities", "/planning"]) {
      const html = await request.get(path, { headers: ENGINEER, maxRedirects: 0 });
      expect(html.status(), path).toBe(307);
      expect(html.headers().location, path).toMatch(/\/me$/);
      const rsc = await request.get(path, { headers: { ...ENGINEER, RSC: "1" }, maxRedirects: 0 });
      expect(await rsc.text(), `${path} (RSC)`).not.toMatch(/Lucía|Fernández|Okafor|Brooks|Vela Bank|Cobalt/);
    }
  });

  test("a staffing lead's passport payload never carries the owner's private interests", async ({ request }) => {
    for (const headers of [STAFF, { ...STAFF, RSC: "1" }]) {
      const body = await (await request.get("/people/ana", { headers })).text();
      for (const label of PRIVATE_LABELS) expect(body, label).not.toContain(label);
      expect(body).toContain("Applied AI in mobile"); // the one interest Ana shared
    }
  });

  test("only page navigations are handed a demo session; API calls and action-style POSTs are not", async ({ request }) => {
    const page = await request.get("/people", { maxRedirects: 0 });
    expect(page.headers()["set-cookie"]).toMatch(/sparq_demo_persona=staffing_lead/);
    const api = await request.post("/api/assistant", { data: { context: "home", promptId: "home-mobile-january" } });
    expect(api.headers()["set-cookie"]).toBeUndefined();
    const action = await request.post("/people", { headers: { "Next-Action": "00" }, data: "[]", failOnStatusCode: false });
    expect(action.headers()["set-cookie"]).toBeUndefined();
  });
});

test.describe("private career interests", () => {
  test("the owner sees what is private and what is shared, and controls it; staff only ever see what is shared", async ({ page, browser, baseURL }) => {
    const staff = await browser.newContext({ baseURL });
    const staffPage = await staff.newPage();

    await staffPage.goto("/people/ana");
    const lookingForward = staffPage.locator("section", { has: staffPage.getByRole("heading", { name: "Looking forward to" }) });
    await expect(lookingForward.getByText("Applied AI in mobile")).toBeVisible();
    for (const label of PRIVATE_LABELS) await expect(lookingForward.getByText(label)).toHaveCount(0);
    for (const label of PRIVATE_LABELS) expect(await staffPage.content()).not.toContain(label);

    await page.goto("/persona?as=engineer");
    await page.goto("/me/passport");
    await expect(page.getByText(/career goals and learning interests are private/i)).toBeVisible();
    await page.getByRole("button", { name: "Edit my passport" }).click();
    await page.getByRole("tab", { name: "Interests" }).click();
    const sharedNow = page.getByRole("button", { name: "Applied AI in mobile: shared with staffing" });
    const fintech = page.getByRole("button", { name: "Fintech: private" });
    await expect(sharedNow).toHaveAttribute("aria-pressed", "true");
    await expect(fintech).toHaveAttribute("aria-pressed", "false");

    await fintech.click();
    await expect(page.getByRole("button", { name: "Fintech: shared with staffing" })).toBeVisible();
    await staffPage.reload();
    await expect(lookingForward.getByText("Fintech")).toBeVisible();
    await expect(lookingForward.getByText("Technical leadership")).toHaveCount(0);

    await page.getByRole("button", { name: "Fintech: shared with staffing" }).click();
    await expect(page.getByRole("button", { name: "Fintech: private" })).toBeVisible();
    await staffPage.reload();
    await expect(lookingForward.getByText("Fintech")).toHaveCount(0);
    await staff.close();
  });

  test("professional preferences are disclosed only while the owner shares them", async ({ page, browser, baseURL }) => {
    const staff = await browser.newContext({ baseURL });
    const staffPage = await staff.newPage();
    await staffPage.goto("/people/ana");
    await expect(staffPage.getByText(/Open to travel up to 20%/)).toBeVisible();

    await page.goto("/persona?as=engineer");
    await page.goto("/me/passport");
    await page.getByRole("button", { name: "Edit my passport" }).click();
    await page.getByRole("tab", { name: "Interests" }).click();
    await page.getByRole("button", { name: "Work preferences: shared with staffing" }).click();
    await expect(page.getByRole("button", { name: "Work preferences: private" })).toBeVisible();

    await staffPage.reload();
    await expect(staffPage.getByText(/Open to travel/)).toHaveCount(0);
    expect(await staffPage.content()).not.toContain("Open to travel");
    await staff.close();
  });
});

test.describe("evidence: source and verification, in discovery and on the passport", () => {
  test("a self-reported skill is flagged everywhere it appears, and ranks after verified experience", async ({ page, browser, baseURL }) => {
    await page.goto("/persona?as=engineer");
    await page.goto("/me/passport");
    await page.getByRole("button", { name: "Edit my passport" }).click();
    await page.getByRole("tab", { name: "Skills" }).click();
    await page.getByLabel("Add a skill").fill("Terraform");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("✓ Skill added · self-reported until a delivery lead confirms it")).toBeVisible();
    await expect(page.locator("[role=dialog] span", { hasText: "Terraform" }).getByText("self-reported")).toBeVisible();

    const staff = await browser.newContext({ baseURL });
    const sp = await staff.newPage();
    await sp.goto("/people?q=Terraform");
    const cards = sp.locator("main a[href*='sel=']");
    await expect(cards).toHaveCount(3);
    expect((await cards.nth(0).innerText())).toContain("Marcus Chen");
    expect((await cards.nth(1).innerText())).toContain("Tomás Herrera");
    await expect(cards.nth(2)).toContainText("Ana Ruiz");
    await expect(cards.nth(2)).toContainText("self-reported");
    await expect(cards.nth(0)).not.toContainText("self-reported");
    await expect(sp.getByText("Ordered by verified evidence for these requirements, then availability")).toBeVisible();

    await sp.goto("/people/ana");
    await expect(sp.getByText("Self-reported or pending: needs confirmation")).toBeVisible(); // legend
    await staff.close();
  });

  test("pending verification and 'not documented' are shown honestly in search", async ({ page }) => {
    await page.goto("/people?q=React+Native+and+native+iOS");
    const mateo = page.locator("main a[href*='sel=mateo']");
    await expect(mateo).toContainText("pending");
    await expect(page.locator("main a[href*='sel=ana']")).not.toContainText("pending");
    await expect(page.locator("main a[href*='sel=ethan']")).toContainText("Native iOS · not documented"); // not "can't"
  });

  test("project evidence separates who confirmed it from the person's own claim", async ({ page }) => {
    await page.goto("/people/ana");
    await expect(page.getByText("Confirmed by Rafael Ortiz, delivery lead · Nov 2026")).toBeVisible();
    await page.getByRole("button", { name: "Show evidence" }).last().click();
    await expect(page.getByText(/Self-reported · awaiting confirmation by a delivery lead/)).toBeVisible();
  });

  test("verified evidence cannot be removed by its owner; unverified claims can be withdrawn", async ({ page }) => {
    await page.goto("/persona?as=engineer");
    await page.goto("/me/passport");
    await page.getByRole("button", { name: "Edit my passport" }).click();
    await page.getByRole("tab", { name: "Skills" }).click();
    await expect(page.getByRole("button", { name: "Remove React Native" })).toHaveCount(0); // verified: locked
    await expect(page.getByRole("button", { name: "Remove AWS Developer" })).toHaveCount(0); // verified certification: locked
    const kmp = page.getByRole("button", { name: "Remove Kotlin Multiplatform" }); // self-reported: removable
    await expect(kmp).toBeVisible();
    await kmp.click();
    await expect(page.getByRole("button", { name: "Remove Kotlin Multiplatform" })).toHaveCount(0);
    await expect(page.locator("[role=dialog] span", { hasText: "React Native" }).first()).toBeVisible(); // still there
  });
});

test.describe("Ask Sparq responsible behaviour", () => {
  const send = async (page: import("@playwright/test").Page, text: string) => {
    await page.locator("#nav-ai-q").fill(text);
    await page.getByRole("button", { name: "Send" }).click();
  };

  test("declines to rank people, explains why, and offers a requirement-based alternative", async ({ page }) => {
    await page.goto("/people");
    await page.getByRole("button", { name: /Ask Sparq about/ }).click();
    await send(page, "Rank the engineers from best to worst");
    const panel = page.getByRole("dialog").first();
    await expect(panel.getByText("Guidance", { exact: true })).toBeVisible();
    await expect(panel.getByText(/I don’t rank people from best to worst/)).toBeVisible();
    await expect(panel.getByText("Try: “Who knows React Native and native iOS?”")).toBeVisible();
    await expect(panel.locator("a[href^='/people/']")).toHaveCount(0); // no names listed
  });

  test("'who is the best …' is declined as a ranking but still shows documented evidence for the requirement", async ({ page }) => {
    await page.goto("/people");
    await page.getByRole("button", { name: /Ask Sparq about/ }).click();
    await send(page, "Who is the best React Native engineer?");
    const panel = page.getByRole("dialog").first();
    await expect(panel.getByText(/not a ranking of people/)).toBeVisible();
    await expect(panel.getByText(/React Native: independent · pending verification \(needs confirmation\)/)).toBeVisible();
  });

  test("requirement-based questions keep working", async ({ page }) => {
    await page.goto("/");
    await page.locator("#ask").fill("Who knows AWS and Terraform?");
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(page.getByText("Computed from documented data")).toBeVisible();
    await expect(page.getByText(/verified professional experience in all of Terraform and AWS/)).toBeVisible();
  });

  test("an engineer's assistant stays inside their own scope", async ({ page }) => {
    await page.goto("/persona?as=engineer");
    await page.goto("/me/passport");
    await page.getByRole("button", { name: /Ask Sparq about/ }).click();
    await send(page, "Who knows AWS and Terraform?");
    const panel = page.getByRole("dialog").first();
    await expect(panel.getByText(/I can only use your own passport and open opportunities/)).toBeVisible();
    await expect(panel.locator("a[href^='/people/']")).toHaveCount(0);
  });
});
