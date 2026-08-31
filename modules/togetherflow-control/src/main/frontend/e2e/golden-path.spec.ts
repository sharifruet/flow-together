/**
 * Control's golden path — "retry a job" from REQUIREMENTS.md §8's list — run against a
 * real engine:
 *
 *   docker run -d --name tf-engine -p 8080:8080 flowable/flowable-rest
 *   TF_E2E_USER=rest-admin TF_E2E_PASSWORD=test npm run e2e
 *
 * Job queues on a freshly started engine are usually empty, and a test that silently
 * passes on an empty queue proves nothing. Where a queue has nothing in it these skip
 * with a reason rather than reporting green — the assertions that always run are the
 * ones about the screens themselves.
 */

import { expect, test, type Page } from "@playwright/test";

const USER = process.env.TF_E2E_USER ?? "rest-admin";
const PASSWORD = process.env.TF_E2E_PASSWORD ?? "test";

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Username").fill(USER);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByTestId("togetherflow-brand")).toBeVisible();
}

/**
 * Navigates by clicking the rail.
 *
 * Two things this suite predates: nav items are `<Link>`s rather than buttons since W1.3
 * (F1), and their accessible name carries the count badge as well as the label
 * ("Instances 3 Instances") — so both an anchored pattern and a `button` role match
 * nothing. A `page.goto` is not the alternative: the session is held in memory (ADR
 * 0006), so a full page load lands back on the sign-in screen.
 */
async function goTo(page: Page, section: RegExp) {
  await page.getByRole("link", { name: section }).first().click();
}

test.describe("TogetherFlow Control golden path", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("lists process instances and opens one", async ({ page }) => {
    // W2.1 made the overview the landing screen, so this navigates rather than assuming.
    await goTo(page, /^Instances/);
    await expect(page.getByRole("heading", { name: /Process instances/ })).toBeVisible();

    const row = page.locator("table tbody tr").first();
    const hasInstances = await row.isVisible().catch(() => false);
    test.skip(!hasInstances, "No running instances on this engine.");

    await row.click();
    await expect(page.getByRole("region", { name: /instance detail/i })).toBeVisible();
    // The diagram and activity list are what make a stuck instance diagnosable (§7.2).
    await expect(page.getByRole("heading", { name: "Diagram" })).toBeVisible();
  });

  test("shows every job queue, and offers bulk actions only on a selection", async ({ page }) => {
    await goTo(page, /^Jobs/);

    for (const queue of ["Async", "Timers", "Suspended", "Dead letter", "History"]) {
      await expect(page.getByRole("tab", { name: queue })).toBeVisible();
    }

    // Bulk actions are §14.4 scope, and must not be reachable with nothing selected.
    await expect(page.getByRole("group", { name: /bulk actions/i })).toHaveCount(0);
  });

  test("retries a job, confirming first", async ({ page }) => {
    await goTo(page, /^Jobs/);

    const firstJob = page.getByRole("checkbox", { name: /^select job/i }).first();
    const hasJobs = await firstJob.isVisible().catch(() => false);
    test.skip(!hasJobs, "No async jobs on this engine to retry.");

    await firstJob.check();
    await expect(page.getByRole("group", { name: /bulk actions/i })).toBeVisible();

    await page.getByRole("button", { name: /run now/i }).click();
    // §14.3: the confirmation must name what is about to happen.
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText(/executed immediately/i);
    await dialog.getByRole("button", { name: /run now/i }).click();

    await expect(page.getByText(/job/i).first()).toBeVisible();
  });

  test("browses the engine's own tables read-only", async ({ page }) => {
    await goTo(page, /^System/);
    await page.getByRole("tab", { name: "Database" }).click();

    const table = page.locator(".tf-card").first();
    await expect(table).toBeVisible();
    await table.click();
    await expect(page.getByText(/read-only view/i)).toBeVisible();
  });

  test("refuses to offer suspend on a case definition, which the engine cannot do", async ({
    page,
  }) => {
    await goTo(page, /^Definitions/);
    await page.getByRole("tab", { name: "Cases" }).click();
    // §7.2 is explicit that this action must not be offered for case definitions.
    await expect(page.getByRole("button", { name: /^suspend$/i })).toHaveCount(0);
  });
});
