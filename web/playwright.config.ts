import { defineConfig, devices } from "@playwright/test";

const port = 3100;

// Pixel 7 for a touch phone, at the 375 px width the prototype is checked against.
const phone = { ...devices["Pixel 7"], viewport: { width: 375, height: 812 } };

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: !!process.env.CI,
  // One worker: the tests share the stack's database and read the day's totals.
  workers: 1,
  reporter: "list",
  use: { baseURL: `http://localhost:${port}` },
  projects: [
    { name: "chromium", use: phone, testIgnore: /screens\.spec\.ts/ },
    // Screenshots of prototype and app for the review, only with `pnpm screens`.
    ...(process.env.SCREENS ? [{ name: "screens", use: phone, testMatch: /screens\.spec\.ts/ }] : []),
  ],
  // Production build of the working tree, served inside the test container; the
  // /api/v1 rewrite points at API_URL (the api service in the compose network).
  webServer: {
    command: `pnpm build && pnpm start --port ${port}`,
    url: `http://localhost:${port}`,
    timeout: 240_000,
    reuseExistingServer: false,
  },
});
