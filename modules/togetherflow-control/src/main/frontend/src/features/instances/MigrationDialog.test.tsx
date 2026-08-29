/**
 * Migration (W2.1). The dangerous state here is a *stale verdict*: validating one plan,
 * changing it, and migrating on the strength of the old answer. These pin that it cannot
 * happen, plus the validate-then-migrate ordering the whole dialog exists to enforce.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import {
  ApiError,
  ToastProvider,
  type ActivityInstanceResponse,
  type InstanceApi,
  type ProcessInstanceResponse,
  type RepositoryApi,
} from "@togetherflow/common";
import { MigrationDialog } from "./MigrationDialog";

const INSTANCE: ProcessInstanceResponse = {
  id: "pi-1",
  name: "Invoice INV-2291",
  suspended: false,
  ended: false,
  completed: false,
  processDefinitionId: "invoice:1:aaa",
};

const ACTIVITIES: ActivityInstanceResponse[] = [
  { id: "ai-1", activityId: "approveTask", activityName: "Approve", processInstanceId: "pi-1" },
  // Finished: must not be offered for mapping.
  {
    id: "ai-0",
    activityId: "startEvent",
    activityName: "Start",
    processInstanceId: "pi-1",
    endTime: "2026-08-20T09:00:01Z",
  },
];

type Stub = InstanceApi & { validateMigration: Mock; migrate: Mock };

function stubs(overrides: Record<string, unknown> = {}) {
  const instanceApi = {
    validateMigration: vi.fn().mockResolvedValue({ migrationValid: true, validationMessages: [] }),
    migrate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as Stub;

  const repositoryApi = {
    getProcessDefinition: vi.fn().mockResolvedValue({ id: "invoice:1:aaa", key: "invoice", version: 1 }),
    listProcessDefinitions: vi.fn().mockResolvedValue({
      data: [
        { id: "invoice:2:bbb", key: "invoice", name: "Invoice Approval", version: 2 },
        { id: "invoice:3:ccc", key: "invoice", name: "Invoice Approval", version: 3 },
      ],
      total: 2,
      start: 0,
      size: 100,
    }),
    listActivityIdsFor: vi.fn().mockResolvedValue([
      { id: "approveTask", name: "Approve" },
      { id: "reviewTask", name: "Review" },
    ]),
  } as unknown as RepositoryApi;

  return { instanceApi, repositoryApi };
}

function renderDialog(api: ReturnType<typeof stubs>, onMigrated = vi.fn()) {
  render(
    <ToastProvider>
      <MigrationDialog
        instanceApi={api.instanceApi}
        repositoryApi={api.repositoryApi}
        instance={INSTANCE}
        activities={ACTIVITIES}
        onClose={vi.fn()}
        onMigrated={onMigrated}
      />
    </ToastProvider>,
  );
  return onMigrated;
}

async function chooseTarget(version = /version 2/i) {
  const select = await screen.findByLabelText(/target version/i);
  await userEvent.selectOptions(select, screen.getByRole("option", { name: version }));
}

describe("MigrationDialog", () => {
  it("offers only other versions of the same definition", async () => {
    renderDialog(stubs());
    await screen.findByLabelText(/target version/i);

    // The instance's own definition is not a migration target.
    expect(screen.queryByRole("option", { name: /version 1/i })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /version 2/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /version 3/i })).toBeInTheDocument();
  });

  it("does not offer a finished activity for mapping", async () => {
    renderDialog(stubs());
    await chooseTarget();

    // A completed activity is history; the engine does not move it. Matched on the
    // activity id, which the row prints once, rather than the name the hidden select
    // label repeats.
    expect(await screen.findByText("approveTask")).toBeInTheDocument();
    expect(screen.queryByText("startEvent")).not.toBeInTheDocument();
  });

  it("will not migrate before the plan has been validated", async () => {
    const onMigrated = renderDialog(stubs());
    await chooseTarget();

    expect(screen.getByRole("button", { name: /^migrate/i })).toBeDisabled();
    expect(onMigrated).not.toHaveBeenCalled();
  });

  it("migrates once the engine says the plan is valid", async () => {
    const api = stubs();
    const onMigrated = renderDialog(api);
    await chooseTarget();

    await userEvent.click(screen.getByRole("button", { name: /validate/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^migrate/i })).toBeEnabled());

    await userEvent.click(screen.getByRole("button", { name: /^migrate/i }));
    await waitFor(() =>
      expect(api.instanceApi.migrate).toHaveBeenCalledWith("pi-1", {
        toProcessDefinitionId: "invoice:2:bbb",
      }),
    );
    expect(onMigrated).toHaveBeenCalled();
  });

  it("discards the verdict when the target changes", async () => {
    // The dangerous state: validated against version 2, migrated into version 3.
    renderDialog(stubs());
    await chooseTarget();
    await userEvent.click(screen.getByRole("button", { name: /validate/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^migrate/i })).toBeEnabled());

    await chooseTarget(/version 3/i);

    expect(screen.getByRole("button", { name: /^migrate/i })).toBeDisabled();
  });

  it("discards the verdict when a mapping changes", async () => {
    renderDialog(stubs());
    await chooseTarget();
    await userEvent.click(screen.getByRole("button", { name: /validate/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^migrate/i })).toBeEnabled());

    await userEvent.selectOptions(await screen.findByLabelText(/Approve/), "reviewTask");

    expect(screen.getByRole("button", { name: /^migrate/i })).toBeDisabled();
  });

  it("treats a failed validation call as an invalid plan, not as a passing one", async () => {
    const api = stubs({
      // An ApiError, because that is what the client raises — a bare Error deliberately
      // falls back to generic copy rather than leaking an internal message.
      validateMigration: vi.fn().mockRejectedValue(
        new ApiError("engine down", 502, "c-1", undefined),
      ),
    });
    renderDialog(api);
    await chooseTarget();

    await userEvent.click(screen.getByRole("button", { name: /validate/i }));

    expect(await screen.findByText(/engine down/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^migrate/i })).toBeDisabled();
  });

  it("blocks migration when the engine reports problems", async () => {
    const api = stubs({
      validateMigration: vi.fn().mockResolvedValue({
        migrationValid: false,
        validationMessages: ["Activity 'approveTask' does not exist in the target"],
      }),
    });
    renderDialog(api);
    await chooseTarget();

    await userEvent.click(screen.getByRole("button", { name: /validate/i }));

    expect(await screen.findByText(/does not exist in the target/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^migrate/i })).toBeDisabled();
  });
});
