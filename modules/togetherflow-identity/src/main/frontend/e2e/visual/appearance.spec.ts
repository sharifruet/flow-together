/**
 * Visual regression baseline for TogetherFlow Identity (REQUIREMENTS.md §14.5,
 * UI_POLISH_BACKLOG.md G1). See Control's spec for the shared reasoning; this covers the
 * screens Identity actually has.
 *
 * Update baselines deliberately, never reflexively:
 *   npm run e2e:visual -- --update-snapshots
 */

import { expect, test, type Page } from "@playwright/test";

const NOW = new Date("2026-08-21T10:00:00.000Z");

const USERS = [
  { id: "alice", firstName: "Alice", lastName: "Adams", email: "alice@example.com" },
  { id: "bob", firstName: "Bob", lastName: "Chen", email: "bob@example.com" },
  { id: "carol", firstName: "Carol", lastName: "Diaz", email: "carol@example.com" },
];

const GROUPS = [
  { id: "sales", name: "Sales", type: "assignment" },
  { id: "finance", name: "Finance", type: "assignment" },
];

async function stubApi(page: Page) {
  const json = (route: Parameters<Parameters<Page["route"]>[1]>[0], body: unknown) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

  await page.route("**/idm-api/**", async (route) => {
    const url = route.request().url();
    // Nav counts are `size=1` probes; they must not return the full page.
    const isCount = url.includes("size=1&") || url.endsWith("size=1");
    if (url.includes("/users")) {
      if (isCount) return json(route, { data: [], total: USERS.length, start: 0, size: 1 });
      return json(route, { data: USERS, total: USERS.length, start: 0, size: 25 });
    }
    if (url.includes("/groups")) {
      if (isCount) return json(route, { data: [], total: GROUPS.length, start: 0, size: 1 });
      return json(route, { data: GROUPS, total: GROUPS.length, start: 0, size: 25 });
    }
    if (url.includes("/privileges")) {
      return json(route, { data: [{ id: "p1", name: "access-admin" }], total: 1, start: 0, size: 25 });
    }
    return json(route, { data: [], total: 0, start: 0, size: 25 });
  });

  await page.route("**/process-api/**", (route) => json(route, {}));
}

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Username").fill("admin");
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

  test("user list", async ({ page }) => {
    await signIn(page);
    // Avatars and display names rather than the bare ids D1 found (W1.4).
    await expect(page).toHaveScreenshot("users.png", { fullPage: true });
  });

  test("user list in dark mode", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await signIn(page);
    await expect(page).toHaveScreenshot("users-dark.png", { fullPage: true });
  });

  test("groups", async ({ page }) => {
    await signIn(page);
    // Clicked, not `page.goto`: the session is held in memory (ADR 0006), so a full page
    // load lands back on the sign-in screen. Unanchored because a nav link's accessible
    // name carries its count badge as well as its label.
    await page.getByRole("link", { name: /^Groups/ }).first().click();
    await page.locator("tbody tr").first().waitFor();
    await expect(page).toHaveScreenshot("groups.png", { fullPage: true });
  });
});
