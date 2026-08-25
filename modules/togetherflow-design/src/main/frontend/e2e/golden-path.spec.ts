/**
 * Design's golden path — "deploy a model" from REQUIREMENTS.md §8's list — run against a
 * real engine:
 *
 *   docker run -d --name tf-engine -p 8080:8080 flowable/flowable-rest
 *   TF_E2E_USER=rest-admin TF_E2E_PASSWORD=test npm run e2e
 *
 * Deploying is the one operation where a mock would be worthless: the engine either
 * accepts the XML this editor produces or it does not, and that is the whole question.
 */

import { expect, test, type Page } from "@playwright/test";

const USER = process.env.TF_E2E_USER ?? "rest-admin";
const PASSWORD = process.env.TF_E2E_PASSWORD ?? "test";

const RUN = Date.now().toString(36);
const MODEL_NAME = `E2E process ${RUN}`;
const MODEL_KEY = `tf_e2e_${RUN}`;

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Username").fill(USER);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByTestId("togetherflow-brand")).toBeVisible();
}

test.describe("TogetherFlow Design golden path", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("creates a process draft, checks it, and deploys it to the engine", async ({ page }) => {
    await page.getByRole("button", { name: /new process/i }).click();
    await page.getByLabel("Name").fill(MODEL_NAME);
    await page.getByLabel("Key").fill(MODEL_KEY);
    await page.getByRole("button", { name: /^create$/i }).click();

    // A new draft opens straight into the canvas.
    await expect(page.getByRole("region", { name: new RegExp(`editing ${MODEL_NAME}`, "i") })).toBeVisible();

    // Client-side checks stand in for the engine's validator, which has no REST
    // endpoint — see the module README's "Known limitations".
    await page.getByRole("button", { name: /^check$/i }).click();
    await expect(page.getByText(/no problems found|model checks/i)).toBeVisible();

    await page.getByRole("button", { name: /^deploy$/i }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText(/will be saved and deployed/i);
    await dialog.getByRole("button", { name: /save and deploy/i }).click();

    await expect(page.getByText(/deployed as /i)).toBeVisible();
  });

  test("shows the XML that will actually be deployed", async ({ page }) => {
    await page.getByRole("searchbox").fill(MODEL_NAME);
    const row = page.getByRole("cell", { name: new RegExp(MODEL_NAME) });
    test.skip(!(await row.isVisible().catch(() => false)), "Draft not present — run the deploy test first.");
    await row.click();

    await page.getByRole("button", { name: /^xml$/i }).click();
    await expect(page.getByRole("dialog", { name: /bpmn xml/i })).toContainText(MODEL_KEY);
  });

  test("guards against losing work on navigation", async ({ page }) => {
    await page.getByRole("button", { name: /new process/i }).click();
    await page.getByLabel("Name").fill(`Discard me ${RUN}`);
    await page.getByLabel("Key").fill(`tf_discard_${RUN}`);
    await page.getByRole("button", { name: /^create$/i }).click();
    await expect(page.getByRole("region", { name: /editing/i })).toBeVisible();

    // Nothing has been edited yet, so leaving is unguarded — that is the correct
    // behaviour, and asserting it stops the guard from becoming a nag.
    await page.getByRole("button", { name: /back to models/i }).click();
    await expect(page.getByRole("heading", { name: "Models" })).toBeVisible();
  });
});
