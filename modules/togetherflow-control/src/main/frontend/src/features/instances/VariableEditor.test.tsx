/**
 * Editing a running instance's variables (W2.1).
 *
 * Two things here are load-bearing and easy to regress: writes go through the
 * single-variable resource (the collection PUT replaces the whole set), and the declared
 * type is what gets sent — sending a string where a `double` was stored silently changes
 * the variable's type and breaks the expressions reading it.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { ToastProvider, type InstanceApi, type RestVariable } from "@togetherflow/common";
import { VariableEditor } from "./VariableEditor";

const VARIABLES: RestVariable[] = [
  { name: "amount", type: "double", value: 4120 },
  { name: "approved", type: "boolean", value: false },
];

function renderEditor(overrides: Record<string, unknown> = {}, props: Record<string, unknown> = {}) {
  const instanceApi = {
    setVariable: vi.fn().mockResolvedValue({}),
    createVariable: vi.fn().mockResolvedValue([]),
    deleteVariable: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as InstanceApi & {
    setVariable: Mock;
    createVariable: Mock;
    deleteVariable: Mock;
  };

  render(
    <ToastProvider>
      <VariableEditor
        instanceApi={instanceApi}
        instanceId="pi-1"
        variables={VARIABLES}
        onChanged={vi.fn()}
        {...props}
      />
    </ToastProvider>,
  );
  return instanceApi;
}

async function openEditorFor(name: string) {
  // Row actions live in the overflow menu the rebuilt DataTable gives every row (C1).
  const row = screen.getByText(name).closest("tr") as HTMLElement;
  await userEvent.click(within(row).getByRole("button", { name: /actions for this row/i }));
  await userEvent.click(await screen.findByRole("menuitem", { name: /edit/i }));
}

describe("VariableEditor", () => {
  it("lists the instance's variables with their engine type", () => {
    renderEditor();
    const row = screen.getByText("amount").closest("tr") as HTMLElement;
    expect(within(row).getByText("double")).toBeInTheDocument();
  });

  it("writes one variable through the single-variable resource", async () => {
    // Never the collection PUT: it replaces the whole set, so editing one variable
    // through it would delete every other.
    const api = renderEditor();
    await openEditorFor("amount");

    const value = screen.getByLabelText(/value/i);
    await userEvent.clear(value);
    await userEvent.type(value, "5000");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(api.setVariable).toHaveBeenCalledWith("pi-1", {
        name: "amount",
        type: "double",
        value: 5000,
      }),
    );
    expect(api.createVariable).not.toHaveBeenCalled();
  });

  it("sends the declared type rather than whatever the text looked like", async () => {
    const api = renderEditor();
    await openEditorFor("approved");

    await userEvent.selectOptions(screen.getByLabelText(/^type/i), "string");
    const value = screen.getByLabelText(/value/i);
    await userEvent.clear(value);
    await userEvent.type(value, "true");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(api.setVariable).toHaveBeenCalledWith("pi-1", {
        name: "approved",
        type: "string",
        value: "true",
      }),
    );
  });

  it("refuses a value the declared type cannot hold", async () => {
    const api = renderEditor();
    await openEditorFor("amount");

    const value = screen.getByLabelText(/value/i);
    await userEvent.clear(value);
    await userEvent.type(value, "not a number");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText(/enter a number/i)).toBeInTheDocument();
    expect(api.setVariable).not.toHaveBeenCalled();
  });

  it("refuses to add a variable that already exists", async () => {
    // POST rejects a duplicate name server-side; saying so before the round trip is
    // the difference between a form error and an unexplained failure toast.
    const api = renderEditor();
    await userEvent.click(screen.getByRole("button", { name: /add variable/i }));

    await userEvent.type(screen.getByLabelText(/^name/i), "amount");
    await userEvent.type(screen.getByLabelText(/value/i), "1");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
    expect(api.createVariable).not.toHaveBeenCalled();
  });

  it("hides every mutating control in read-only mode", () => {
    // Control degrades to a viewer for non-admins (§13.1); the server still decides.
    renderEditor({}, { readOnly: true });

    expect(screen.queryByRole("button", { name: /add variable/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /actions for this row/i }),
    ).not.toBeInTheDocument();
  });
});
