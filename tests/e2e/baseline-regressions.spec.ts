/**
 * Regression tests for the phase 2A defects (each one was reproduced in a browser before it was fixed).
 * Like every spec here they use ./fixtures, so each test runs against its own fresh server.
 */
import { expect, test } from "./fixtures";

const CORAL = "rgb(241, 91, 64)";

test("Home opportunity cards keep every element inside the card at all supported widths", async ({ page }) => {
  // Regression: at ~1000–1130px the Vela card's arrow button was pushed outside the card.
  for (const width of [1440, 1280, 1181, 1130, 1100, 1024, 1013, 1012, 1000, 960, 800]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const cards = page.locator("section[aria-labelledby=teams-h] a[href^='/opportunities?open=']");
    await expect(cards).toHaveCount(4);
    const overflowing = await cards.evaluateAll((els) =>
      els.flatMap((card) => {
        const box = card.getBoundingClientRect();
        const innerRight = box.right - parseFloat(getComputedStyle(card).paddingRight);
        return [...card.querySelectorAll("*")]
          .filter((e) => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().right > innerRight + 0.5)
          .map((e) => `${card.getAttribute("href")} <${e.tagName.toLowerCase()}> sticks out by ${(e.getBoundingClientRect().right - innerRight).toFixed(1)}px`);
      }),
    );
    expect(overflowing, `elements outside the card padding at ${width}px`).toEqual([]);
  }
});

test.describe("keyboard focus is visible on text inputs", () => {
  test("People search bar shows the coral ring on its pill", async ({ page }) => {
    await page.goto("/people");
    await expect(page.locator("#nl")).toBeVisible(); // streamed content is swapped in after `load`; a hidden input cannot take focus
    await page.locator("#nl").focus();
    const pill = page.getByRole("search");
    await expect(pill).toHaveCSS("outline-style", "solid");
    await expect(pill).toHaveCSS("outline-width", "2px");
    await expect(pill).toHaveCSS("outline-color", CORAL);
  });

  test("Home Ask Sparq field shows the ring on its pill", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#ask")).toBeVisible();
    await page.locator("#ask").focus();
    const pill = page.locator("#ask").locator("..");
    await expect(pill).toHaveCSS("outline-style", "solid");
    await expect(pill).toHaveCSS("outline-color", CORAL);
  });

  test("Ask Sparq panel field shows the ring on its pill", async ({ page }) => {
    await page.goto("/people");
    await page.getByRole("button", { name: /Ask Sparq about/ }).click();
    await page.locator("#nav-ai-q").focus();
    const pill = page.locator("#nav-ai-q").locator("..");
    await expect(pill).toHaveCSS("outline-style", "solid");
    await expect(pill).toHaveCSS("outline-color", CORAL);
  });

  test("passport edit fields use the global ring", async ({ page }) => {
    await page.goto("/persona?as=engineer");
    await page.goto("/me/passport");
    await page.getByRole("button", { name: "Edit my passport" }).click();
    await page.locator("#sum").focus();
    await expect(page.locator("#sum")).toHaveCSS("outline-style", "solid");
    await expect(page.locator("#sum")).toHaveCSS("outline-color", CORAL);
    await page.getByRole("tab", { name: "Skills" }).click();
    await page.locator("#ns").focus();
    await expect(page.locator("#ns")).toHaveCSS("outline-color", CORAL);
  });
});

test.describe("compare control before hydration", () => {
  test("is disabled in the server-rendered page, before React hydrates", async ({ page }) => {
    // Block the hydration bundles. The page content still arrives (Next streams it in with inline scripts),
    // so what we see is exactly the window between "HTML visible" and "React hydrated" that used to show an enabled button.
    await page.route("**/_next/static/**/*.js", (route) => route.abort());
    await page.goto("/people?sel=ana");
    const button = page.getByRole("button", { name: "Add to compare" });
    await expect(button).toBeVisible();
    await expect(button).toBeDisabled();
  });

  test("is enabled after hydration when there is room", async ({ page }) => {
    await page.goto("/people?sel=ana");
    await expect(page.getByRole("button", { name: "Add to compare" })).toBeEnabled();
  });

  test("stays disabled for a 4th person when three are already selected", async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem("sparq-ui", JSON.stringify({ state: { compare: ["javier", "ethan", "sofia"] }, version: 0 })));
    await page.goto("/people?sel=ana");
    await expect(page.getByText("3 selected")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add to compare" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Add to compare" })).toHaveAttribute("title", "Compare up to 3 people");
  });
});

test("print output starts at the top of the page and is a single page", async ({ page }) => {
  // Regression: the document was printed ~170px below the top because the centred dialog (translate: -50% -50%) was its containing block.
  await page.goto("/people/ana");
  await page.getByRole("button", { name: "Preview profile" }).click();
  await expect(page.locator("[data-print-root]")).toBeVisible();
  await page.emulateMedia({ media: "print" });
  const box = await page.locator("[data-print-root]").boundingBox();
  expect(box, "print document is rendered").not.toBeNull();
  // Two-sided: the document must sit at the page origin, neither pushed down (old bug) nor shifted off the page.
  expect(Math.abs(box!.y)).toBeLessThan(2);
  expect(Math.abs(box!.x)).toBeLessThan(2);
  expect(box!.width).toBeGreaterThan(300);
  await expect(page.locator("main").first()).toBeHidden(); // the app shell takes no space in print
  const pdf = await page.pdf({ format: "A4", printBackground: true });
  const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
  expect(pages).toBe(1);
});

test("navigation collapses to icons strictly below 1180px (documented breakpoint)", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Primary" }).getByText("Opportunities")).toBeVisible();
  await page.setViewportSize({ width: 1179, height: 800 });
  await expect(page.getByRole("navigation", { name: "Primary" }).getByText("Opportunities")).toBeHidden();
  // Icon-only links keep their accessible names.
  await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Opportunities" })).toBeVisible();
});
