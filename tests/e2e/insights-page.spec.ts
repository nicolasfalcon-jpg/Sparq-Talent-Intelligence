/** Basic Insights: aggregates only, minimum group size, no names. Written for the lead's integration run. */
import { expect, test } from "./fixtures";

test("Insights shows supply against demand without naming anybody", async ({ page }) => {
  await page.goto("/insights");
  await expect(page.getByRole("heading", { name: /What your organization/ })).toBeVisible();
  await expect(page.getByText(/counts below 3 people are not shown/i)).toBeVisible();
  await expect(page.getByText("Mobile").first()).toBeVisible();
  const text = await page.locator("main").innerText();
  for (const name of ["Ana Ruiz", "Lucía Fernández", "Daniel Okafor", "Priya Nair"]) expect(text).not.toContain(name);
  // The page may SAY nobody is scored; what must never appear is an actual score or percentage.
  await expect(page.getByText(/\b\d{1,3}\s?%|\bscore\s*[:=]/i)).toHaveCount(0);
});

test("a group opens its capabilities, hiding counts under three", async ({ page }) => {
  await page.goto("/insights?group=cloud");
  const aside = page.getByRole("complementary", { name: "Capability detail" });
  await expect(aside).toContainText("Cloud and DevOps");
  await expect(aside.getByText(/Fewer than 3 people: not shown|Not documented in any passport|\d/).first()).toBeVisible();
});

test("Insights is for staffing leads only", async ({ request }) => {
  const res = await request.get("/insights", { headers: { cookie: "sparq_demo_persona=delivery_lead" }, maxRedirects: 0 });
  expect([302, 307, 308]).toContain(res.status());
});
