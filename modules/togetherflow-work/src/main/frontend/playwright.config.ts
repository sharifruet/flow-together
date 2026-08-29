import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.TF_E2E_BASE_URL ?? "http://localhost:5273";

export default defineConfig({
  testDir: "./e2e",
  /*
   * The visual suite has its own config and its own baselines. Without this it is picked
   * up here too and run against every project — including Firefox, whose font
   * rasterisation differs from Chromium's, so every screenshot fails. Functional tests
   * run cross-engine; screenshots stay single-engine on purpose.
   */
  testIgnore: "**/visual/**",
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
    /*
     * Firefox, because a Chromium-only suite missed a real one: a `WWW-Authenticate:
     * Basic` header on a 401 makes Firefox open its own credential dialog and block the
     * XHR behind it, so a request against a service answering in 80ms never settled at
     * all. The status was right, the timing was right, and only a second engine showed
     * it. REQUIREMENTS §8 promises the last two versions of four evergreen browsers;
     * this is the cheapest honest step toward meaning it.
     *
     * Functional only — the visual suite stays single-engine, because font rasterisation
     * differs between engines and a per-engine baseline set would double the review cost
     * of every UI change to catch nothing extra.
     */
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
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
