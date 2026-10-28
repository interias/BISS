import { defineConfig, devices } from "@playwright/test";
import { FAKE_VIDEO } from "./e2e/camera-setup";

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
  globalSetup: "./e2e/global-setup.ts",
  projects: [
    { name: "chromium", use: phone, testIgnore: /screens\.spec\.ts|camera\.spec\.ts/ },
    // Chromium's fake camera plays a barcode video; localhost is a secure context.
    {
      name: "camera",
      testMatch: /camera\.spec\.ts/,
      use: {
        ...phone,
        permissions: ["camera"],
        launchOptions: {
          args: [
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
            `--use-file-for-fake-video-capture=${FAKE_VIDEO}`,
          ],
        },
      },
    },
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
