/** Planning (read-only timeline). Written for the lead's integration run. */
import { expect, test } from "./fixtures";

test("Planning shows availability, kick-offs and who is free within 60 days", async ({ page }) => {
  await page.goto("/planning");
  await expect(page.getByRole("heading", { name: /Who’s free/ })).toBeVisible();
  await expect(page.getByText("Kick-offs")).toBeVisible();
  await expect(page.getByText("Free within 60 days")).toBeVisible();
  await expect(page.getByRole("link", { name: /Lucía Fernández: Free now/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /awaiting human review/ }).first()).toBeVisible(); // proposals are drawn as proposals, not assignments
});

test("selecting a bar opens its explanation; pending availability offers a disabled confirmation request", async ({ page }) => {
  await page.goto("/planning?sel=daniel:pending");
  const aside = page.getByRole("complementary", { name: "Details" });
  await expect(aside).toContainText("Pending confirmation");
  await expect(aside.getByRole("button", { name: /to confirm/ })).toBeDisabled();
});

test("Planning filters by discipline and switches between weeks and months through the URL", async ({ page }) => {
  await page.goto("/planning?disc=AI");
  await expect(page.getByRole("link", { name: /Valentina Rojas/ }).first()).toBeVisible();
  await expect(page.getByText("Mateo Silva")).toHaveCount(0);
  await page.getByRole("link", { name: "Months" }).click();
  await expect(page).toHaveURL(/view=m/);
});

test("Planning is for staffing leads only", async ({ request }) => {
  const res = await request.get("/planning", { headers: { cookie: "sparq_demo_persona=engineer" }, maxRedirects: 0 });
  expect([302, 307, 308]).toContain(res.status());
  expect(res.headers().location).toMatch(/\/me$/);
});
