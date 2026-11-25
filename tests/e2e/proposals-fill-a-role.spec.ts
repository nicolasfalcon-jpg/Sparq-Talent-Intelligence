/**
 * Fill a Role and the delivery-lead review journey (written for the phase B workflows; run by the lead at integration).
 * Memory mode with the demo persona (NOT authentication). The demo delivery lead is Rafael Ortiz (Vela Bank, Terra Foods).
 * Every test has its own server (see ./fixtures), so these mutating journeys need no cleanup.
 */
import { expect, test } from "./fixtures";

// The persona route redirects to `localhost` while the test server is on 127.0.0.1 (a Next.js quirk), so land on the right host by navigating again.
const persona = async (page: import("@playwright/test").Page, as: string) => { await page.goto(`/persona?as=${as}`); await page.goto("/opportunities"); };

test.describe("Fill a Role → review → confirm", () => {
  test("propose one person, send for human review, and the delivery lead approves and then confirms separately", async ({ page }) => {
    await page.goto("/opportunities/new/role?opportunity=terra&role=terra-de1");
    await expect(page.getByRole("heading", { name: /Data Engineer/i })).toBeVisible();
    await expect(page.getByText("What this role needs")).toBeVisible();

    await page.getByRole("button", { name: /Find people with this experience/i }).click();
    await expect(page.getByText(/Ordered by documented evidence, then availability/i)).toBeVisible();
    // no score, rank or percentage about people anywhere on the screen
    await expect(page.locator("body")).not.toContainText(/\b\d{1,3}\s?%/);

    await page.getByRole("button", { name: /^Propose$/ }).first().click(); // the first candidate in documented-evidence order
    await expect(page.getByText(/proposed for this role/i)).toBeVisible();
    await page.getByRole("button", { name: "Send for review" }).click();
    await expect(page.getByRole("dialog")).toContainText(/Rafael Ortiz, delivery lead/);
    await expect(page.getByRole("dialog")).toContainText(/Proposing isn’t assigning/);
    await page.getByRole("button", { name: /^Send$/ }).click();
    await expect(page.getByRole("status").filter({ hasText: /Nobody has been assigned/ })).toBeVisible();

    // the delivery lead reviews on Opportunities
    await persona(page, "delivery_lead");
    await expect(page).toHaveURL(/\/opportunities$/);
    await expect(page.getByRole("heading", { name: /Proposals to review/i })).toBeVisible();
    await page.getByRole("link", { name: /Terra Foods/ }).first().click();
    await page.getByRole("radio", { name: "Approve" }).click();
    await page.getByRole("button", { name: "Record decision" }).click();
    await expect(page.getByText(/Approved\. Confirm each seat/)).toBeVisible();

    // approving assigned nobody: confirming is a separate, explicit act
    await expect(page.getByRole("button", { name: "Confirm assignment" })).toBeVisible();
  });

  test("a staffing lead can't review and an engineer can't open Fill a Role", async ({ page }) => {
    await persona(page, "engineer");
    await page.goto("/opportunities/new/role");
    await expect(page).toHaveURL(/\/me$/);
    await persona(page, "staffing_lead");
    await page.goto("/opportunities/new/role?opportunity=vela&role=vela-mobile");
    await expect(page.getByText("What this role needs")).toBeVisible();
    await persona(page, "admin");
    await page.goto("/opportunities/new/role");
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("a delivery lead sees only their own opportunities and no people directory", async ({ page }) => {
    await persona(page, "delivery_lead");
    await expect(page.getByRole("link", { name: /Cobalt Mobility/ })).toHaveCount(0); // Inés's opportunity
    await expect(page.getByRole("link", { name: /Vela Bank/ })).not.toHaveCount(0); // their own
    await expect(page.getByRole("link", { name: /Terra Foods/ })).not.toHaveCount(0); // their own
    await page.goto("/people");
    await expect(page).toHaveURL(/\/opportunities$/);
  });
});
