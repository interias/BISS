import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { addDays, backfillEatenAt, mondayOf, monthStart } from "../lib/dates";
import { shortDay } from "../lib/format";
import { countTaps, Entries, findFood, tab } from "./helpers";

// Review of earlier days, statistics and settings (ADR-0015) with the tap budgets of SPEC 1:
// yesterday = 1, a day of the same month = Datum + 1, back to today = 1, Statistik = 1,
// Einstellungen = 1. The backend's today decides the days (04:00 boundary).

type Goal = { kcal: number; protein: number; carbs: number; fat: number };

let entries: Entries;
let bananaId: number;
let today: string;
let yesterday: string;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The date in the header; its button opens "Tag wählen". */
const dateButton = (page: Page) => page.getByRole("button", { name: /, Tag wählen$/ });

async function dayOf(request: APIRequestContext, date: string) {
  const response = await request.get(`/api/v1/days/${date}`);
  expect(response.ok()).toBe(true);
  return (await response.json()) as { date: string; targets: Goal };
}

test.beforeEach(async ({ request }) => {
  entries = new Entries(request);
  bananaId = await findFood(request, "banane", "Banane roh");
  today = (await dayOf(request, "today")).date;
  yesterday = addDays(today, -1);
});

test.afterEach(async () => {
  await entries.cleanup();
});

test("tap budget: yesterday with 1 tap, back to today with 1", async ({ page }) => {
  const taps = await countTaps(page);
  await page.goto("/");
  await expect(dateButton(page)).toHaveText(`Heute · ${shortDay(today)}`);

  await page.getByRole("button", { name: "Einen Tag zurück" }).click();
  await expect(dateButton(page)).toHaveText(`Gestern · ${shortDay(yesterday)}`);
  expect(await taps(), "Pfeil zurück").toBe(1);
  // An earlier day has no dock: nothing lands there by accident.
  await expect(page.getByRole("button", { name: "Lebensmittel suchen" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "+ Nachtragen" })).toBeVisible();

  await page.getByRole("button", { name: "Zurück zu heute" }).click();
  await expect(dateButton(page)).toHaveText(`Heute · ${shortDay(today)}`);
  expect(await taps(), "Pfeil zurück + Zurück zu heute").toBe(2);
  await expect(page.getByRole("button", { name: "Lebensmittel suchen" })).toBeVisible();
  // Never beyond today: there is no arrow forward on today.
  await expect(page.getByRole("button", { name: "Einen Tag vor" })).toHaveCount(0);

  // Heute while on Heute jumps to today as well.
  await page.getByRole("button", { name: "Einen Tag zurück" }).click();
  await page.getByRole("button", { name: "Einen Tag zurück" }).click();
  await expect(dateButton(page)).toHaveText(shortDay(addDays(today, -2)));
  await tab(page, "Heute").click();
  await expect(dateButton(page)).toHaveText(`Heute · ${shortDay(today)}`);
});

test("tap budget: a day of the same month with Datum + 1", async ({ page }) => {
  const target = monthStart(today);
  test.skip(target === today, "on the first of a month there is no earlier day in it");
  const taps = await countTaps(page);
  await page.goto("/");
  await dateButton(page).click();
  const sheet = page.getByRole("dialog", { name: "Tag wählen" });
  // Days after today are locked.
  const tomorrow = addDays(today, 1);
  if (monthStart(tomorrow) === target) {
    await expect(sheet.getByRole("button", { name: new RegExp(`^${escape(shortDay(tomorrow))}`) })).toBeDisabled();
  }
  await sheet.getByRole("button", { name: new RegExp(escape(shortDay(target))) }).click();
  await expect(sheet).toBeHidden();
  await expect(dateButton(page)).toContainText(shortDay(target));
  expect(await taps(), "Datum + Tag").toBe(2);
});

