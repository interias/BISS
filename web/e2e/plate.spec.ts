import { expect, test, type Page } from "@playwright/test";
import { barcodePng } from "./barcode-image";
import { MISS_CODE } from "./camera-setup";
import { countTaps, Entries, findFood } from "./helpers";

// Plate flow of SPEC 3 and 7a: the photo goes to the fake plate extractor (PLATE_EXTRACTOR in
// compose.test.yaml), which always reads "Hähnchen mit Reis und Brokkoli" with three
// ingredients; the e2e stack loads the full BLS, so all three are matched. "Eintragen" stores
// the dish as a recipe of one portion with the photo and logs that portion.

const DISH = "Hähnchen mit Reis und Brokkoli";

type Logged = { id: number; grams: number; food: { id: number }; macros: { kcal: number } };
type Dish = { id: number; food_id: number; portions: number; portion_grams: number; items: unknown[] };

let entries: Entries;

test.beforeEach(async ({ page, request }) => {
  entries = new Entries(request);
  // As without HTTPS: no mediaDevices, so the shutter "Teller" opens the photo choice.
  await page.addInitScript(() => Object.defineProperty(navigator, "mediaDevices", { value: undefined }));
});

test.afterEach(async () => {
  await entries.cleanup();
});

/** Camera → Teller → the photo; any image will do for the fake. The sheet is open afterwards. */
async function photographPlate(page: Page) {
  await page.getByRole("button", { name: /^Kamera/ }).click();
  const camera = page.getByRole("region", { name: "Kamera" });
  // The shutter opens the photo choice; the file goes straight into the input and, like the
  // choice itself, does not count as a tap (SPEC 1).
  await camera.getByRole("button", { name: "Teller", exact: true }).click();
  const [extracted] = await Promise.all([
    page.waitForResponse((r) => new URL(r.url()).pathname === "/api/v1/plates/extract"),
    camera
      .getByTestId("plate-photo")
      .setInputFiles({ name: "teller.png", mimeType: "image/png", buffer: barcodePng(MISS_CODE) }),
  ]);
  expect(extracted.status()).toBe(200);
  await expect(camera).toHaveCount(0);
  return page.getByRole("dialog");
}

const posted = (page: Page, path: string) =>
  page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === path);

/** The confirmation: Eintragen. Returns the stored dish, its entry and the kcal the button showed. */
async function logPlate(page: Page) {
  const sheet = page.getByRole("dialog");
  const button = sheet.getByRole("button", { name: /^Eintragen · \d+ kcal$/ });
  const shown = Number(/(\d+) kcal/.exec((await button.textContent()) ?? "")![1]);
  const [stored, photo, logged] = await Promise.all([
    posted(page, "/api/v1/recipes"),
    page.waitForResponse((r) => r.request().method() === "PUT" && /\/foods\/\d+\/image$/.test(r.url())),
    posted(page, "/api/v1/entries"),
    button.click(),
  ]);
  expect(stored.status()).toBe(201);
  expect(photo.status()).toBe(200);
  expect(logged.status()).toBe(201);
  const dish: Dish = await stored.json();
  const entry: Logged = await logged.json();
  entries.track(entry.id);
  return { dish, entry, shown };
}

test("tap budget: a plate is logged with Kamera + Teller + 1 confirmation", async ({ page }) => {
  const taps = await countTaps(page);
  await page.goto("/");
  const sheet = await photographPlate(page);

  await expect(sheet.getByText("Erkannt · bitte prüfen")).toBeVisible();
  await expect(sheet.getByRole("textbox", { name: "Gericht" })).toHaveValue(DISH);
  const rows = sheet.getByRole("list", { name: "Zutaten" }).getByRole("listitem");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("Hähnchen Brustfilet, gegrillt");
  await expect(rows.nth(0)).toContainText("erkannt");
  await expect(rows.nth(0).getByRole("spinbutton")).toHaveValue("120");
  await expect(rows.nth(1)).toContainText("Reis gekocht");
  await expect(rows.nth(2)).toContainText("Broccoli gekocht");
  await expect(rows.nth(2)).toContainText("vermutet");
  await expect(sheet.getByText("nicht zugeordnet", { exact: true })).toHaveCount(0);
  await expect(sheet.getByText("Mengen sind geschätzt. Fehlt etwas?")).toBeVisible();

  const { dish, entry, shown } = await logPlate(page);
  // The dish is a food of its own: one portion of all three ingredients.
  expect(dish.items).toHaveLength(3);
  expect(dish.portions).toBe(1);
  expect(entry.food.id).toBe(dish.food_id);
  expect(entry.grams).toBe(dish.portion_grams);
  // The preview ("Wert je 100 g × Gramm / 100") is the backend's snapshot within rounding of
  // the dish's values per 100 g.
  expect(Math.abs(entry.macros.kcal - shown)).toBeLessThanOrEqual(2);

  // One row in the diary, with the plate photo; no group of ingredients.
  const row = page.locator(`[data-entry-id="${entry.id}"]`);
  await expect(row).toContainText(DISH);
  await expect(row.locator("img")).toHaveCount(1);
  await expect(page.locator("[data-group-id]")).toHaveCount(0);
  await expect(page.getByText(`${DISH} eingetragen · ${Math.round(entry.macros.kcal)} kcal`)).toBeVisible();
  expect(await taps(), "Kamera + Teller + Eintragen").toBe(3);
});

