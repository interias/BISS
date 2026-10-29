import { expect, test, type Page } from "@playwright/test";
import { barcodePng } from "./barcode-image";
import { HIT_CODE, MISS_CODE } from "./camera-setup";
import { readFileSync } from "node:fs";
import { countTaps, Entries, entryIdFrom } from "./helpers";
import { photoSet, realSets } from "./real-fixtures";

// Barcode flow of SPEC 3 (project "camera"): Chromium's fake camera shows HIT_CODE after a
// white start (barcode-image.ts), the api asks the OFF stub of compose.test.yaml. The first
// entry stores the draft as food, so later runs find it in the own DB; both are a hit with
// the source Open Food Facts. The label photo goes to the fake extractor (LABEL_EXTRACTOR
// in compose.test.yaml), which always reads FAKE_DRAFT, "Haferkeks Dinkel".

let entries: Entries;

test.beforeEach(async ({ request }) => {
  entries = new Entries(request);
});

test.afterEach(async () => {
  await entries.cleanup();
});

test("a barcode in the live picture opens the amount sheet with the OFF note", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Kamera/ }).click();
  const camera = page.getByRole("region", { name: "Kamera" });
  await expect(camera).toBeVisible();
  await expect(camera.getByTestId("finder")).toHaveAttribute("data-hit", "false");
  // The video shows the barcode only after a white start, so the scan has to go on. The
  // green frame stands for HIT_DELAY_MS only: an observer in the page keeps it, so neither
  // expect's back-off nor a busy page can skip it.
  await page.evaluate(() => {
    const seen = window as Window & { greenFrame?: boolean };
    new MutationObserver(() => {
      if (document.querySelector('[data-testid="finder"]')?.getAttribute("data-hit") === "true") seen.greenFrame = true;
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-hit"] });
  });
  await page.waitForFunction(() => (window as Window & { greenFrame?: boolean }).greenFrame === true, null, {
    timeout: 15_000,
  });

  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "Testpudding Schoko" })).toBeVisible();
  await expect(camera).toHaveCount(0);
  await expect(sheet.getByText("Testmarke", { exact: true })).toBeVisible();
  await expect(sheet.getByText("Daten von Open Food Facts (ODbL)")).toBeVisible();
  await expect(sheet.getByRole("spinbutton", { name: "Menge" })).toHaveValue("200");

  const created = await entryIdFrom(page, "POST", /^\/api\/v1\/entries$/, () =>
    sheet.getByRole("button", { name: /^Eintragen · \d+ kcal$/ }).click(),
  );
  entries.track(created.id);
  expect(created.grams).toBe(200);
  await expect(page.locator(`[data-entry-id="${created.id}"]`)).toContainText("Testpudding Schoko");
});

/** An EAN-13 with prefix 2 (internal numbers), new in every run: its food stays in the db. */
function newCode() {
  const body = "2" + String(Date.now()).slice(-11);
  const total = [...body].reverse().reduce((sum, digit, i) => sum + Number(digit) * (i % 2 === 0 ? 3 : 1), 0);
  return body + String((10 - (total % 10)) % 10);
}

async function scanPhoto(page: Page, code: string) {
  await page.getByRole("button", { name: /^Kamera/ }).click();
  const camera = page.getByRole("region", { name: "Kamera" });
  await expect(camera.getByRole("button", { name: "Foto wählen" })).toBeVisible();
  await camera
    .getByTestId("barcode-photo")
    .setInputFiles({ name: "barcode.png", mimeType: "image/png", buffer: barcodePng(code) });
  return camera;
}

