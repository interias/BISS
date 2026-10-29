import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { countTaps, Entries, findFood } from "./helpers";

// Schnellzugriff of SPEC 3 (ADR-0010): a saved combination, logged with one tap as an entry
// group. Names are unique per run, the e2e database keeps what other runs left.

type Combo = { id: number; name: string; totals: { kcal: number } };
type Group = { group_id: string; group_name: string; totals: { kcal: number }; entries: unknown[] };

let entries: Entries;
let combos: Set<number>;
let bananaId: number;
let riceId: number;

const unique = (name: string) => `${name} ${Date.now().toString(36)}`;

test.beforeEach(async ({ request }) => {
  entries = new Entries(request);
  combos = new Set();
  bananaId = await findFood(request, "banane", "Banane roh");
  riceId = await findFood(request, "reis gekocht", "Reis gekocht");
});

test.afterEach(async ({ request }) => {
  await entries.cleanup();
  // 404 is fine: the test may have deleted the combo itself.
  for (const id of combos) await request.delete(`/api/v1/combos/${id}`);
});

async function createCombo(request: APIRequestContext, name: string) {
  const response = await request.post("/api/v1/combos", {
    data: {
      name,
      items: [
        { food_id: bananaId, grams: 120 },
        { food_id: riceId, grams: 150 },
      ],
    },
  });
  expect(response.status()).toBe(201);
  const combo: Combo = await response.json();
  combos.add(combo.id);
  return combo;
}

const chipOf = (page: Page, name: string) =>
  page.getByRole("group", { name: "Zuletzt gegessen" }).getByRole("button", { name: `Schnellzugriff ${name}` });

/** The group logged by the action, tracked for the cleanup. */
async function loggedGroup(page: Page, comboId: number, action: () => Promise<void>) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === "POST" && new URL(r.url()).pathname === `/api/v1/combos/${comboId}/log`,
    ),
    action(),
  ]);
  expect(response.status()).toBe(201);
  const group: Group = await response.json();
  entries.trackGroup(group.group_id);
  return group;
}

test("+ Neu creates a combo from searched foods; its chip stands first", async ({ page }) => {
  const name = unique("Bananenpause");
  await page.goto("/");
  await page.getByRole("button", { name: "Neuer Schnellzugriff" }).click();
  // While it searches, the sheet carries the title of the search.
  const sheet = page.getByRole("dialog");
  await expect(sheet).toHaveAccessibleName("Schnellzugriff anlegen");
  await sheet.getByRole("textbox", { name: "Name" }).fill(name);
  await sheet.getByRole("button", { name: "+ Zutat suchen" }).click();
  await sheet.getByRole("textbox", { name: "Suchen" }).fill("banane");
  await sheet.getByRole("button", { name: /^Banane roh/ }).first().click();
  await expect(sheet.getByRole("spinbutton", { name: "Banane roh Gramm" })).toHaveValue("120");

  const [response] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/v1/combos"),
    sheet.getByRole("button", { name: "Speichern" }).click(),
  ]);
  expect(response.status()).toBe(201);
  const combo: Combo = await response.json();
  combos.add(combo.id);
  expect(combo.name).toBe(name);

  await expect(page.getByRole("status")).toContainText(`${name} als Schnellzugriff gespeichert`);
  await expect(chipOf(page, name)).toBeVisible();
  // Schnellzugriff chips stand before the recent chips.
  const first = page.getByRole("group", { name: "Zuletzt gegessen" }).getByRole("button").first();
  await expect(first).toHaveAccessibleName(/^Schnellzugriff /);
});