test("a logged plate is counted in portions and its dish can be changed", async ({ page }) => {
  await page.goto("/");
  await photographPlate(page);
  const { dish, entry } = await logPlate(page);

  await page.locator(`[data-entry-id="${entry.id}"]`).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: DISH })).toBeVisible();
  const portion = sheet.getByRole("button", { name: /1 Portion \d/ });
  await expect(portion).toHaveAttribute("aria-pressed", "true");

  // The count: one more portion.
  await portion.click();
  await expect(portion).toContainText("2 × 1 Portion");
  const [changed] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "PATCH" && /\/entries\/\d+$/.test(r.url())),
    sheet.getByRole("button", { name: /^Speichern · \d+ kcal$/ }).click(),
  ]);
  expect((await changed.json()).grams).toBe(dish.portion_grams * 2);

  // "Bearbeiten" opens the dish with its ingredients.
  await page.locator(`[data-entry-id="${entry.id}"]`).click();
  await sheet.getByRole("button", { name: "Bearbeiten" }).click();
  await expect(sheet.getByRole("heading", { name: "Rezept bearbeiten" })).toBeVisible();
  await expect(sheet.getByRole("list", { name: "Zutaten" }).getByRole("listitem")).toHaveCount(3);
});

test("tap budget: a logged Gericht takes one more ingredient with aufklappen + 3", async ({ page, request }) => {
  // A Gericht as a Schnellzugriff logs it: a group of two ingredients.
  const logged = await request.post("/api/v1/entries/group", {
    data: {
      group_name: "Reis mit Brokkoli",
      items: [
        { food_id: await findFood(request, "Reis gekocht", "Reis gekocht"), grams: 150 },
        { food_id: await findFood(request, "Broccoli gekocht", "Broccoli gekocht"), grams: 80 },
      ],
    },
  });
  expect(logged.status()).toBe(201);
  const group: { group_id: string } = await logged.json();
  entries.trackGroup(group.group_id);

  const taps = await countTaps(page);
  await page.goto("/");
  const row = page.locator(`[data-group-id="${group.group_id}"]`);
  await row.getByRole("button", { name: /Reis mit Brokkoli/ }).click();
  await row.getByRole("button", { name: "+ Zutat" }).click();
  const sheet = page.getByRole("dialog");
  // Any food last used will do as the ingredient.
  await sheet.getByRole("group", { name: "Zuletzt" }).getByRole("button").first().click();
  const [created] = await Promise.all([
    posted(page, "/api/v1/entries"),
    sheet.getByRole("button", { name: /^Eintragen · \d+ kcal$/ }).click(),
  ]);
  expect(created.status()).toBe(201);
  expect((await created.json()).group_id).toBe(group.group_id);

  await expect(row).toContainText("3 Zutaten");
  await expect(row.locator("[data-entry-id]")).toHaveCount(3);
  expect(await taps(), "aufklappen + Zutat + Treffer + Eintragen").toBe(4);
});

test("Rückgängig after logging a plate removes its entry again", async ({ page }) => {
  await page.goto("/");
  await photographPlate(page);
  const { entry } = await logPlate(page);
  await expect(page.locator(`[data-entry-id="${entry.id}"]`)).toBeVisible();
  const [removed] = await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === "DELETE" && new URL(r.url()).pathname === `/api/v1/entries/${entry.id}`,
    ),
    page.getByRole("button", { name: "Rückgängig" }).click(),
  ]);
  expect(removed.status()).toBe(204);
  await expect(page.locator(`[data-entry-id="${entry.id}"]`)).toHaveCount(0);
});

test("an ingredient the backend could not match is marked and left out of the dish", async ({ page }) => {
  // The fake matches all three on the full BLS: the answer is changed on its way.
  await page.route("**/api/v1/plates/extract", async (route) => {
    const response = await route.fetch();
    const plate = await response.json();
    Object.assign(plate.items[2], { food_id: null, food: null, per_100: null, macros: null });
    await route.fulfill({ response, json: plate });
  });
  await page.goto("/");
  const sheet = await photographPlate(page);
  await expect(sheet.getByText("nicht zugeordnet", { exact: true })).toBeVisible();
  await expect(sheet.getByText("Nicht zugeordnete Zutaten werden nicht eingetragen.")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Broccoli gekocht zuordnen" })).toBeVisible();

  const { dish, entry } = await logPlate(page);
  expect(dish.items).toHaveLength(2);
  await expect(page.locator(`[data-entry-id="${entry.id}"]`)).toContainText(DISH);
});

test("a weighed total spreads over the ingredients and is what gets logged", async ({ page }) => {
  await page.goto("/");
  const sheet = await photographPlate(page);
  const total = sheet.getByRole("spinbutton", { name: "Gesamtgewicht" });
  const estimate = Number(await total.inputValue());
  const first = sheet.getByRole("list", { name: "Zutaten" }).getByRole("spinbutton").first();
  const share = Number(await first.inputValue()) / estimate;

  await total.fill("425");
  await expect(first).toHaveValue(String(Math.round(share * 425)));
  const { dish } = await logPlate(page);
  expect(dish.portion_grams).toBe(425);
});