test("without camera the label of an unknown barcode fills the editor and is logged", async ({ page }) => {
  // As without HTTPS: no mediaDevices, so the overlay offers the photo upload.
  await page.addInitScript(() => Object.defineProperty(navigator, "mediaDevices", { value: undefined }));
  const code = newCode();
  await page.goto("/");
  const camera = await scanPhoto(page, code);
  await expect(camera.getByTestId("finder")).toHaveCount(0);
  await expect(camera.getByText("Kein Treffer für diesen Barcode.")).toBeVisible();

  // The shutter: without camera a photo of the label; any image will do for the fake.
  await camera.getByRole("button", { name: "Etikett fotografieren" }).click();
  const extracted = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/v1/labels/extract");
  await camera
    .getByTestId("label-photo")
    .setInputFiles({ name: "etikett.png", mimeType: "image/png", buffer: barcodePng(MISS_CODE) });
  expect((await extracted).status()).toBe(200);

  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Neu · aus Etikett gelesen")).toBeVisible();
  await expect(camera).toHaveCount(0);
  await expect(sheet.getByText(/Etikett-Foto\s*wird nur zum Auslesen genutzt und nicht gespeichert/)).toBeVisible();
  await expect(sheet.getByLabel("GTIN")).toHaveValue("0" + code);
  await expect(sheet.getByLabel("Name", { exact: true })).toHaveValue("Haferkeks Dinkel");
  await expect(sheet.getByLabel("Marke")).toHaveValue("Testmühle");
  await expect(sheet.getByLabel("Energie (kcal)")).toHaveValue("460");
  await expect(sheet.getByRole("listitem").getByLabel("Bezeichnung")).toHaveValue("1 Keks (12,5 g)");
  await expect(sheet.getByRole("listitem").getByTestId("origin")).toHaveText("Packung");
  await expect(sheet.getByTestId("label-warning")).toHaveCount(0); // the fake's draft is plausible

  // First confirmation: save, straight into the amount sheet of the new food.
  const [saved] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/v1/foods"),
    sheet.getByRole("button", { name: "Speichern & eintragen" }).click(),
  ]);
  expect(saved.status()).toBe(201);
  const food: {
    id: number;
    gtin: string;
    image_path: string | null;
    servings: { label: string; grams: number; origin: string }[];
  } = await saved.json();
  expect(food.gtin).toBe("0" + code);
  expect(food.image_path).toBeNull(); // the label photo is no product photo
  expect(food.servings.map(({ label, grams, origin }) => ({ label, grams, origin }))).toEqual([
    { label: "1 Keks (12,5 g)", grams: 12.5, origin: "package" },
  ]);
  await expect(sheet.getByRole("heading", { name: "Haferkeks Dinkel" })).toBeVisible();

  // Second confirmation: the entry.
  const created = await entryIdFrom(page, "POST", /^\/api\/v1\/entries$/, () =>
    sheet.getByRole("button", { name: /^Eintragen · \d+ kcal$/ }).click(),
  );
  entries.track(created.id);
  expect(created.grams).toBe(12.5); // the package serving of the label is the standard
  await expect(page.locator(`[data-entry-id="${created.id}"]`)).toContainText("Haferkeks Dinkel");

  // A new scan of the same GTIN finds the new food in the own DB.
  const [found] = await Promise.all([
    page.waitForResponse((r) => new URL(r.url()).pathname === `/api/v1/foods/barcode/${code}`),
    scanPhoto(page, code),
  ]);
  expect(found.status()).toBe(200);
  expect(((await found.json()) as { id: number }).id).toBe(food.id);
  await expect(sheet.getByRole("heading", { name: "Haferkeks Dinkel" })).toBeVisible();
  await expect(sheet.getByText("Daten von Open Food Facts (ODbL)")).toHaveCount(0);
});

test("a photo of a known barcode goes the same way as the live picture", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "mediaDevices", { value: undefined }));
  await page.goto("/");
  await page.getByRole("button", { name: /^Kamera/ }).click();
  await page
    .getByTestId("barcode-photo")
    .setInputFiles({ name: "barcode.png", mimeType: "image/png", buffer: barcodePng(HIT_CODE) });
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "Testpudding Schoko" })).toBeVisible();
  await expect(sheet.getByText("Daten von Open Food Facts (ODbL)")).toBeVisible();
});

/** The repo photo for the e2e test: the one whose ground truth carries e2e: "true" (ADR-0008). */
function e2ePhoto() {
  const set = photoSet(realSets()[0].root, "barcodes");
  const marked = set.photos.filter((photo) => photo.truth.e2e === "true");
  if (marked.length !== 1) {
    throw new Error(`exactly one photo in ${set.dir} needs e2e: "true" in its YAML, found ${marked.length}`);
  }
  return marked[0];
}

const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

