import { expect, test, type Page } from "@playwright/test";
import { Entries, entryIdFrom, findFood } from "./helpers";

// Food editor flows (SPEC 3) against the compose stack. The BLS import fills the database
// at the api's start, so "Banane roh" is a real BLS food.

// A 1x1 PNG; the api converts every photo to WebP.
const PHOTO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

// A search that finds nothing, so that "Neu anlegen" shows.
const NOTHING = "qqxzzkvw";

type Serving = { id: number; label: string; grams: number; origin: string; is_default: boolean };
type Food = {
  id: number;
  name: string;
  image_path: string | null;
  per_100: { kcal: number };
  servings: Serving[];
};

let entries: Entries;
let bananaId: number;

test.beforeEach(async ({ request }) => {
  entries = new Entries(request);
  bananaId = await findFood(request, "banane", "Banane roh");
});

test.afterEach(async () => {
  await entries.cleanup();
});

async function openNewEditor(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Lebensmittel suchen" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("textbox", { name: "Suchen" }).fill(NOTHING);
  await sheet.getByRole("button", { name: "Neu anlegen" }).click();
  await expect(sheet.getByText("Neues Lebensmittel")).toBeVisible();
  return sheet;
}

async function openBananaEditor(page: Page) {
  await page.getByRole("button", { name: "Lebensmittel suchen" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("textbox", { name: "Suchen" }).fill("banane");
  await sheet.getByRole("button", { name: /^Banane roh/ }).first().click();
  await expect(sheet.getByRole("heading", { name: "Banane roh" })).toBeVisible();
  await sheet.getByRole("button", { name: "Bearbeiten" }).click();
  await expect(sheet.getByText("Lebensmittel bearbeiten")).toBeVisible();
  return sheet;
}

test("a new food with two portions and a photo is saved and logged", async ({ page, request }) => {
  const name = `Testskyr ${Date.now()}`;
  const sheet = await openNewEditor(page);

  await sheet.getByLabel("Name", { exact: true }).fill(name);
  await sheet.getByLabel("Marke").fill("Testmolkerei");
  await sheet.getByLabel("Energie (kcal)").fill("63");
  await sheet.getByLabel("Eiweiß (g)").fill("11");
  await sheet.getByLabel("Kohlenhydrate (g)").fill("4");
  await sheet.getByLabel("Fett (g)", { exact: true }).fill("0,2");
  await expect(sheet.getByTestId("atwater")).toContainText("Plausibel");
  await sheet.getByTestId("photo-gallery").setInputFiles({ name: "skyr.png", mimeType: "image/png", buffer: PHOTO });

  const add = sheet.getByRole("button", { name: "+ Portion hinzufügen" });
  const rows = sheet.getByRole("listitem");
  await add.click();
  await rows.nth(0).getByLabel("Bezeichnung").fill("1 Becher");
  await rows.nth(0).getByLabel("Gramm").fill("150");
  await add.click();
  await rows.nth(1).getByLabel("Bezeichnung").fill("1 Löffel");
  await rows.nth(1).getByLabel("Gramm").fill("20");
  await rows.nth(1).getByRole("button", { name: "Als Standard setzen" }).click();
  await expect(rows.nth(1).getByTestId("origin")).toHaveText("eigene");

  const [created] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/v1/foods"),
    sheet.getByRole("button", { name: "Speichern & eintragen" }).click(),
  ]);
  const food: Food = await created.json();

  // The editor leads into the amount sheet of the new food: standard portion, photo.
  await expect(sheet.getByRole("heading", { name })).toBeVisible();
  await expect(sheet.getByRole("spinbutton", { name: "Menge" })).toHaveValue("20");
  await expect(sheet.locator("img[src^='/api/v1/images/']")).toBeVisible();

  const saved: Food = await (await request.get(`/api/v1/foods/${food.id}`)).json();
  // The backend lists the standard portion first.
  expect(saved.servings.map((s) => [s.label, s.grams, s.is_default]).sort()).toEqual([
    ["1 Becher", 150, false],
    ["1 Löffel", 20, true],
  ]);
  expect(saved.image_path).toMatch(/\.webp$/);
  const image = await request.get(`/api/v1/images/${saved.image_path}`);
  expect(image.headers()["content-type"]).toBe("image/webp");

  const logged = await entryIdFrom(page, "POST", /^\/api\/v1\/entries$/, () =>
    sheet.getByRole("button", { name: /^Eintragen · \d+ kcal$/ }).click(),
  );
  entries.track(logged.id);
  expect(logged.grams).toBe(20);
  await expect(sheet).toHaveCount(0);
  await expect(page.locator(`[data-entry-id="${logged.id}"]`)).toContainText(name);
});

