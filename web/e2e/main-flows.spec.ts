import { expect, test } from "@playwright/test";
import { Entries, entryIdFrom, findFood, totalKcal } from "./helpers";

// Core flows of SPEC 8 against the compose stack: the web app proxies /api/v1 to the api.

let entries: Entries;
let bananaId: number;

test.beforeEach(async ({ request }) => {
  entries = new Entries(request);
  bananaId = await findFood(request, "banane", "Banane roh");
});

test.afterEach(async () => {
  await entries.cleanup();
});

test("a recent chip logs the standard serving, Rückgängig removes it", async ({ page }) => {
  await entries.create(bananaId, 120, "snack"); // makes the banana a recent food
  await page.goto("/");
  const diary = page.getByRole("region", { name: "Tagebuch" });
  const bananas = diary.getByRole("button", { name: /Banane roh/ });
  await expect(bananas.first()).toBeVisible();
  const count = await bananas.count();
  const before = await totalKcal(page);

  const chip = page
    .getByRole("group", { name: "Zuletzt gegessen" })
    .getByRole("button", { name: /^Banane roh\s*120 g$/ });
  const created = await entryIdFrom(page, "POST", /^\/api\/v1\/entries$/, () => chip.click());
  entries.track(created.id);
  expect(created.grams).toBe(120); // the standard serving, chosen by the backend

  await expect(page.getByRole("status")).toContainText("Banane roh eingetragen");
  await expect(diary.locator(`[data-entry-id="${created.id}"]`)).toBeVisible();
  await expect(bananas).toHaveCount(count + 1);
  await expect.poll(() => totalKcal(page)).toBeGreaterThan(before);

  await page.getByRole("button", { name: "Rückgängig" }).click();
  await expect(diary.locator(`[data-entry-id="${created.id}"]`)).toHaveCount(0);
  await expect(bananas).toHaveCount(count);
  await expect.poll(() => totalKcal(page)).toBe(before);
});

test("searching banane and logging 120 g as snack shows the entry", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Lebensmittel suchen" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("textbox", { name: "Suchen" }).fill("banane");
  await sheet.getByRole("button", { name: /^Banane roh/ }).first().click();

  await expect(sheet.getByRole("heading", { name: "Banane roh" })).toBeVisible();
  await expect(sheet.getByRole("status", { name: "Menge" })).toHaveText("120g");
  const mealChip = sheet.getByRole("button", { name: /^Mahlzeit:/ });
  for (let i = 0; i < 4 && (await mealChip.textContent()) !== "Snack"; i++) await mealChip.click();
  await expect(mealChip).toHaveText("Snack");

  const created = await entryIdFrom(page, "POST", /^\/api\/v1\/entries$/, () =>
    sheet.getByRole("button", { name: /^Eintragen · \d+ kcal$/ }).click(),
  );
  entries.track(created.id);

  await expect(sheet).toHaveCount(0);
  const entry = page.locator(`[data-meal="snack"] [data-entry-id="${created.id}"]`);
  await expect(entry).toBeVisible();
  await expect(entry).toContainText("Banane roh");
  await expect(entry).toContainText("120 g");
});

test("opening an entry and saving 90 g updates its values", async ({ page }) => {
  const seeded = await entries.create(bananaId, 120, "snack");
  await page.goto("/");
  const entry = page.locator(`[data-entry-id="${seeded.id}"]`);
  await expect(entry).toContainText("120 g");
  await entry.click();

  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("button", { name: "Entfernen" })).toBeVisible();
  const minus = sheet.getByRole("button", { name: "weniger" });
  for (let i = 0; i < 4; i++) await minus.click(); // 110, 100, 95, 90
  await expect(sheet.getByRole("status", { name: "Menge" })).toHaveText("90g");

  const saved = await entryIdFrom(page, "PATCH", new RegExp(`^/api/v1/entries/${seeded.id}$`), () =>
    sheet.getByRole("button", { name: /^Speichern · \d+ kcal$/ }).click(),
  );
  expect(saved.grams).toBe(90);
  expect(saved.macros.kcal).toBeLessThan(seeded.macros.kcal);

  await expect(entry).toContainText("90 g");
  await expect(entry).toContainText(String(Math.round(saved.macros.kcal)));
  await expect(page.getByRole("status")).toContainText("Gespeichert");
});

test("removing an entry takes it out of the diary", async ({ page }) => {
  const seeded = await entries.create(bananaId, 120, "snack");
  await page.goto("/");
  const entry = page.locator(`[data-entry-id="${seeded.id}"]`);
  await entry.click();
  await page.getByRole("dialog").getByRole("button", { name: "Entfernen" }).click();
  await expect(entry).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Entfernt");
  expect((await page.request.delete(`/api/v1/entries/${seeded.id}`)).status()).toBe(404);
});
