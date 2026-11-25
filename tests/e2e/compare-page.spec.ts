/** Compare (read-only, max 3, documented evidence). Written for the lead's integration run; the demo persona cookie is not authentication. */
import { expect, test } from "./fixtures";

test("Compare shows the chosen people side by side with source and verification, and no winner", async ({ page }) => {
  await page.goto("/compare?ids=ana,javier,ethan&role=vela-mobile&from=role");
  await expect(page.getByRole("heading", { name: /Side by side/ })).toBeVisible();
  for (const name of ["Ana Ruiz", "Javier Morales", "Ethan Brooks"]) await expect(page.getByRole("article", { name })).toBeVisible();
  await expect(page.getByText("React Native").first()).toBeVisible();
  // The page may SAY it does not rank; what must never appear is an actual score, percentage or verdict about a person.
  await expect(page.getByText(/\b\d{1,3}\s?%|\bscore\s*[:=]|\b(best|top) (fit|candidate|match)\b|\bwinner:/i)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /← Fill a role/ })).toBeVisible();
});

test("a requirement nobody documented is 'not documented', never 'no'", async ({ page }) => {
  await page.goto("/compare?ids=ana,javier&caps=Snowflake");
  await expect(page.getByText(/not documented/i).first()).toBeVisible();
});

test("Compare keeps at most three profiles and asks for two", async ({ page }) => {
  await page.goto("/compare?ids=ana,javier,ethan,sofia&caps=Swift");
  await expect(page.getByRole("status")).toContainText("up to 3");
  await expect(page.getByRole("article")).toHaveCount(3);
  await page.goto("/compare?ids=ana");
  await expect(page.getByText("Choose at least two people to compare.")).toBeVisible();
});

test("Compare is for staffing leads only", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL });
  await ctx.addCookies([{ name: "sparq_demo_persona", value: "engineer", url: String(baseURL) }]);
  const page = await ctx.newPage();
  await page.goto("/compare?ids=ana,javier");
  await expect(page).toHaveURL(/\/me$/);
  await ctx.close();
});
