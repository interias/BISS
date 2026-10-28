import { defineConfig, devices } from "@playwright/test";

const port = 3100;

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: !!process.env.CI,
  reporter: "list",
  use: { baseURL: `http://localhost:${port}` },
  projects: [{ name: "chromium", use: { ...devices["Pixel 7"] } }],
  // Production build of the working tree, served inside the test container.
  webServer: {
    command: `pnpm build && pnpm start --port ${port}`,
    url: `http://localhost:${port}`,
    timeout: 240_000,
    reuseExistingServer: false,
  },
});
