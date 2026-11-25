/**
 * The primary demonstration journey, end to end, in memory mode with the demo persona (NOT authentication):
 * Discover talent → review a Passport → Build a Team → submit the proposal → Delivery Lead review → explicit assignment
 * confirmation → Planning → Ask Sparq. (Login is covered by the Supabase auth unit tests; real sign-in needs a Supabase project.)
 * The persona route redirects to `localhost` while the test server is on 127.0.0.1, so each persona switch navigates again.
 */
import { expect, test } from "./fixtures";

const persona = async (page: import("@playwright/test").Page, as: string) => { await page.goto(`/persona?as=${as}`); await page.goto("/opportunities"); };

test("discover → passport → build a team → submit → delivery lead review → confirm → planning → Ask Sparq", async ({ page }) => {
  // Discover and review a Passport (staffing lead)
  await page.goto("/people");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goto("/people/priya");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Priya");

  // Build a Team on Terra Foods (reviewer: Rafael Ortiz) and submit it
  await page.goto("/opportunities/new/team?from=terra");
  await page.getByRole("button", { name: "Compose the team" }).click();
  await page.getByRole("button", { name: /^Data Engineer, open seat/ }).first().click();
  const drawer = page.getByRole("dialog", { name: /Position details: Data Engineer/ });
  await drawer.getByRole("group", { name: "Priya Nair" }).getByRole("button", { name: "Propose" }).click();
  await drawer.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Review & propose" }).click();
  await page.getByRole("dialog", { name: "Team proposal" }).getByRole("button", { name: "Send for review" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Nobody has been assigned" })).toBeVisible();

  // Delivery Lead review: approving assigns nobody
  await persona(page, "delivery_lead");
  await expect(page.getByRole("heading", { name: /Proposals to review/i })).toBeVisible();
  await page.getByRole("link", { name: /Terra Foods/ }).first().click();
  await page.getByRole("radio", { name: "Approve" }).click();
  await page.getByRole("button", { name: "Record decision" }).click();
  await expect(page.getByText(/Approved\. Confirm each seat/)).toBeVisible();

  // Explicit, separate assignment confirmation
  await page.getByRole("button", { name: "Confirm assignment" }).click();
  // Priya is free from Feb 16 (after kick-off): starting earlier is refused by the capacity rule, so start when she is free.
  await page.getByLabel("Starts").fill("2027-02-09");
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(/above full-time/);
  await page.getByLabel("Starts").fill("2027-02-16");
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByText(/Confirmed/).first()).toBeVisible();

  // Planning (staffing lead) and Ask Sparq
  await persona(page, "staffing_lead");
  await page.goto("/planning");
  await expect(page.locator("main")).toContainText("Priya Nair");
  await page.goto("/");
  await page.getByRole("button", { name: "Who’s free for mobile work in January?" }).click();
  await expect(page.getByText("Computed from documented data")).toBeVisible();
});