test("editing a BLS food keeps the value after a reload and shows eigene at once", async ({ page, request }) => {
  const before: Food = await (await request.get(`/api/v1/foods/${bananaId}`)).json();
  const serving = before.servings.find((s) => s.is_default)!;
  try {
    await page.goto("/");
    const sheet = await openBananaEditor(page);
    const row = sheet.getByRole("listitem").first();
    // A rerun on the same database finds the serving already changed to own (the API cannot
    // undo that); the report then says that the origin change was not exercised.
    if (serving.origin !== "own") await expect(row.getByTestId("origin")).toHaveText("geschätzt");
    else test.info().annotations.push({ type: "note", description: "serving already own: origin change not exercised" });

    await sheet.getByLabel("Energie (kcal)").fill("99");
    await row.getByLabel("Gramm").fill("130");
    await expect(row.getByTestId("origin")).toHaveText("eigene"); // before anything is saved

    await sheet.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Lebensmittel gespeichert")).toBeVisible();
    await expect(sheet.getByRole("heading", { name: "Banane roh" })).toBeVisible();
    await expect(sheet.getByRole("spinbutton", { name: "Menge" })).toHaveValue("120"); // grams stay as they were

    await page.reload();
    const again = await openBananaEditor(page);
    await expect(again.getByLabel("Energie (kcal)")).toHaveValue("99");
    const reloaded = again.getByRole("listitem").first();
    await expect(reloaded.getByLabel("Gramm")).toHaveValue("130");
    await expect(reloaded.getByTestId("origin")).toHaveText("eigene"); // the backend changed the origin

    const saved: Food = await (await request.get(`/api/v1/foods/${bananaId}`)).json();
    expect(saved.per_100.kcal).toBe(99);
    expect(saved.servings.find((s) => s.id === serving.id)).toMatchObject({ grams: 130, origin: "own" });
  } finally {
    // The database volume stays; give the other specs their banana back.
    await request.patch(`/api/v1/foods/${bananaId}`, {
      data: {
        per_100: { kcal: before.per_100.kcal },
        servings: before.servings.map(({ id, label, grams, is_default }) => ({ id, label, grams, is_default })),
      },
    });
  }
});

test("the Atwater warning appears for implausible values and goes when they fit", async ({ page }) => {
  const sheet = await openNewEditor(page);
  const hint = sheet.getByTestId("atwater");

  await sheet.getByLabel("Energie (kcal)").fill("100");
  await expect(hint).toContainText("Unplausibel");
  await expect(hint).toContainText("Bitte Werte prüfen");
  await expect(hint).toContainText("100,0 % Abweichung");

  await sheet.getByLabel("Fett (g)", { exact: true }).fill("11");
  await expect(hint).toContainText("Plausibel: aus Makros 99 kcal");
  await expect(hint).not.toContainText("Bitte Werte prüfen");

  await sheet.getByLabel("Eiweiß (g)").fill("50");
  await expect(hint).toContainText("Unplausibel");
});

test("Bearbeiten and Abbrechen return to the entry with its grams", async ({ page }) => {
  const seeded = await entries.create(bananaId, 120, "lunch");
  await page.goto("/");
  await page.locator(`[data-entry-id="${seeded.id}"]`).click();
  const sheet = page.getByRole("dialog");
  for (let i = 0; i < 2; i++) await sheet.getByRole("button", { name: "mehr" }).click(); // 130, 140
  await expect(sheet.getByRole("spinbutton", { name: "Menge" })).toHaveValue("140");

  await sheet.getByRole("button", { name: "Bearbeiten" }).click();
  await expect(sheet.getByLabel("Name", { exact: true })).toHaveValue("Banane roh");
  await sheet.getByRole("button", { name: "Abbrechen" }).click();

  await expect(sheet.getByRole("spinbutton", { name: "Menge" })).toHaveValue("140");
  await expect(sheet.getByRole("button", { name: /^Speichern · \d+ kcal$/ })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Entfernen" })).toBeVisible();
});