test("tap budget: a Schnellzugriff is logged with 1 tap as one group", async ({ page, request }) => {
  const combo = await createCombo(request, unique("Reis mit Banane"));
  const taps = await countTaps(page);
  await page.goto("/");

  const group = await loggedGroup(page, combo.id, () => chipOf(page, combo.name).click());
  expect(group.group_name).toBe(combo.name);
  expect(group.entries).toHaveLength(2);
  expect(Math.abs(group.totals.kcal - combo.totals.kcal)).toBeLessThanOrEqual(1);

  const row = page.locator(`[data-group-id="${group.group_id}"]`);
  await expect(row).toContainText(combo.name);
  await expect(row).toContainText("2 Zutaten");
  await expect(page.getByRole("status")).toContainText(`${combo.name} eingetragen · ${Math.round(group.totals.kcal)} kcal`);
  // The group carries the combo's name: it offers no second Schnellzugriff.
  await expect(row.getByRole("button", { name: "als Schnellzugriff merken" })).toHaveCount(0);
  expect(await taps(), "Schnellzugriff").toBe(1);
});

test("Rückgängig after a Schnellzugriff removes the whole group", async ({ page, request }) => {
  const combo = await createCombo(request, unique("Reis mit Banane"));
  await page.goto("/");
  const group = await loggedGroup(page, combo.id, () => chipOf(page, combo.name).click());
  const row = page.locator(`[data-group-id="${group.group_id}"]`);
  await expect(row).toBeVisible();

  const [removed] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.request().method() === "DELETE" &&
        new URL(r.url()).pathname === `/api/v1/entries/group/${group.group_id}`,
    ),
    page.getByRole("button", { name: "Rückgängig" }).click(),
  ]);
  expect(removed.status()).toBe(204);
  await expect(row).toHaveCount(0);
  const day = await (await request.get("/api/v1/days/today")).json();
  const ids = day.meals.flatMap((meal: { groups: { group_id: string }[] }) => meal.groups.map((g) => g.group_id));
  expect(ids).not.toContain(group.group_id);
});

test("the context menu of a chip adjusts one entry, the template stays", async ({ page, request }) => {
  const combo = await createCombo(request, unique("Reis mit Banane"));
  await page.goto("/");
  await chipOf(page, combo.name).click({ button: "right" });
  const sheet = page.getByRole("dialog", { name: "Schnellzugriff anpassen" });
  await sheet.getByRole("button", { name: "Banane roh entfernen" }).click();
  await sheet.getByRole("button", { name: "Abend" }).click();

  const group = await loggedGroup(page, combo.id, () =>
    sheet.getByRole("button", { name: /^Eintragen · \d+ kcal$/ }).click(),
  );
  expect(group.entries).toHaveLength(1);
  await expect(page.locator(`[data-meal="dinner"] [data-group-id="${group.group_id}"]`)).toBeVisible();
  const saved: Combo[] = await (await request.get("/api/v1/combos")).json();
  expect(saved.find((c) => c.id === combo.id)).toEqual(combo);
});

test("als Schnellzugriff merken makes a combo of a diary group", async ({ page, request }) => {
  const name = unique("Mittagsteller");
  const response = await request.post("/api/v1/entries/group", {
    data: {
      group_name: name,
      items: [
        { food_id: riceId, grams: 150 },
        { food_id: bananaId, grams: 120 },
      ],
    },
  });
  expect(response.status()).toBe(201);
  const group: Group = await response.json();
  entries.trackGroup(group.group_id);

  await page.goto("/");
  const row = page.locator(`[data-group-id="${group.group_id}"]`);
  const [created] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/v1/combos"),
    row.getByRole("button", { name: "als Schnellzugriff merken" }).click(),
  ]);
  expect(created.status()).toBe(201);
  const combo: Combo = await created.json();
  combos.add(combo.id);
  expect(combo.name).toBe(name);
  expect(Math.abs(combo.totals.kcal - group.totals.kcal)).toBeLessThanOrEqual(1);

  await expect(page.getByRole("status")).toContainText(`${name} als Schnellzugriff gespeichert`);
  await expect(chipOf(page, name)).toBeVisible();
  await expect(row.getByRole("button", { name: "als Schnellzugriff merken" })).toHaveCount(0);
});
