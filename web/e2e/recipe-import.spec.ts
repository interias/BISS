import { expect, test } from "@playwright/test";
import { countTaps } from "./helpers";

// The fake extractor answers every import with FAKE_RECIPE (api/app/plates/extractor.py):
// "Bananen-Porridge", 2 portions, Hafer Flocken, Vollmilch and Banane matched against the BLS,
// "Zauberpulver" matching no food.

test("tap budget: a recipe from a pasted text is saved with Kochbuch + 3", async ({ page }) => {
  const taps = await countTaps(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Meine Rezepte" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "Aus Text oder Link" }).click();
  // Pasting is no tap.
  await sheet
    .getByRole("textbox", { name: "Rezepttext oder Link" })
    .fill("Porridge für 2: 100 g Haferflocken, 300 ml Milch, 1 Banane, etwas Zauberpulver");
  await sheet.getByRole("button", { name: "Übernehmen" }).click();

  await expect(sheet.getByRole("textbox", { name: "Name" })).toHaveValue("Bananen-Porridge");
  await expect(sheet.getByRole("status", { name: "Portionen" })).toHaveText("2");
  await expect(sheet.getByRole("spinbutton", { name: "Hafer Flocken Gramm" })).toHaveValue("100");
  // The unmatched ingredient is shown and does not count, nothing is dropped silently.
  await expect(sheet.getByText("nicht zugeordnet", { exact: true })).toBeVisible();
  await expect(sheet.getByText("Nicht zugeordnete Zutaten zählen nicht mit.")).toBeVisible();

  const [saved] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/v1/recipes"),
    sheet.getByRole("button", { name: "Speichern" }).click(),
  ]);
  expect(saved.status()).toBe(201);
  const recipe: { name: string; portions: number; items: { grams: number }[] } = await saved.json();
  expect([recipe.name, recipe.portions, recipe.items.length]).toEqual(["Bananen-Porridge", 2, 3]);
  expect(await taps(), "Kochbuch + Aus Text oder Link + Übernehmen + Speichern").toBe(4);
});

test("a new recipe closed by accident opens again as it was", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Meine Rezepte" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "+ Neues Rezept" }).click();
  await sheet.getByRole("textbox", { name: "Name" }).fill("Entwurf vom Test");
  await sheet.getByRole("button", { name: "Zutat suchen", exact: true }).click();
  // Escape in the search goes back to the recipe.
  await page.keyboard.press("Escape");
  await expect(sheet.getByRole("textbox", { name: "Name" })).toHaveValue("Entwurf vom Test");

  await page.reload();
  await page.getByRole("button", { name: "Meine Rezepte" }).click();
  await sheet.getByRole("button", { name: "+ Neues Rezept" }).click();
  await expect(sheet.getByRole("textbox", { name: "Name" })).toHaveValue("Entwurf vom Test");
  await sheet.getByRole("button", { name: "Verwerfen" }).click();
  await expect(sheet.getByRole("textbox", { name: "Name" })).toHaveValue("");
});
