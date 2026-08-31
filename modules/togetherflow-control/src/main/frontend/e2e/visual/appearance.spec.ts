/**
 * Visual regression baseline for TogetherFlow Control (REQUIREMENTS.md §14.5,
 * UI_POLISH_BACKLOG.md G1).
 *
 * G1's finding was that visual regression covered "one app, three screens, and is stale".
 * W1.5 moved it out of E8 for the reason the plan's Risk #5 gives: baselines regenerated
 * only at the end of the programme are stale for the whole of Wave 2, so E1's gains erode
 * silently. This is Control's half of that.
 *
 * Runs against the built app with the REST layer stubbed, so a screenshot diff means the
 * UI changed — not that the engine returned different data. Deliberately separate from
 * the golden-path suite, which needs a real engine.
 *
 * The browser clock is frozen (see NOW): the fixtures carry absolute dates and the UI
 * renders them relatively, so against the real clock every baseline would expire
 * overnight — a diff that says nothing about the UI having changed.
 *
 * Update baselines deliberately, never reflexively:
 *   npm run e2e:visual -- --update-snapshots
 */

import { expect, test, type Page } from "@playwright/test";

/** Fixed "current time" the fixtures below are written against. */
const NOW = new Date("2026-08-21T10:00:00.000Z");

const INSTANCES = [
  {
    id: "pi-1",
    name: "Invoice 4471 — Northwind Ltd",
    processDefinitionName: "Invoice Approval",
    processDefinitionId: "invoiceApproval:3:aa11",
    businessKey: "INV-4471",
    startTime: "2026-08-20T09:12:00.000Z",
    suspended: false,
  },
  {
    id: "pi-2",
    name: "Onboarding — R. Okafor",
    processDefinitionName: "Employee Onboarding",
    processDefinitionId: "onboarding:2:bb22",
    startTime: "2026-08-19T14:03:00.000Z",
    suspended: true,
  },
  {
    id: "pi-3",
    name: "Purchase order 88231",
    processDefinitionName: "Procurement",
    processDefinitionId: "procurement:5:cc33",
    businessKey: "PO-88231",
    startTime: "2026-08-21T08:44:00.000Z",
    suspended: false,
  },
];

const JOBS = [
  {
    id: "job-1",
    elementId: "sendInvoiceEmail",
    elementName: "Send invoice email",
    handlerType: "async-continuation",
    retries: 0,
    exceptionMessage: "SMTP host refused the connection after 3 attempts",
    createTime: "2026-08-21T09:40:00.000Z",
    processInstanceId: "pi-1",
  },
  {
    id: "job-2",
    elementId: "escalationTimer",
    elementName: "Escalation timer",
    handlerType: "timer-transition",
    retries: 3,
    createTime: "2026-08-21T07:15:00.000Z",
    processInstanceId: "pi-3",
  },
];

async function stubApi(page: Page) {
  const json = (route: Parameters<Parameters<Page["route"]>[1]>[0], body: unknown) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

  await page.route("**/process-api/**", async (route) => {
    const url = route.request().url();
    // Nav counts are `size=1` probes; they must not return the full page.
    const isCount = url.includes("size=1&") || url.endsWith("size=1");

    if (url.includes("/query/process-instances") || url.includes("/runtime/process-instances")) {
      if (isCount) return json(route, { data: [], total: INSTANCES.length, start: 0, size: 1 });
      return json(route, { data: INSTANCES, total: INSTANCES.length, start: 0, size: 25 });
    }
    if (url.includes("deadletter-jobs")) {
      if (isCount) return json(route, { data: [], total: 2, start: 0, size: 1 });
      return json(route, { data: JOBS, total: JOBS.length, start: 0, size: 25 });
    }
    if (url.includes("/management/")) {
      return json(route, { data: JOBS, total: JOBS.length, start: 0, size: 25 });
    }
    if (url.includes("/repository/deployments")) {
      return json(route, {
        data: [
          {
            id: "dep-1",
            name: "invoice-approval.bar",
            deploymentTime: "2026-08-18T11:00:00.000Z",
            category: null,
          },
        ],
        total: 1,
        start: 0,
        size: 25,
      });
    }
    return json(route, { data: [], total: 0, start: 0, size: 25 });
  });

  // The other engines answer empty rather than 404: an unreachable engine renders an
  // error state, which is a different screen from the one being baselined.
  for (const base of ["cmmn-api", "dmn-api", "event-registry-api", "external-job-api"]) {
    await page.route(`**/${base}/**`, (route) => json(route, { data: [], total: 0, start: 0, size: 25 }));
  }
}

/**
 * Signs in and lands wherever `to` says.
 *
 * It waits for the *shell*, not for a table row: W2.1 made the overview the default
 * screen, and the overview has count tiles rather than rows — so waiting for `tbody tr`
 * after sign-in waits for something that will never appear. Each test then navigates to
 * the screen it is actually baselining, rather than assuming sign-in lands there.
 */
async function signIn(page: Page, section?: RegExp) {
  await page.goto("/");
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password").fill("secret");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.locator(".tf-shell__header").waitFor();
  if (section) {
    // Clicked, not `page.goto`. The session is held in memory (ADR 0006), so a full
    // page load lands back on the sign-in screen — which is what a `goto` here does.
    // Clicking the rail is client-side navigation, and is what a user does anyway.
    // Unanchored: a rail link's accessible name carries its count badge too
    // ("Instances 3 Instances"), so an anchored pattern matches nothing.
    await page.getByRole("link", { name: section }).first().click();
    await page.locator("tbody tr").first().waitFor();
  }
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

  test("process instances", async ({ page }) => {
    await signIn(page, /^Instances/);
    // The rail, the page header, the badges and the paging bar are all in this shot.
    await expect(page).toHaveScreenshot("instances.png", { fullPage: true });
  });

  test("process instances in dark mode", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await signIn(page, /^Instances/);
    await expect(page).toHaveScreenshot("instances-dark.png", { fullPage: true });
  });

  test("job queue with a selection", async ({ page }) => {
    await signIn(page, /^Jobs/);
    // Selecting raises the bulk-action bar, which is the half of C1 worth baselining.
    await page.getByLabel(/select all jobs on this page/i).check();
    await expect(page).toHaveScreenshot("jobs-selected.png", { fullPage: true });
  });

  test("job queue in dark mode", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await signIn(page, /^Jobs/);
    await expect(page).toHaveScreenshot("jobs-dark.png", { fullPage: true });
  });
});
