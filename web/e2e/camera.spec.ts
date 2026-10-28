import { expect, test } from "@playwright/test";
import { barcodePng } from "./barcode-image";
import { HIT_CODE, MISS_CODE } from "./camera-setup";
import { Entries, entryIdFrom } from "./helpers";

// Barcode flow of SPEC 3 (project "camera"): Chromium's fake camera shows HIT_CODE after a
// white start (barcode-image.ts), the api asks the OFF stub of compose.test.yaml. The first
// entry stores the draft as food, so later runs find it in the own DB; both are a hit with
// the source Open Food Facts.

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
  await expect(sheet.getByRole("status", { name: "Menge" })).toHaveText("200g");

  const created = await entryIdFrom(page, "POST", /^\/api\/v1\/entries$/, () =>
    sheet.getByRole("button", { name: /^Eintragen · \d+ kcal$/ }).click(),
  );
  entries.track(created.id);
  expect(created.grams).toBe(200);
  await expect(page.locator(`[data-entry-id="${created.id}"]`)).toContainText("Testpudding Schoko");
});

test("without camera a photo of an unknown barcode leads to the editor with its GTIN", async ({ page }) => {
  // As without HTTPS: no mediaDevices, so the overlay offers the photo upload.
  await page.addInitScript(() => Object.defineProperty(navigator, "mediaDevices", { value: undefined }));
  await page.goto("/");
  await page.getByRole("button", { name: /^Kamera/ }).click();
  const camera = page.getByRole("region", { name: "Kamera" });
  await expect(camera.getByRole("button", { name: "Foto wählen" })).toBeVisible();
  await expect(camera.getByTestId("finder")).toHaveCount(0);

  await camera
    .getByTestId("barcode-photo")
    .setInputFiles({ name: "barcode.png", mimeType: "image/png", buffer: barcodePng(MISS_CODE) });
  await expect(camera.getByText("Kein Treffer für diesen Barcode.")).toBeVisible();
  await camera.getByRole("button", { name: "Etikett fotografieren" }).click();

  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Neues Lebensmittel")).toBeVisible();
  await expect(sheet.getByLabel("GTIN")).toHaveValue("0" + MISS_CODE);
  await expect(sheet.getByLabel("Name", { exact: true })).toHaveValue("");
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
