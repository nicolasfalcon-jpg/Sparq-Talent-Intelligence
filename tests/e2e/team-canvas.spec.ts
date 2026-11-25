/**
 * Build a Team: the visual canvas journey, its geometry at both viewport projects (1440 and 1024) and who may open it.
 * Written against the memory adapter (each test has its own server). Not executed by its author: run with `npm run test:e2e`.
 */
import { expect, test } from "./fixtures";

const open = (page: import("@playwright/test").Page) => page.goto("/opportunities/new/team?from=cobalt");

test("compose from an existing opportunity, place a person, review and send: nobody is assigned", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Pick the project.");
  await expect(page.getByRole("radio", { name: /Cobalt Mobility/ })).toBeChecked();
  await page.getByRole("button", { name: "Compose the team" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Cobalt Mobility team");
  await expect(page.getByText("3 roles · 0 placed · kick-off Jan 19")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review & propose" })).toBeDisabled();

  await page.getByRole("button", { name: /^iOS Engineer, open seat/ }).click();
  const drawer = page.getByRole("dialog", { name: /Position details: iOS Engineer/ });
  await expect(drawer.getByText("Ordered by documented matches, then availability")).toBeVisible();
  await drawer.getByRole("group", { name: "Ana Ruiz" }).getByRole("button", { name: "Propose" }).click();
  await drawer.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("button", { name: /^iOS Engineer, Ana Ruiz, proposed/ })).toBeVisible();
  await expect(page.getByText("3 roles · 1 placed · kick-off Jan 19")).toBeVisible();

  await page.getByRole("button", { name: "Review & propose" }).click();
  const modal = page.getByRole("dialog", { name: "Team proposal" });
  await expect(modal.getByText(/Reviewer: Inés Vidal, delivery lead · nothing is assigned automatically/)).toBeVisible();
  await expect(modal.getByText("Android Engineer seat is still open")).toBeVisible();
  await modal.getByRole("button", { name: "Send for review" }).click();

  await expect(page.getByRole("status").filter({ hasText: "Nobody has been assigned" })).toBeVisible();
  await expect(page.getByRole("button", { name: "✓ Sent for review" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "+ Add a role" })).toHaveCount(0);
  await expect(page).toHaveURL(/proposal=/);
});

test("a saved draft can be reopened from the describe stage", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Compose the team" }).click();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("button", { name: "✓ Saved" })).toBeVisible();
  await page.goto("/opportunities/new/team");
  await expect(page.getByRole("link", { name: /Cobalt Mobility team/ })).toBeVisible();
  await page.getByRole("link", { name: /Cobalt Mobility team/ }).click();
  await expect(page.getByRole("button", { name: /^iOS Engineer, open seat/ })).toBeVisible();
});

test("canvas geometry: seats stay inside the canvas and never overlap the project card or each other", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Compose the team" }).click();
  await page.getByRole("button", { name: "+ Add a role" }).click();
  await page.getByRole("menuitem", { name: /Cloud Engineer/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  const canvas = page.getByRole("region", { name: "Team canvas" });
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  const seats = await canvas.getByRole("button").all();
  expect(seats).toHaveLength(4);
  type Rect = { x: number; y: number; width: number; height: number };
  const rects: Rect[] = [];
  for (const s of seats) rects.push((await s.boundingBox())!);
  for (const r of rects) {
    expect(r.x).toBeGreaterThanOrEqual(box.x); expect(r.x + r.width).toBeLessThanOrEqual(box.x + box.width);   // two-sided bounds
    expect(r.y).toBeGreaterThanOrEqual(box.y); expect(r.y + r.height).toBeLessThanOrEqual(box.y + box.height);
  }
  const overlap = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlap(rects[i]!, rects[j]!), `seats ${i} and ${j} overlap`).toBe(false);
  const card = (await canvas.getByText("Kick-off Jan 19 · 9 months").locator("xpath=..").boundingBox())!;
  for (const r of rects) expect(overlap(r, card), "a seat overlaps the project card").toBe(false);
});

test.describe("who may open Build a Team", () => {
  test("an engineer is sent to their own space", async ({ page }) => {
    await page.goto("/persona?as=engineer");
    await page.goto("/opportunities/new/team");
    await expect(page).toHaveURL(/\/me$/);
  });
  test("a delivery lead reviews proposals but cannot compose them", async ({ page }) => {
    await page.goto("/persona?as=delivery_lead");
    await page.goto("/opportunities/new/team");
    await expect(page).toHaveURL(/\/opportunities$/);
  });
  test("an administrator is sent to the admin page", async ({ page }) => {
    await page.goto("/persona?as=admin");
    await page.goto("/opportunities/new/team");
    await expect(page).toHaveURL(/\/admin$/);
  });
});