test("tap budget: Statistik and Einstellungen with 1 tap each", async ({ page }) => {
  const taps = await countTaps(page);
  await page.goto("/");
  await tab(page, "Statistik").click();
  await expect(page.getByRole("heading", { name: "Statistik" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Zeitraum" }).getByRole("button", { name: "Woche" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText("Diese Woche")).toBeVisible();
  expect(await taps(), "Statistik").toBe(1);

  await tab(page, "Einstellungen").click();
  await expect(page.getByRole("heading", { name: "Einstellungen" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Kalorien" })).toBeVisible();
  expect(await taps(), "Statistik + Einstellungen").toBe(2);
});

test("backfilling yesterday logs there and says so; Rückgängig removes it", async ({ page }) => {
  await entries.create(bananaId, 120, "snack"); // makes the banana a recent food
  const taps = await countTaps(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Einen Tag zurück" }).click();
  await page.getByRole("button", { name: "+ Nachtragen" }).click();
  await expect(page.getByText(`Trägt ein für ${shortDay(yesterday)}`)).toBeVisible();

  const chip = page.getByRole("group", { name: "Zuletzt gegessen" }).getByRole("button", { name: /^Banane roh\s*120 g$/ });
  const [request, response] = await Promise.all([
    page.waitForRequest((r) => r.method() === "POST" && new URL(r.url()).pathname === "/api/v1/entries"),
    page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/v1/entries"),
    chip.click(),
  ]);
  const created: { id: number; day: string } = await response.json();
  entries.track(created.id);
  expect(request.postDataJSON().eaten_at).toBeTruthy();
  expect(created.day).toBe(yesterday);
  expect(await taps(), "Pfeil zurück + Nachtragen + Chip").toBe(3);

  await expect(page.getByRole("status")).toContainText(
    new RegExp(`^Banane roh eingetragen für ${escape(shortDay(yesterday))} · \\d+ kcal`),
  );
  const row = page.getByRole("region", { name: "Tagebuch" }).locator(`[data-entry-id="${created.id}"]`);
  await expect(row).toBeVisible();
  await page.getByRole("button", { name: "Rückgängig" }).click();
  await expect(row).toHaveCount(0);
  expect((await page.request.delete(`/api/v1/entries/${created.id}`)).status()).toBe(404);

  // Fertig hides the dock again; today never got the entry.
  await page.getByRole("button", { name: "Fertig" }).click();
  await expect(page.getByRole("button", { name: "Lebensmittel suchen" })).toHaveCount(0);
});

test("Statistik: a bar shows its day and Öffnen opens it on Heute", async ({ page, request }) => {
  const response = await request.post("/api/v1/entries", {
    data: { food_id: bananaId, grams: 150, eaten_at: backfillEatenAt(yesterday) },
  });
  expect(response.status()).toBe(201);
  const seeded: { id: number; day: string } = await response.json();
  entries.track(seeded.id);
  expect(seeded.day).toBe(yesterday);

  await page.goto("/");
  await tab(page, "Statistik").click();
  // This week on opening; on a Monday yesterday lies in last week.
  await expect(page.getByText("Diese Woche")).toBeVisible();
  if (yesterday < mondayOf(today)) {
    await page.getByRole("button", { name: "Zeitraum zurück" }).click();
    await expect(page.getByText("Letzte Woche")).toBeVisible();
  }
  const chart = page.getByRole("group", { name: "Kalorien je Tag" });
  await chart.getByRole("button", { name: new RegExp(`^${escape(shortDay(yesterday))}: [\\d.]+ kcal$`) }).click();
  await expect(page.getByText(shortDay(yesterday), { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Öffnen", exact: true }).click();

  await expect(page.getByRole("heading", { name: "BISS" })).toBeVisible();
  await expect(dateButton(page)).toHaveText(`Gestern · ${shortDay(yesterday)}`);
  await expect(page.locator(`[data-entry-id="${seeded.id}"]`)).toBeVisible();

  // The back button returns to the statistics, once more to today; the app stays.
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Statistik" })).toBeVisible();
  await page.goBack();
  await expect(dateButton(page)).toHaveText(`Heute · ${shortDay(today)}`);
});

test("back from a day opened in the statistics shows the period it was opened from", async ({ page, request }) => {
  // A day two weeks back: its week is called "KW nn", unlike this and last week.
  const day = addDays(today, -14);
  const response = await request.post("/api/v1/entries", {
    data: { food_id: bananaId, grams: 150, eaten_at: backfillEatenAt(day) },
  });
  expect(response.status()).toBe(201);
  entries.track((await response.json()).id);

  await page.goto("/");
  await tab(page, "Statistik").click();
  const bar = page
    .getByRole("group", { name: "Kalorien je Tag" })
    .getByRole("button", { name: new RegExp(`^${escape(shortDay(day))}: [\\d.]+ kcal$`) });
  await expect(page.getByText(/^(Diese|Letzte) Woche/)).toBeVisible();
  // Back week by week until the day's bar shows (one step fewer on a Monday).
  await expect(async () => {
    if (!(await bar.isVisible())) await page.getByRole("button", { name: "Zeitraum zurück" }).click();
    await expect(bar).toBeVisible({ timeout: 1000 });
  }).toPass();
  // The title "KW nn" carries its date range in the same element, right after the digits.
  const title = (await page.getByText(/^KW \d+/).textContent())!.match(/^KW \d+/)![0];
  await bar.click();
  await page.getByRole("button", { name: "Öffnen", exact: true }).click();
  await expect(page.getByRole("heading", { name: "BISS" })).toBeVisible();

  await page.goBack();
  await expect(page.getByText(new RegExp(`^${title}(?!\\d)`))).toBeVisible();
  // A tap on the tab opens this week again (on a Monday the one before).
  await tab(page, "Heute").click();
  await tab(page, "Statistik").click();
  await expect(page.getByText(/^(Diese|Letzte) Woche/)).toBeVisible();
});

test("a failed statistics load offers Nochmal, which loads the period shown", async ({ page }) => {
  await page.route("**/api/v1/stats?*", (route) => route.abort());
  await page.goto("/");
  await tab(page, "Statistik").click();
  const alert = page.getByRole("alert").filter({ hasText: "Das hat nicht geklappt." });
  await expect(alert).toBeVisible();
  await page.unroute("**/api/v1/stats?*");
  const [response] = await Promise.all([
    page.waitForResponse((r) => new URL(r.url()).pathname === "/api/v1/stats"),
    alert.getByRole("button", { name: "Nochmal" }).click(),
  ]);
  expect(response.ok()).toBe(true);
  await expect(page.getByRole("heading", { name: "Statistik", exact: true })).toBeVisible();
});

test("the back button on a tab goes to Heute, not out of the app", async ({ page }) => {
  await page.goto("/");
  for (const name of ["Rezepte", "Statistik", "Einstellungen"]) {
    await tab(page, name).click();
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("button", { name: "Lebensmittel suchen" })).toBeVisible();
  }
  // From one tab to the next is one step home, too.
  await tab(page, "Rezepte").click();
  await tab(page, "Statistik").click();
  await page.goBack();
  await expect(page.getByRole("button", { name: "Lebensmittel suchen" })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");
});

test.describe("goals", () => {
  let before: Goal;
  let tolerance: number;

  test.beforeEach(async ({ request }) => {
    before = await (await request.get("/api/v1/goals/default")).json();
    tolerance = (await (await request.get("/api/v1/settings")).json()).tolerance;
  });

  test.afterEach(async ({ request }) => {
    // Back to the goal and tolerance from before, so that no other test depends on them.
    const { kcal, protein, fat } = before;
    expect((await request.put("/api/v1/goals/default", { data: { kcal, protein, fat } })).ok()).toBe(true);
    expect((await request.put("/api/v1/settings", { data: { tolerance } })).ok()).toBe(true);
  });

  test("a goal changed from today leaves yesterday its goal", async ({ page, request }) => {
    const kept = (await dayOf(request, yesterday)).targets;
    const protein = Math.round(before.protein) + 7;
    await page.goto("/");
    await tab(page, "Einstellungen").click();
    const field = page.getByRole("textbox", { name: "Eiweiß" });
    await expect(field).toHaveValue(String(Math.round(before.protein)));
    await field.fill(String(protein));
    await expect(page.getByText(`Gilt ab heute, ${shortDay(today)}. Frühere Tage behalten ihre Ziele.`)).toBeVisible();

    const [saved] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "PUT" && new URL(r.url()).pathname === "/api/v1/goals/default"),
      page.getByRole("button", { name: "Ab heute übernehmen" }).click(),
    ]);
    expect(saved.ok()).toBe(true);
    const goal: Goal & { valid_from: string } = await saved.json();
    expect([goal.protein, goal.valid_from]).toEqual([protein, today]);
    // The carbs are the remainder of the kcal.
    expect(goal.carbs).toBeCloseTo((goal.kcal - 4 * goal.protein - 9 * goal.fat) / 4, 1);
    await expect(page.getByRole("status")).toContainText("Neue Ziele gelten ab heute");

    await tab(page, "Heute").click();
    await expect(page.getByTestId("macro-protein")).toContainText(`/ ${protein} g`);
    await page.getByRole("button", { name: "Einen Tag zurück" }).click();
    await expect(dateButton(page)).toHaveText(`Gestern · ${shortDay(yesterday)}`);
    await expect(page.getByTestId("macro-protein")).toContainText(`/ ${Math.round(kept.protein)} g`);
  });

  test("a tolerance applies at once", async ({ page }) => {
    await page.goto("/");
    await tab(page, "Einstellungen").click();
    const choice = page.getByRole("group", { name: "Toleranz" });
    const next = tolerance === 0.15 ? "±20 %" : "±15 %";
    const [saved] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "PUT" && new URL(r.url()).pathname === "/api/v1/settings"),
      choice.getByRole("button", { name: next }).click(),
    ]);
    expect(saved.ok()).toBe(true);
    await expect(choice.getByRole("button", { name: next })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("status")).toContainText(`Toleranz ${next} gespeichert`);
  });
});

test("the camera logs for today from an earlier day", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Einen Tag zurück" }).click();
  await expect(dateButton(page)).toHaveText(`Gestern · ${shortDay(yesterday)}`);
  await page.getByRole("button", { name: /^Kamera/ }).click();
  await expect(dateButton(page)).toHaveText(`Heute · ${shortDay(today)}`);
});
