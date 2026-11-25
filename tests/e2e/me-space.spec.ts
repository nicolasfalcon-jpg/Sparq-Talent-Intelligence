/** My Space: Now/Next, fitting open roles, expressing and withdrawing interest. Written for the lead's integration run. */
import { expect, test } from "./fixtures";

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "sparq_demo_persona", value: "engineer", url: baseURL! }]);
});

test("My Space shows Now and Next, a passport checklist without a percentage, and open roles with the reason they are shown", async ({ page }) => {
  await page.goto("/me");
  await expect(page.getByRole("heading", { name: /Hi, Ana/ })).toBeVisible();
  await expect(page.getByText("Now", { exact: true })).toBeVisible();
  await expect(page.getByText("Next", { exact: true })).toBeVisible();
  await expect(page.getByText(/Why you’re seeing this/).first()).toBeVisible();
  await expect(page.getByRole("complementary", { name: "My Talent Passport" })).not.toContainText("%");
  await expect(page.getByText("Nimbus Health")).toHaveCount(0); // not published (Upcoming)
});

test("sharing interest needs the confirmation dialog, says who sees it, and withdrawing is immediate", async ({ page }) => {
  await page.goto("/me");
  const card = page.getByRole("article").filter({ hasText: "iOS Engineer" }).first();
  await card.getByRole("button", { name: "I’m interested" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Only staffing leads and the opportunity’s delivery lead");
  await dialog.getByRole("button", { name: "Share interest" }).click();
  await expect(page.getByRole("status")).toContainText("Interest shared");
  await expect(page.getByRole("region", { name: "Interests you’ve shared" })).toContainText("iOS Engineer");
  await card.getByRole("button", { name: "Withdraw" }).click();
  await expect(card.getByRole("button", { name: "I’m interested" })).toBeVisible();
});

test("career interests stay private unless shared", async ({ page }) => {
  await page.goto("/me");
  const section = page.getByRole("region", { name: "What I’m looking for" });
  await expect(section.getByRole("button", { name: /Technical leadership: private/ })).toBeVisible();
});

test("staffing leads cannot open My Space", async ({ context, page, baseURL }) => {
  await context.clearCookies();
  await context.addCookies([{ name: "sparq_demo_persona", value: "staffing_lead", url: baseURL! }]);
  await page.goto("/me");
  await expect(page).toHaveURL("/");
});
