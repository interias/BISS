import { expect, test, type Page } from "@playwright/test";
import { countTaps, Entries } from "./helpers";

// A dictated meal (ADR-0013, SPEC 3): the browser's speech recognition is replaced by one the
// test drives, as in KORB. The sentence goes to the fake plate extractor (PLATE_EXTRACTOR in
// compose.test.yaml), which reads "Hähnchen mit Reis und Brokkoli" from any sentence; the e2e
// stack loads the full BLS, so all three ingredients are matched.

const DISH = "Hähnchen mit Reis und Brokkoli";

type Fake = { instances: { aborted: boolean; hear(text: string): void }[] };

async function fakeSpeech(page: Page) {
  await page.addInitScript(() => {
    const speech: Fake = { instances: [] };
    class Recognition {
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      aborted = false;
      constructor() {
        speech.instances.push(this);
      }
      start() {}
      stop() {
        setTimeout(() => this.onend?.());
      }
      abort() {
        this.aborted = true;
        setTimeout(() => {
          this.onerror?.({ error: "aborted" });
          this.onend?.();
        });
      }
      hear(text: string) {
        this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: text } }] });
      }
    }
    (window as unknown as { bissSpeech: Fake }).bissSpeech = speech;
    Object.defineProperty(window, "SpeechRecognition", { value: Recognition, configurable: true });
    Object.defineProperty(window, "webkitSpeechRecognition", { value: Recognition, configurable: true });
  });
}

const hear = (page: Page, text: string) =>
  page.evaluate((said) => (window as unknown as { bissSpeech: Fake }).bissSpeech.instances[0].hear(said), text);

let entries: Entries;

test.beforeEach(async ({ request }) => {
  entries = new Entries(request);
});

test.afterEach(async () => {
  await entries.cleanup();
});

test("tap budget: a dictated meal is logged with Mikrofon + Fertig + 1 confirmation", async ({ page }) => {
  await fakeSpeech(page);
  const taps = await countTaps(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Mahlzeit diktieren" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "Ich höre zu" })).toBeVisible();
  await hear(page, "Hähnchenbrust mit Reis und Brokkoli");
  await expect(sheet.getByTestId("heard")).toHaveText("Hähnchenbrust mit Reis und Brokkoli");

  const [dictated] = await Promise.all([
    page.waitForResponse((r) => new URL(r.url()).pathname === "/api/v1/plates/dictate"),
    sheet.getByRole("button", { name: "Fertig" }).click(),
  ]);
  expect(dictated.status()).toBe(200);
  expect(dictated.request().postDataJSON()).toEqual({ text: "Hähnchenbrust mit Reis und Brokkoli" });

  await expect(sheet.getByText("Erkannt · bitte prüfen")).toBeVisible();
  await expect(sheet.getByRole("textbox", { name: "Gericht" })).toHaveValue(DISH);
  const rows = sheet.getByRole("list", { name: "Zutaten" }).getByRole("listitem");
  await expect(rows).toHaveCount(3);
  await expect(sheet.getByText("nicht zugeordnet", { exact: true })).toHaveCount(0);

  const uploads: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "PUT" && /\/foods\/\d+\/image$/.test(r.url())) uploads.push(r.url());
  });
  const [stored, logged] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/v1/recipes"),
    page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/v1/entries"),
    sheet.getByRole("button", { name: /^Eintragen · \d+ kcal$/ }).click(),
  ]);
  expect(stored.status()).toBe(201);
  expect(logged.status()).toBe(201);
  const entry: { id: number; food: { id: number } } = await logged.json();
  entries.track(entry.id);
  expect(entry.food.id).toBe((await stored.json()).food_id);
  expect(uploads, "a dictated dish has no photo").toEqual([]);

  await expect(page.locator(`[data-entry-id="${entry.id}"]`)).toContainText(DISH);
  await expect(page.getByText(new RegExp(`${DISH} eingetragen · \\d+ kcal`))).toBeVisible();
  expect(await taps(), "Mikrofon + Fertig + Eintragen").toBe(3);
});

test("the back button ends the listening without sending and stays in the app", async ({ page }) => {
  await fakeSpeech(page);
  const sent: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/v1/plates/dictate") sent.push(r.url());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Mahlzeit diktieren" }).click();
  await hear(page, "ein Apfel");
  await expect(page.getByTestId("heard")).toHaveText("ein Apfel");

  await page.goBack();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "BISS" })).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { bissSpeech: Fake }).bissSpeech.instances[0].aborted),
  ).toBe(true);
  expect(sent).toEqual([]);
});

test("there is no microphone without speech recognition in the browser", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "SpeechRecognition", { value: undefined, configurable: true });
    Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined, configurable: true });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Kamera/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mahlzeit diktieren" })).toHaveCount(0);
});
