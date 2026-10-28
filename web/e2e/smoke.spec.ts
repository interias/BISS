import { expect, test } from "@playwright/test";

test("serves the page with the light design tokens and fonts", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page).toHaveTitle("BISS");
  await expect(page.getByRole("heading", { name: "BISS" })).toBeAttached();

  const body = page.locator("body");
  await expect(body).toHaveCSS("background-color", "rgb(237, 240, 234)");
  await expect(body).toHaveCSS("color", "rgb(23, 32, 26)");
  expect(await body.evaluate((el) => getComputedStyle(el).fontFamily)).toContain("Figtree");
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--font-bricolage"),
    ),
  ).toContain("Bricolage");
});

test("follows the dark color scheme of the system", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(14, 18, 16)");
  await expect(page.getByRole("main")).toHaveCSS("background-color", "rgb(23, 28, 25)");
});
