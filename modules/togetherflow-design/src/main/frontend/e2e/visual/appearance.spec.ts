/**
 * Visual regression baseline for TogetherFlow Design (REQUIREMENTS.md §14.5,
 * UI_POLISH_BACKLOG.md G1). See Control's spec for the shared reasoning.
 *
 * The model library only — not the editors. bpmn-js and dmn-js render their own canvases,
 * whose output depends on the library version rather than on anything in this repo, so a
 * canvas screenshot would diff on a dependency bump and say nothing about the UI having
 * changed. The editor *chrome* is worth baselining and earns its own shot once W2.3
 * replaces the per-editor toolbars with the shared menu bar (I8).
 *
 * Update baselines deliberately, never reflexively:
 *   npm run e2e:visual -- --update-snapshots
 */

import { expect, test, type Page } from "@playwright/test";

const NOW = new Date("2026-08-21T10:00:00.000Z");

const MODELS = [
  {
    id: "m-1",
    name: "Invoice Approval",
    key: "invoiceApproval",
    category: "togetherflow:bpmn",
    version: 3,
    lastUpdateTime: "2026-08-20T16:20:00.000Z",
    createTime: "2026-07-02T09:00:00.000Z",
  },
  {
    id: "m-2",
    name: "Discount Rules",
    key: "discountRules",
    category: "togetherflow:dmn",
    version: 1,
    lastUpdateTime: "2026-08-18T11:05:00.000Z",
    createTime: "2026-08-18T11:00:00.000Z",
  },
  {
    id: "m-3",
    name: "Customer Onboarding",
    key: "customerOnboarding",
    category: "togetherflow:cmmn",
    version: 2,
    lastUpdateTime: "2026-08-19T08:30:00.000Z",
    createTime: "2026-08-01T10:00:00.000Z",
  },
  {
    id: "m-4",
    name: "Expense Claim",
    key: "expenseClaim",
    category: "togetherflow:form",
    version: 1,
    lastUpdateTime: "2026-08-21T09:00:00.000Z",
    createTime: "2026-08-21T09:00:00.000Z",
  },
];

async function stubApi(page: Page) {
  const json = (route: Parameters<Parameters<Page["route"]>[1]>[0], body: unknown) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

  await page.route("**/process-api/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/repository/models")) {
      return json(route, { data: MODELS, total: MODELS.length, start: 0, size: 25 });
    }
    return json(route, { data: [], total: 0, start: 0, size: 25 });
  });
  for (const base of ["idm-api", "dmn-api", "cmmn-api", "app-api", "event-registry-api"]) {
    await page.route(`**/${base}/**`, (route) =>
      json(route, { data: [], total: 0, start: 0, size: 25 }),
    );
  }
}

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Username").fill("designer");
  await page.getByLabel("Password").fill("secret");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.locator("tbody tr").first().waitFor();
}

test.describe("appearance", () => {
  test.beforeEach(async ({ page }) => {
    // setFixedTime, not install(): it pins Date/now without freezing the timers the app
    // itself relies on.
    await page.clock.setFixedTime(NOW);
    await stubApi(page);
  });

  test("login screen", async ({ page }) => {
    await page.goto("/");
    await page.locator(".tf-login__card").waitFor();
    await expect(page).toHaveScreenshot("login.png", { fullPage: true });
  });

  test("model library", async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveScreenshot("library.png", { fullPage: true });
  });

  test("model library in dark mode", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await signIn(page);
    await expect(page).toHaveScreenshot("library-dark.png", { fullPage: true });
  });

  test("model library with the rail collapsed", async ({ page }) => {
    await signIn(page);
    await page.getByRole("button", { name: "Collapse" }).click();
    await expect(page).toHaveScreenshot("library-rail-collapsed.png", { fullPage: true });
  });
});