test("tap budget: a real photo of a known barcode is logged with Kamera + 1", async ({ page }) => {
  // As without HTTPS: the photo upload stands in for the camera (ADR-0005).
  await page.addInitScript(() => Object.defineProperty(navigator, "mediaDevices", { value: undefined }));
  const taps = await countTaps(page);
  const photo = e2ePhoto();
  await page.goto("/");
  await page.getByRole("button", { name: /^Kamera/ }).click();
  const camera = page.getByRole("region", { name: "Kamera" });
  await expect(camera.getByRole("button", { name: "Foto wählen" })).toBeVisible();

  // The file goes straight into the input, without a click on "Foto wählen": that button
  // and the file choice replace the missing camera and do not count (SPEC 1).
  const [lookup] = await Promise.all([
    page.waitForResponse((r) => new URL(r.url()).pathname.startsWith("/api/v1/foods/barcode/")),
    camera.getByTestId("barcode-photo").setInputFiles({
      name: photo.file,
      mimeType: MIME[photo.file.split(".").pop()!.toLowerCase()],
      buffer: readFileSync(photo.path),
    }),
  ]);
  // The right digits: same GTIN-14 as the ground truth (a UPC-A comes as 12 digits).
  const read = new URL(lookup.url()).pathname.split("/").pop()!;
  expect(read.padStart(14, "0")).toBe(photo.truth.code.padStart(14, "0"));
  expect(lookup.status()).toBe(200);

  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("button", { name: /^Eintragen · \d+ kcal$/ })).toBeVisible();
  await expect(camera).toHaveCount(0);
  const created = await entryIdFrom(page, "POST", /^\/api\/v1\/entries$/, () =>
    sheet.getByRole("button", { name: /^Eintragen · \d+ kcal$/ }).click(),
  );
  entries.track(created.id);
  await expect(page.locator(`[data-entry-id="${created.id}"]`)).toBeVisible();
  expect(await taps(), "Kamera + Eintragen").toBe(2);
});

test("tap budget: a label without a barcode is logged with Kamera + Etikett + 2 confirmations", async ({ page }) => {
  // As without HTTPS: no mediaDevices, so the shutter "Etikett" opens the photo choice.
  await page.addInitScript(() => Object.defineProperty(navigator, "mediaDevices", { value: undefined }));
  const taps = await countTaps(page);
  // Any label photo will do for the fake extractor, which always reads FAKE_DRAFT.
  const labels = photoSet(realSets()[0].root, "labels");
  expect(labels.photos.length, labels.dir).toBeGreaterThan(0);
  const photo = labels.photos[0];
  await page.goto("/");
  await page.getByRole("button", { name: /^Kamera/ }).click();
  const camera = page.getByRole("region", { name: "Kamera" });

  // No barcode before: the shutter alone. The file goes straight into the input it opens;
  // the file choice replaces the missing camera and does not count (SPEC 1).
  await camera.getByRole("button", { name: "Etikett", exact: true }).click();
  const [extracted] = await Promise.all([
    page.waitForResponse((r) => new URL(r.url()).pathname === "/api/v1/labels/extract"),
    camera.getByTestId("label-photo").setInputFiles({
      name: photo.file,
      mimeType: MIME[photo.file.split(".").pop()!.toLowerCase()],
      buffer: readFileSync(photo.path),
    }),
  ]);
  expect(extracted.status()).toBe(200);
  // The backend answers the GTIN of the request: none went along (SPEC 7).
  expect(((await extracted.json()) as { draft: { gtin: string | null } }).draft.gtin).toBeNull();

  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Neu · aus Etikett gelesen")).toBeVisible();
  await expect(camera).toHaveCount(0);
  await expect(sheet.getByLabel("GTIN")).toHaveValue("");
  await expect(sheet.getByLabel("Name", { exact: true })).toHaveValue("Haferkeks Dinkel");

  // First confirmation. The name repeats in every run, as there is no GTIN to tell the foods
  // apart; the test follows its own food and entry by id, so a second run passes as well.
  const [saved] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/v1/foods"),
    sheet.getByRole("button", { name: "Speichern & eintragen" }).click(),
  ]);
  expect(saved.status()).toBe(201);
  const food: { id: number; gtin: string | null; image_path: string | null } = await saved.json();
  expect(food.gtin).toBeNull();
  expect(food.image_path).toBeNull(); // the label photo is no product photo
  await expect(sheet.getByRole("heading", { name: "Haferkeks Dinkel" })).toBeVisible();

  // Second confirmation: the entry of this food.
  const created = await entryIdFrom(page, "POST", /^\/api\/v1\/entries$/, () =>
    sheet.getByRole("button", { name: /^Eintragen · \d+ kcal$/ }).click(),
  );
  entries.track(created.id);
  expect((created as unknown as { food: { id: number } }).food.id).toBe(food.id);
  await expect(page.locator(`[data-entry-id="${created.id}"]`)).toContainText("Haferkeks Dinkel");
  expect(await taps(), "Kamera + Etikett + Speichern & eintragen + Eintragen").toBe(4);
});
