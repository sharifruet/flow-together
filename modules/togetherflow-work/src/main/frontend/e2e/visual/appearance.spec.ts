/**
 * Visual regression baseline (REQUIREMENTS.md §14.5).
 *
 * Runs against the built app with the REST layer stubbed, so a screenshot diff means
 * the UI changed — not that the backend returned different data. Deliberately separate
 * from the golden-path suite, which needs a real engine.
 *
 * The browser clock is frozen (see NOW). The fixtures carry absolute dates but the UI
 * renders them relatively ("in 5 days"), so against the real clock every baseline would
 * silently expire overnight — a diff that says nothing about the UI having changed.
 *
 * Update baselines deliberately, never reflexively:
 *   npm run e2e:visual -- --update-snapshots
 */

import { expect, test, type Page } from "@playwright/test";

/** Fixed "current time" the fixtures below are written against. */
const NOW = new Date("2026-08-21T10:00:00.000Z");

const TASKS = [
  {
    id: "t1",
    name: "Approve invoice INV-2291",
    description: "Vendor: Northwind Ltd",
    priority: 80,
    suspended: false,
    assignee: "alice",
    createTime: "2026-08-20T09:12:00.000Z",
    dueDate: "2026-08-22T17:00:00.000Z",
  },
  {
    id: "t2",
    name: "Review onboarding checklist",
    priority: 50,
    suspended: false,
    assignee: "alice",
    createTime: "2026-08-23T11:00:00.000Z",
    dueDate: "2026-08-30T17:00:00.000Z",
  },
];

async function stubApi(page: Page) {
  await page.route("**/process-api/**", async (route) => {
    const url = route.request().url();
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

    if (url.includes("/query/tasks")) {
      const body = route.request().postDataJSON() ?? {};
      if (body.size === 1) return json({ data: [], total: 0, start: 0, size: 1 });
      return json({ data: TASKS, total: TASKS.length, start: 0, size: 25 });
    }
    if (/\/runtime\/tasks\/[^/]+\/variables/.test(url)) {
      return json([{ name: "amount", type: "double", value: 4120, scope: "global" }]);
    }
    if (/\/runtime\/tasks\/[^/]+\/attachments/.test(url)) {
      return json([{ id: "a1", name: "invoice-scan.pdf", userId: "bob", contentUrl: "x", time: "2026-08-21T09:00:00Z" }]);
    }
    if (/\/runtime\/tasks\/[^/]+\/comments/.test(url)) return json([]);
    if (/\/runtime\/tasks\/[^/]+$/.test(url)) return json(TASKS[0]);
    if (url.includes("/repository/process-definitions")) {
      return json({
        data: [{ id: "p1", key: "invoiceApproval", name: "Invoice Approval", version: 3, graphicalNotationDefined: true, suspended: false, startFormDefined: false }],
        total: 1, start: 0, size: 100,
      });
    }
    return json({});
  });
}

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Username").fill("alice");
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

  test("task inbox", async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveScreenshot("inbox.png", { fullPage: true });
  });

  test("task detail", async ({ page }) => {
    await signIn(page);
    await page.locator("tbody tr").first().click();
    await page.locator(".tf-detail__title").waitFor();
    await page.locator(".tf-variables__row").first().waitFor();
    await expect(page).toHaveScreenshot("task-detail.png", { fullPage: true });
  });

  test("task inbox in dark mode", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await signIn(page);
    await expect(page).toHaveScreenshot("inbox-dark.png", { fullPage: true });
  });
});
