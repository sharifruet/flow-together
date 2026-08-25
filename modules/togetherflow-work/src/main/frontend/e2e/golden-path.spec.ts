/**
 * Phase 1 golden path, run against a **real** Flowable engine (REQUIREMENTS.md §8).
 *
 *   docker run -d --name tf-engine -p 8080:8080 flowable/flowable-rest
 *   TF_E2E_USER=rest-admin TF_E2E_PASSWORD=test npm run e2e
 *
 * Notes learned by actually running this:
 *
 * - The stock image serves under context path `/flowable-rest` and mounts the BPMN
 *   servlet at `/service`; the dev proxy rewrites, so the app's own paths are unchanged.
 * - Default credentials are `rest-admin` / `test`.
 * - The image ships demo processes, and some of them (`createTimersProcess`) throw
 *   unless given variables. The suite therefore starts a process it picks **by name**
 *   rather than whichever happens to be first in the list.
 */

import { expect, test, type Page } from "@playwright/test";

const USER = process.env.TF_E2E_USER ?? "rest-admin";
const PASSWORD = process.env.TF_E2E_PASSWORD ?? "test";

/** A demo process that starts cleanly with no variables and creates one user task. */
const STARTABLE_PROCESS = /Famous One Task Process|One Task Process/i;

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Username").fill(USER);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByTestId("togetherflow-brand")).toBeVisible();
}

/** Starts a known-good process so the inbox is non-empty, and returns its name. */
async function startWork(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Start work" }).click();
  const definition = page.locator(".tf-definition").filter({ hasText: STARTABLE_PROCESS }).first();
  await expect(definition).toBeVisible();
  const name = (await definition.locator(".tf-definition__name").textContent()) ?? "";
  await definition.click();
  await page.getByRole("button", { name: /^Start$/ }).click();
  await expect(page.getByText(/^Started /i)).toBeVisible();
  return name;
}

test.describe("TogetherFlow Work golden path", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("signs in and shows the shell branded as TogetherFlow", async ({ page }) => {
    await expect(page).toHaveTitle(/TogetherFlow/);
    // Scoped to the shell's own header: the inbox panel has a header of its own.
    await expect(page.locator(".tf-shell__header")).not.toContainText(/flowable/i);
    await expect(page.locator(".tf-shell__header")).toContainText("TogetherFlow");
  });

  test("starts a process and completes the task it creates", async ({ page }) => {
    await startWork(page);

    // Back on the inbox, claim if needed and complete.
    const firstTask = page.locator("tbody tr").first();
    await expect(firstTask).toBeVisible();
    await firstTask.click();

    const detail = page.getByRole("complementary", { name: /task detail/i });
    const claim = detail.getByRole("button", { name: /^claim$/i });
    if (await claim.isVisible().catch(() => false)) {
      await claim.click();
    }

    await detail.getByRole("button", { name: /complete task/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /complete task/i }).click();
    await expect(page.getByText(/task completed/i)).toBeVisible();
  });

  test("shows my completed work in history", async ({ page }) => {
    await page.getByRole("button", { name: "My history" }).click();

    // Either populated or a proper empty state — never a blank screen.
    const rows = page.locator(".tf-history tbody tr").first();
    const empty = page.getByText(/nothing completed yet/i);
    await expect(rows.or(empty)).toBeVisible();

    await page.getByRole("tab", { name: /process instances/i }).click();
    const instances = page.locator(".tf-history tbody tr").first();
    const noInstances = page.getByText(/no process instances yet/i);
    await expect(instances.or(noInstances)).toBeVisible();
  });

  test("attaches a link to a task", async ({ page }) => {
    // Self-provisioning: this test must not depend on another having run first.
    await startWork(page);

    const firstTask = page.locator("tbody tr").first();
    await expect(firstTask).toBeVisible();
    await firstTask.click();

    const detail = page.getByRole("complementary", { name: /task detail/i });
    const claim = detail.getByRole("button", { name: /^claim$/i });
    if (await claim.isVisible().catch(() => false)) await claim.click();

    await detail.getByRole("button", { name: /add link/i }).click();
    await detail.getByLabel(/link name/i).fill("Reference doc");
    await detail.getByLabel(/^URL/i).fill("https://example.com/reference");
    await detail.getByRole("button", { name: /^Add link$/i }).click();

    await expect(page.getByText(/"Reference doc" linked/i)).toBeVisible();
    await expect(detail.getByRole("link", { name: "Reference doc" })).toBeVisible();
  });

  test("supports keyboard-only triage", async ({ page }) => {
    // The shortcut is ignored while a field has focus, so start from the document.
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("/");
    await expect(page.locator("#tf-task-search")).toBeFocused();

    await page.locator("#tf-task-search").blur();
    // `g` cycles Tasks → Cases → Start work → My history.
    await page.keyboard.press("g");
    await expect(page.getByRole("tab", { name: "Open" })).toBeVisible();
    await page.keyboard.press("g");
    await expect(page.getByRole("heading", { name: "Start work" })).toBeVisible();
    await page.keyboard.press("g");
    await expect(page.getByRole("heading", { name: "My history" })).toBeVisible();
  });

  test("moves through the inbox and claims a task from the keyboard", async ({ page }) => {
    await startWork(page);
    await page.getByRole("button", { name: "Tasks" }).click();
    await page.getByRole("tab", { name: /available to claim/i }).click();

    const firstRow = page.locator("table tbody tr").first();
    const hasClaimable = await firstRow.isVisible().catch(() => false);
    test.skip(!hasClaimable, "Nothing claimable on this engine.");

    await page.locator("body").click({ position: { x: 5, y: 5 } });
    // `j` opens the first row when nothing is selected yet (§14.4).
    await page.keyboard.press("j");
    const detail = page.getByRole("complementary", { name: /task detail/i });
    await expect(detail).toBeVisible();

    await page.keyboard.press("c");
    await expect(page.getByText(/task claimed/i)).toBeVisible();
  });

  test("lists its own shortcuts, so they are discoverable", async ({ page }) => {
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("?");

    const dialog = page.getByRole("dialog", { name: /keyboard shortcuts/i });
    await expect(dialog).toBeVisible();
    // Generated from the bindings themselves, so this also proves they are registered.
    await expect(dialog).toContainText(/next task in the list/i);
    await expect(dialog).toContainText(/search tasks/i);

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });
});
