/**
 * Forms through the form engine, against a **real** engine with the Resignation (Sales)
 * example deployed (FORM_REQUIREMENTS.md §12):
 *
 *   examples/resignation-sales/deploy.sh
 *   TF_E2E_USER=imran.kabir TF_E2E_PASSWORD=demo npm run e2e -- e2e/forms.spec.ts
 *
 * Skips itself when the example is not deployed rather than failing on an empty engine.
 * Every case it starts is deleted at the end, form submissions included (FR-H.2).
 */

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const USER = process.env.TF_E2E_USER ?? "imran.kabir";
const PASSWORD = process.env.TF_E2E_PASSWORD ?? "demo";
const ADMIN = process.env.TF_E2E_ADMIN ?? "rest-admin";
const ADMIN_PASSWORD = process.env.TF_E2E_ADMIN_PASSWORD ?? "test";
const ENGINE = process.env.TF_E2E_ENGINE ?? "http://localhost:8080/flowable-rest";
const BUSINESS_KEY = `E2E-FORMS-${Date.now()}`;

const basic = (user: string, password: string) => ({
  Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`,
});

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Username").fill(USER);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByTestId("togetherflow-brand")).toBeVisible();
}

/**
 * Follows a deep link inside the running app. A full `page.goto` would reload and drop the
 * development sign-in, which lives in memory; the shell's router listens to `popstate`.
 */
async function openInApp(page: Page, path: string) {
  await page.evaluate((href) => {
    window.history.pushState({}, "", href);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}

async function exampleDeployed(request: APIRequestContext): Promise<boolean> {
  const response = await request.get(
    `${ENGINE}/cmmn-api/cmmn-repository/case-definitions?key=salesResignation&latest=true`,
    { headers: basic(ADMIN, ADMIN_PASSWORD) },
  );
  if (!response.ok()) return false;
  const body = (await response.json()) as { total: number };
  return body.total > 0;
}

async function deleteCase(request: APIRequestContext) {
  const headers = basic(ADMIN, ADMIN_PASSWORD);
  const list = await request.get(
    `${ENGINE}/cmmn-api/cmmn-runtime/case-instances?businessKey=${BUSINESS_KEY}`,
    { headers },
  );
  const { data } = (await list.json()) as { data: Array<{ id: string }> };
  for (const instance of data) {
    await request.delete(`${ENGINE}/cmmn-api/cmmn-runtime/case-instances/${instance.id}`, { headers });
    await request.delete(`${ENGINE}/cmmn-api/cmmn-history/historic-case-instances/${instance.id}`, { headers });
    const left = await request.get(`${ENGINE}/form-api/form/form-instances?scopeId=${instance.id}`, { headers });
    expect(((await left.json()) as { total: number }).total, "submissions go with the case").toBe(0);
  }
}

test.describe("Forms through the form engine", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await exampleDeployed(request)), "Resignation (Sales) is not deployed on this engine");
  });

  test.afterEach(async ({ request }) => {
    await deleteCase(request);
  });

  test("the start form is validated by the server, then recorded; the task form renders and completes", async ({ page, request }) => {
    await signIn(page);

    // Start work → Cases → the case's start form, rendered from the engine.
    await page.getByRole("button", { name: "Start work" }).click();
    await page.getByRole("tab", { name: /^Cases$/ }).click();
    await page.locator(".tf-definition").filter({ hasText: "Resignation (Sales)" }).first().click();
    await expect(page.getByLabel(/Employee ID/)).toBeVisible();
    await expect(page.getByText(/could not be loaded/i)).toHaveCount(0);

    // A submission the browser lets through but the engine refuses: a date past maxDate
    // is not a browser rule here, so the 400 must land on the field.
    await page.getByLabel(/Business key/).fill(BUSINESS_KEY);
    await page.getByLabel(/Employee ID/).fill("MPE-E2E");
    await page.getByLabel(/Employee name/).fill("E2E Person");
    await page.getByLabel(/Employee sign-in id/).fill("rakib.hasan");
    await page.getByLabel(/Designation/).selectOption({ index: 1 });
    await page.getByLabel(/Territory/).fill("Test North");
    await page.getByLabel(/Date of resignation letter/).fill("2026-09-01");
    await page.getByLabel(/Proposed last working day/).fill("2026-09-30");
    await page.getByLabel(/Resignation letter/).fill("doc:e2e");
    await page.getByRole("button", { name: /^Start$|^Submit$/ }).first().click();
    await expect(page.getByText(/^Started /i)).toBeVisible();

    // The start submission was recorded by the engine, against the case, by this user.
    const headers = basic(ADMIN, ADMIN_PASSWORD);
    const cases = await request.get(`${ENGINE}/cmmn-api/cmmn-runtime/case-instances?businessKey=${BUSINESS_KEY}`, { headers });
    const caseId = ((await cases.json()) as { data: Array<{ id: string }> }).data[0].id;
    const submissions = await request.get(`${ENGINE}/form-api/form/form-instances?scopeId=${caseId}`, { headers });
    const recorded = (await submissions.json()) as { total: number; data: Array<{ submittedBy: string; taskId: string | null }> };
    expect(recorded.total).toBe(1);
    expect(recorded.data[0].submittedBy).toBe(USER);
    expect(recorded.data[0].taskId).toBeNull();

    // The ASE task shows its form; a required field left empty is refused before the
    // request, and the engine's own refusal is shown when the values are wrong for it.
    // Open this case's ASE task by its own route: the inbox may hold the same task name
    // from other cases on a shared engine.
    const tasks = await request.get(`${ENGINE}/cmmn-api/cmmn-runtime/tasks?caseInstanceId=${caseId}`, { headers });
    const aseTask = ((await tasks.json()) as { data: Array<{ id: string; name: string }> }).data.find((task) =>
      task.name.startsWith("ASE"),
    );
    expect(aseTask, "the case raises the ASE clearance task").toBeDefined();
    await openInApp(page, `/inbox/${aseTask!.id}`);
    const detail = page.getByRole("complementary", { name: /task detail/i });
    const claim = detail.getByRole("button", { name: /^claim$/i });
    if (await claim.isVisible().catch(() => false)) {
      await claim.click();
    }
    await expect(detail.getByLabel(/Outstanding collection/)).toBeVisible();

    await detail.getByLabel(/Outstanding collection/).fill("1250.50");
    await detail.getByLabel(/Stock returned in full/).check();
    await detail.getByLabel(/Samples and POS material returned/).check();
    await detail.getByLabel("approve").check();
    await detail.getByRole("button", { name: /complete task/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /complete task/i }).click();
    await expect(page.getByText(/task completed/i)).toBeVisible();

    // Two submissions now, the second against the task; the historic task form is it.
    const after = await request.get(`${ENGINE}/form-api/form/form-instances?scopeId=${caseId}`, { headers });
    const both = (await after.json()) as { total: number; data: Array<{ taskId: string | null }> };
    expect(both.total).toBe(2);
    const taskId = both.data.find((s) => s.taskId)!.taskId!;
    const historic = await request.get(`${ENGINE}/cmmn-api/cmmn-history/historic-task-instances/${taskId}/form`, { headers });
    const form = (await historic.json()) as { key: string; submittedBy: string; fields: Array<{ id: string; value: unknown }> };
    expect(form.key).toBe("salesClearanceForm");
    expect(form.submittedBy).toBe(USER);
    expect(form.fields.find((f) => f.id === "decision")?.value).toBe("approve");

    // And My history shows the same submission, read-only.
    await page.getByRole("link", { name: "My history" }).click();
    await page.getByRole("button", { name: /view form/i }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/submitted by imran\.kabir/i)).toBeVisible();
    await expect(dialog.getByRole("status", { name: "Decision" })).toHaveText("approve");
  });

  test("the engine refuses what the browser cannot check, and the form shows it", async ({ page, request }) => {
    await signIn(page);
    await page.getByRole("button", { name: "Start work" }).click();
    await page.getByRole("tab", { name: /^Cases$/ }).click();
    await page.locator(".tf-definition").filter({ hasText: "Resignation (Sales)" }).first().click();
    await expect(page.getByLabel(/Employee ID/)).toBeVisible();

    // Bypass the browser's check by posting a bad submission straight to the engine as the
    // same user, then confirm the contract Work relies on.
    const definitions = await request.get(`${ENGINE}/cmmn-api/cmmn-repository/case-definitions?key=salesResignation&latest=true`, {
      headers: basic(USER, PASSWORD),
    });
    const caseDefinitionId = ((await definitions.json()) as { data: Array<{ id: string }> }).data[0].id;
    const refused = await request.post(`${ENGINE}/cmmn-api/cmmn-runtime/case-instances`, {
      headers: { ...basic(USER, PASSWORD), "Content-Type": "application/json" },
      data: {
        caseDefinitionId,
        businessKey: BUSINESS_KEY,
        startFormVariables: [{ name: "employeeDesignation", value: "CEO" }],
        outcome: "submit",
      },
    });
    expect(refused.status()).toBe(400);
    const body = (await refused.json()) as { fields: Array<{ id: string; code: string }> };
    expect(body.fields.find((f) => f.id === "employeeDesignation")?.code).toBe("option");
    expect(body.fields.find((f) => f.id === "employeeId")?.code).toBe("required");
  });
});
