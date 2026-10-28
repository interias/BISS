import { expect, test, type Page } from "@playwright/test";
import { barcodePng } from "./barcode-image";
import { MISS_CODE } from "./camera-setup";
import { countTaps, Entries } from "./helpers";

// Plate flow of SPEC 3 and 7a: the photo goes to the fake plate extractor (PLATE_EXTRACTOR in
// compose.test.yaml), which always reads "Hähnchen mit Reis und Brokkoli" with three
// ingredients; the e2e stack loads the full BLS, so all three are matched.

const DISH = "Hähnchen mit Reis und Brokkoli";

type Group = { group_id: string; totals: { kcal: number }; entries: { id: number }[] };

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

/** The confirmation: Eintragen. Returns the group and the kcal the button showed. */
async function logPlate(page: Page) {
  const sheet = page.getByRole("dialog");
  const button = sheet.getByRole("button", { name: /^Eintragen · \d+ kcal$/ });
  const shown = Number(/(\d+) kcal/.exec((await button.textContent()) ?? "")![1]);
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/v1/entries/group",
    ),
    button.click(),
  ]);
  expect(response.status()).toBe(201);
  const group: Group = await response.json();
  entries.trackGroup(group.group_id);
  return { group, shown };
}

const deletion = (page: Page, groupId: string) =>
  page.waitForResponse(
    (r) => r.request().method() === "DELETE" && new URL(r.url()).pathname === `/api/v1/entries/group/${groupId}`,
  );

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
  await expect(rows.nth(0)).toContainText("120 g");
  await expect(rows.nth(1)).toContainText("Reis gekocht");
  await expect(rows.nth(2)).toContainText("Broccoli gekocht");
  await expect(rows.nth(2)).toContainText("vermutet");
  await expect(sheet.getByText("nicht zugeordnet", { exact: true })).toHaveCount(0);
  await expect(sheet.getByText("Mengen sind geschätzt. Fehlt etwas?")).toBeVisible();

  const { group, shown } = await logPlate(page);
  expect(group.entries).toHaveLength(3);
  // The preview ("Wert je 100 g × Gramm / 100") is the backend's sum within rounding.
  expect(Math.abs(group.totals.kcal - shown)).toBeLessThanOrEqual(1);

  const row = page.locator(`[data-group-id="${group.group_id}"]`);
  await expect(row).toContainText(DISH);
  await expect(row).toContainText("3 Zutaten");
  await expect(row).toContainText(String(Math.round(group.totals.kcal)));
  await expect(page.getByText(`${DISH} eingetragen`)).toBeVisible();
  expect(await taps(), "Kamera + Teller + Eintragen").toBe(3);
});

test("a plate unfolds in the diary; entfernen and Rückgängig bring the group back", async ({ page }) => {
  await page.goto("/");
  await photographPlate(page);
  const { group } = await logPlate(page);

  const row = page.locator(`[data-group-id="${group.group_id}"]`);
  const toggle = row.getByRole("button", { name: new RegExp(DISH) });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(row.locator("[data-entry-id]")).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(row.locator("[data-entry-id]")).toHaveCount(3);
  await expect(row).toContainText("Reis gekocht");

  const [removed] = await Promise.all([
    deletion(page, group.group_id),
    row.getByRole("button", { name: "Gericht entfernen" }).click(),
  ]);
  expect(removed.status()).toBe(204);
  await expect(page.locator("[data-group-id]")).toHaveCount(0);
  await expect(page.getByText(`${DISH} entfernt`)).toBeVisible();

  // Rückgängig logs the Gericht again as a new group with the same amounts.
  const [again] = await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/v1/entries/group",
    ),
    page.getByRole("button", { name: "Rückgängig" }).click(),
  ]);
  expect(again.status()).toBe(201);
  const restored: Group = await again.json();
  entries.trackGroup(restored.group_id);
  expect(restored.entries).toHaveLength(3);
  expect(Math.abs(restored.totals.kcal - group.totals.kcal)).toBeLessThanOrEqual(1);
  await expect(page.locator(`[data-group-id="${restored.group_id}"]`)).toContainText(DISH);
});

test("Rückgängig after logging a plate removes the group again", async ({ page }) => {
  await page.goto("/");
  await photographPlate(page);
  const { group } = await logPlate(page);
  await expect(page.locator(`[data-group-id="${group.group_id}"]`)).toBeVisible();
  const [removed] = await Promise.all([
    deletion(page, group.group_id),
    page.getByRole("button", { name: "Rückgängig" }).click(),
  ]);
  expect(removed.status()).toBe(204);
  await expect(page.locator(`[data-group-id="${group.group_id}"]`)).toHaveCount(0);
});

test("an ingredient the backend could not match is marked and left out of the entry", async ({ page }) => {
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

  const { group } = await logPlate(page);
  expect(group.entries).toHaveLength(2);
  await expect(page.locator(`[data-group-id="${group.group_id}"]`)).toContainText("2 Zutaten");
});
