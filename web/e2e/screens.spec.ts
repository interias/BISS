import { existsSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { Entries, findFood } from "./helpers";

// Screenshots for comparing app and prototype at 375 px, light and dark (`pnpm screens`).
// The prototype comes from docs/, mounted into the container at /docs.

const PROTOTYPE = process.env.PROTOTYPE ?? "/docs/design/prototype.html";
const OUT = "test-results/screens";

const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${name}.png` });

for (const scheme of ["light", "dark"] as const) {
  test(`prototype, ${scheme}`, async ({ browser }) => {
    expect(existsSync(PROTOTYPE), `prototype at ${PROTOTYPE} (mount ./docs:/docs:ro)`).toBe(true);
    // The prototype has no viewport meta; a mobile context would lay it out at 980 px.
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      deviceScaleFactor: 2.625,
      isMobile: false,
      hasTouch: false,
    });
    const page = await context.newPage();
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(`file://${PROTOTYPE}`);
    // Its CSS overrides the hidden attribute (camera, toast, sheet); the artifact host hides them.
    await page.addStyleTag({ content: "[hidden]{display:none!important}" });
    await page.waitForTimeout(1000); // ring transition and web fonts
    await shot(page, `prototype-${scheme}-main`);
    await page.locator("#openSearch").click();
    await page.locator("#q").fill("banane");
    await page.waitForTimeout(300); // sheet animation
    await shot(page, `prototype-${scheme}-search`);
    await page.locator("#res .entry").first().click();
    await shot(page, `prototype-${scheme}-amount`);
    await context.close();
  });

  test(`app, ${scheme}`, async ({ page, request }) => {
    const entries = new Entries(request);
    try {
      // Roughly the prototype's diary: breakfast, lunch and a snack.
      await entries.create(await findFood(request, "haferflocken", "Hafer"), 60, "breakfast");
      await entries.create(await findFood(request, "banane", "Banane roh"), 120, "snack");
      await entries.create(await findFood(request, "reis gekocht", "Reis"), 200, "lunch");

      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/");
      await expect(page.getByRole("region", { name: "Tagebuch" })).toBeVisible();
      await page.waitForTimeout(1000); // ring transition
      await shot(page, `app-${scheme}-main`);
      await page.getByRole("button", { name: "Lebensmittel suchen" }).click();
      await page.getByRole("textbox", { name: "Suchen" }).fill("banane");
      await page.getByRole("dialog").getByRole("button", { name: /^Banane roh/ }).first().waitFor();
      await shot(page, `app-${scheme}-search`);
      await page.getByRole("dialog").getByRole("button", { name: /^Banane roh/ }).first().click();
      await page.getByRole("dialog").getByRole("heading").waitFor();
      await page.waitForTimeout(300); // sheet animation
      await shot(page, `app-${scheme}-amount`);
    } finally {
      await entries.cleanup();
    }
  });
}
