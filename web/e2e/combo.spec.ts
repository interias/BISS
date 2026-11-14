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

test("+ Neu creates a combo from searched foods; its chip stands first after + Neu", async ({ page }) => {
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
  // "+ Neu" stands first, the Schnellzugriff chips before the recent chips.
  const chips = page.getByRole("group", { name: "Zuletzt gegessen" }).getByRole("button");
  await expect(chips.first()).toHaveAccessibleName("Neuer Schnellzugriff");
  await expect(chips.nth(1)).toHaveAccessibleName("Meine Rezepte");
  await expect(chips.nth(2)).toHaveAccessibleName(/^Schnellzugriff /);
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

test("tap budget: a Schnellzugriff used before is logged from the empty search with Suche + 1", async ({ page, request }) => {
  const combo = await createCombo(request, unique("Reis mit Banane"));
  const first = await request.post(`/api/v1/combos/${combo.id}/log`, { data: {} });
  expect(first.status()).toBe(201);
  entries.trackGroup(((await first.json()) as Group).group_id);
  const taps = await countTaps(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Lebensmittel suchen" }).click();
  // Logged just now: it stands first among the last used, before its foods.
  const row = page.getByRole("dialog").getByRole("group", { name: "Zuletzt" }).getByRole("button").first();
  await expect(row).toContainText(combo.name);
  const group = await loggedGroup(page, combo.id, () => row.click());
  expect(group.entries).toHaveLength(2);

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText(`${combo.name} eingetragen`);
  expect(await taps(), "Suche + 1").toBe(2);
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

  const group = await loggedGroup(page, combo.id, () =>
    sheet.getByRole("button", { name: /^Eintragen · \d+ kcal$/ }).click(),
  );
  expect(group.entries).toHaveLength(1);
  await expect(page.locator(`[data-group-id="${group.group_id}"]`)).toBeVisible();
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

test("a recipe is created, logged in two portions and weighed afterwards", async ({ page, request }) => {
  const name = unique("Bananenreis");
  await page.goto("/");
  await page.getByRole("button", { name: "Meine Rezepte" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "+ Neues Rezept" }).click();
  await expect(sheet.getByRole("heading", { name: "Neues Rezept" })).toBeVisible();

  await sheet.getByRole("textbox", { name: "Name" }).fill(name);
  for (const [query, food] of [
    ["banane", "Banane roh"],
    ["reis gekocht", "Reis gekocht"],
  ]) {
    await sheet.getByRole("button", { name: "+ Zutat suchen" }).click();
    await sheet.getByRole("textbox", { name: "Suchen" }).fill(query);
    await sheet.getByRole("button", { name: new RegExp(`^${food}`) }).first().click();
  }
  await sheet.getByRole("spinbutton", { name: "Banane roh Gramm" }).fill("200");
  await sheet.getByRole("spinbutton", { name: "Reis gekocht Gramm" }).fill("300");
  await sheet.getByRole("button", { name: "mehr Portionen" }).click();
  await sheet.getByRole("button", { name: "mehr Portionen" }).click();
  await sheet.getByRole("button", { name: "mehr Portionen" }).click();
  await sheet.getByRole("textbox", { name: "Zubereitung" }).fill("Mischen und warm machen.");
  // 500 g of ingredients in four portions.
  await expect(sheet.getByText("1 Portion · 125 g")).toBeVisible();

  const [saved] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/v1/recipes"),
    sheet.getByRole("button", { name: "Speichern" }).click(),
  ]);
  expect(saved.status()).toBe(201);
  const recipe: { id: number; food_id: number; totals: { kcal: number } } = await saved.json();

  // The amount sheet of the recipe's food: one portion, a second tap makes two.
  await expect(sheet.getByRole("heading", { name })).toBeVisible();
  await expect(sheet.getByRole("spinbutton", { name: "Menge" })).toHaveValue("125");
  await sheet.getByRole("button", { name: /1 Portion/ }).click();
  await expect(sheet.getByRole("spinbutton", { name: "Menge" })).toHaveValue("250");
  const [logged] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/v1/entries"),
    sheet.getByRole("button", { name: /^Eintragen · \d+ kcal$/ }).click(),
  ]);
  const entry: { id: number; macros: { kcal: number } } = await logged.json();
  entries.track(entry.id);
  // Two of four portions are half of the dish.
  expect(Math.abs(entry.macros.kcal - recipe.totals.kcal / 2)).toBeLessThanOrEqual(1);
  await expect(page.locator(`[data-entry-id="${entry.id}"]`)).toContainText(name);

  // Weighed after cooking: 400 g, so a portion is 100 g and 100 g carry more.
  await page.locator(`[data-entry-id="${entry.id}"]`).click();
  await sheet.getByRole("button", { name: "Bearbeiten" }).click();
  await expect(sheet.getByRole("heading", { name: "Rezept bearbeiten" })).toBeVisible();
  await sheet.getByRole("textbox", { name: "Fertiggewicht in g" }).fill("400");
  await expect(sheet.getByText("1 Portion · 100 g")).toBeVisible();
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "PATCH" && new URL(r.url()).pathname === `/api/v1/recipes/${recipe.id}`),
    sheet.getByRole("button", { name: "Speichern" }).click(),
  ]);
  const food = await (await request.get(`/api/v1/foods/${recipe.food_id}`)).json();
  expect(food.standard_serving).toMatchObject({ label: "1 Portion", grams: 100 });
  expect(food.recipe_id).toBe(recipe.id);

  // The cookbook lists it, newest first, and logs it with cookbook + recipe + Eintragen.
  await expect(sheet.getByRole("heading", { name })).toBeVisible();
  await page.goto("/");
  const taps = await countTaps(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Meine Rezepte" }).click();
  await sheet.getByRole("list", { name: "Rezepte" }).getByRole("button").first().click();
  await expect(sheet.getByRole("heading", { name })).toBeVisible();
  const [again] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/v1/entries"),
    sheet.getByRole("button", { name: /^Eintragen · \d+ kcal$/ }).click(),
  ]);
  entries.track((await again.json()).id);
  expect(await taps(), "Kochbuch + Rezept + Eintragen").toBe(3);
  // In the diary the recipe stands in the accent colour.
  await expect(page.locator("[data-entry-id]").first().getByText(name)).toHaveClass(/text-primary/);
});
