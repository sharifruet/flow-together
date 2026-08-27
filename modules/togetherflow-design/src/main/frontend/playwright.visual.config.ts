import { defineConfig, devices } from "@playwright/test";

/**
 * Visual regression config, separate from the golden-path e2e config because these
 * tests stub the REST layer (so diffs mean UI change, not data change) and run against
 * the production build rather than the dev server.
 */
export default defineConfig({
  testDir: "./e2e/visual",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  /**
   * Tolerance is deliberately tight. A ratio like 0.01 sounds small but is ~13,000
   * pixels on a 1440x900 page — larger than many components, so a whole element can
   * change colour without failing. 0.0005 (~650px) still absorbs font anti-aliasing
   * but catches a component-sized change; verified by recolouring a chip and
   * confirming the suite fails.
   */
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.0005 } },
  use: {
    baseURL: "http://localhost:4176",
    // Deterministic rendering: no animation timing in the diff.
    launchOptions: { args: ["--force-prefers-reduced-motion"] },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "tablet", use: { ...devices["iPad (gen 7)"] } },
  ],
  webServer: {
    command: "npm run build && npx vite preview --port 4176",
    url: "http://localhost:4176",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
