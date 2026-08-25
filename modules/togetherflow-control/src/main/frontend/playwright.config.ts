import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.TF_E2E_BASE_URL ?? "http://localhost:5275";

/**
 * End-to-end suite for TogetherFlow Control, run against a **real** engine rather than
 * mocks (REQUIREMENTS.md §8), so drift between this UI and the REST contract fails the
 * build instead of surfacing in production.
 */
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
  // Desktop-first: §8 makes Control a desktop-first, data-dense app; only Work carries
  // a tablet requirement.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.TF_E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
