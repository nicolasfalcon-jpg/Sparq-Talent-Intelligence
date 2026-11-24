/**
 * Phase-1 end-to-end journeys. Run with `npm run test:e2e` (first time: `npx playwright install chromium`).
 * `test` comes from ./fixtures: every test gets its own server process, so tests that mutate data
 * (shortlist, skills) always start from the pristine fictional dataset.
 */
import { expect, test } from "./fixtures";

test("Home shows computed stats and teams in the making", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Good morning, Laura.");
  await expect(page.getByText("Teams in the making")).toBeVisible();
  await expect(page.getByRole("link", { name: /Open seats/ })).toContainText("10");
});

test("Home Ask Sparq answers from data with provenance", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Who’s free for mobile work in January?" }).click();
  await expect(page.getByText("Computed from documented data")).toBeVisible();
  await expect(page.getByRole("link", { name: /Ana Ruiz/ }).first()).toBeVisible();
});

test("People: plain-language search, criteria chips and preview", async ({ page }) => {
  await page.goto("/people");
  await page.getByLabel("Describe who you are looking for").fill("React Native and native iOS");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText("I looked for")).toBeVisible();
  await expect(page).toHaveURL(/q=React/);
  await page.getByRole("link", { name: /Ana Ruiz/ }).first().click();
  await expect(page.getByRole("complementary", { name: "Profile preview" })).toBeVisible();
  await page.getByRole("button", { name: "Add to shortlist" }).click();
  await expect(page.getByRole("button", { name: "✓ On your shortlist" })).toBeVisible();
});

test("Shortlist is coherent between People and the passport", async ({ page }) => {
  await page.goto("/people?sel=javier");
  await page.getByRole("button", { name: "Add to shortlist" }).click();
  await page.goto("/people/javier");
  await expect(page.getByRole("button", { name: "✓ On your shortlist" })).toBeVisible();
});

test("Opportunities drawer is URL-addressable", async ({ page }) => {
  await page.goto("/opportunities?open=vela");
  await expect(page.getByRole("dialog")).toContainText("AI-assisted onboarding");
  await page.getByRole("button", { name: "Summarize the requirements" }).click();
  await expect(page.getByText("4 roles, 2 still open")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/opportunities$/);
});

test("Personal passport: owner edits are visible to staff", async ({ page, context }) => {
  await page.goto("/persona?as=engineer");
  await page.goto("/me/passport");
  await page.getByRole("button", { name: "Edit my passport" }).click();
  await page.getByRole("tab", { name: "Skills" }).click();
  await page.getByLabel("Add a skill").fill("Core ML");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Core ML").first()).toBeVisible();
  await context.clearCookies();
  await page.goto("/people/ana");
  await expect(page.getByText("Core ML")).toBeVisible();
});

test("Workspaces are role-guarded", async ({ page }) => {
  await page.goto("/me");
  await expect(page).toHaveURL("/");
});
