import { expect, test, type Page } from "@playwright/test";

/** Opens the app with a server whose version the test changes, and marks the loaded page. */
async function openApp(page: Page) {
  const server = { version: '"old"', asked: 0 };
  await page.route("/", (route) => {
    if (route.request().method() !== "HEAD") return route.continue();
    server.asked++;
    return route.fulfill({ status: 200, headers: { etag: server.version } });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Lebensmittel suchen" })).toBeVisible();
  await expect.poll(() => server.asked).toBe(1);
  await page.evaluate(() => Object.assign(window, { sameLoad: true }));
  return server;
}

/** The phone brings the app back to the front and the version check has been answered. */
async function backInFront(page: Page, server: { asked: number }) {
  const before = server.asked;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect.poll(() => server.asked).toBe(before + 1);
}

const sameLoad = (page: Page) => page.evaluate(() => "sameLoad" in window);

test("back in front a new version loads the app again", async ({ page }) => {
  const server = await openApp(page);
  server.version = '"new"';
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect.poll(() => sameLoad(page)).toBe(false);
  await expect(page.getByRole("button", { name: "Lebensmittel suchen" })).toBeVisible();
});

test("back in front the same version keeps the page", async ({ page }) => {
  const server = await openApp(page);
  await backInFront(page, server);
  await page.waitForTimeout(300);
  expect(await sameLoad(page)).toBe(true);
});

test("an open sheet is not lost to a new version", async ({ page }) => {
  const server = await openApp(page);
  await page.getByRole("button", { name: "Lebensmittel suchen" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  server.version = '"new"';
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForTimeout(300);
  expect(await sameLoad(page)).toBe(true);
  await expect(page.getByRole("dialog")).toBeVisible();
});
