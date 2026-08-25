import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.TF_E2E_BASE_URL ?? "http://localhost:5273";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Work must be usable at tablet width (REQUIREMENTS.md §8, §14.6).
    { name: "tablet", use: { ...devices["iPad (gen 7)"] } },
  ],
  webServer: process.env.TF_E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
