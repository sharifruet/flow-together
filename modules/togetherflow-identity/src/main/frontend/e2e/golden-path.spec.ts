/**
 * Identity's golden path — "create a user" from REQUIREMENTS.md §8's list — run against
 * a real engine:
 *
 *   docker run -d --name tf-engine -p 8080:8080 flowable/flowable-rest
 *   TF_E2E_USER=rest-admin TF_E2E_PASSWORD=test npm run e2e
 *
 * The whole point of running this against the engine rather than a mock is contract
 * drift: IDM is the one surface with a hand-authored spec, so a mismatch between what
 * this UI sends and what the engine accepts has to fail here or nowhere.
 */

import { expect, test, type Page } from "@playwright/test";

const USER = process.env.TF_E2E_USER ?? "rest-admin";
const PASSWORD = process.env.TF_E2E_PASSWORD ?? "test";

/**
 * Unique per run: these tests create real rows in a real engine, and a fixed id would
 * pass once and then collide with itself forever.
 */
const RUN = Date.now().toString(36);
const NEW_USER = `tf-e2e-${RUN}`;
const NEW_GROUP = `tf-e2e-group-${RUN}`;

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Username").fill(USER);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByTestId("togetherflow-brand")).toBeVisible();
}

test.describe("TogetherFlow Identity golden path", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("creates a user, finds it, and deletes it again", async ({ page }) => {
    await page.getByRole("button", { name: /new user/i }).click();

    await page.getByLabel("User id").fill(NEW_USER);
    await page.getByLabel("First name").fill("End");
    await page.getByLabel("Last name").fill("ToEnd");
    await page.getByLabel("Email").fill(`${NEW_USER}@example.com`);
    await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
    await page.getByRole("button", { name: /create user/i }).click();

    await expect(page.getByText(new RegExp(`User "${NEW_USER}" created`))).toBeVisible();

    // Search is server-side, so this also proves the created row is really there.
    await page.getByRole("searchbox").fill(NEW_USER);
    await expect(page.getByRole("cell", { name: new RegExp(NEW_USER) })).toBeVisible();

    // Clean up after ourselves — the engine outlives the test run.
    await page.getByRole("button", { name: new RegExp(`delete .*${NEW_USER}`, "i") }).click();
    await expect(page.getByRole("alertdialog")).toContainText(/can't be undone/i);
    await page.getByRole("button", { name: /^delete user$/i }).click();
    await expect(page.getByText(new RegExp(`User "${NEW_USER}" deleted`))).toBeVisible();
  });

  test("refuses an invalid user rather than sending it to the engine", async ({ page }) => {
    await page.getByRole("button", { name: /new user/i }).click();
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByRole("button", { name: /create user/i }).click();

    await expect(page.getByText(/a user id is required/i)).toBeVisible();
    await expect(page.getByText(/enter a valid email address/i)).toBeVisible();
    // Still open: an invalid submit must not look like a successful one.
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("creates a group and adds a member to it", async ({ page }) => {
    await page.getByRole("button", { name: /groups/i }).click();
    await page.getByRole("button", { name: /new group/i }).click();

    await page.getByLabel("Group id").fill(NEW_GROUP);
    await page.getByLabel("Name", { exact: true }).fill("E2E group");
    await page.getByRole("button", { name: /create group/i }).click();
    await expect(page.getByText(new RegExp(`Group "${NEW_GROUP}" created`))).toBeVisible();

    await page.getByRole("searchbox").fill(NEW_GROUP);
    await page.getByRole("cell", { name: new RegExp(NEW_GROUP) }).click();

    await page.getByLabel(/add a member/i).fill(USER);
    await page.getByRole("button", { name: /^add$/i }).click();
    await expect(page.getByRole("cell", { name: new RegExp(USER) })).toBeVisible();
  });

  test("grants and revokes a privilege", async ({ page }) => {
    await page.getByRole("button", { name: /privileges/i }).click();

    // A stock engine defines `access-rest-api`; skip rather than fail if a deployment
    // defines none, since privileges come from configuration, not from this UI.
    const privilege = page.locator(".tf-card").first();
    const hasPrivileges = await privilege.isVisible().catch(() => false);
    test.skip(!hasPrivileges, "This deployment defines no privileges.");

    await privilege.click();
    await page.getByLabel("Grant to user").fill(USER);
    await page.getByRole("button", { name: /^grant$/i }).click();
    await expect(page.getByText(new RegExp(`Granted to "${USER}"`))).toBeVisible();

    await page.getByRole("button", { name: new RegExp(`revoke from ${USER}`, "i") }).click();
    await page.getByRole("button", { name: /^revoke$/i }).click();
    await expect(page.getByText(/revoked from/i)).toBeVisible();
  });
});
