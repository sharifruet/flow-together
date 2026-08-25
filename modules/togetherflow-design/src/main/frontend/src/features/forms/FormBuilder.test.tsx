import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { ToastProvider, type ModelApi, type ModelResponse } from "@togetherflow/common";
import { FormBuilder } from "./FormBuilder";

const MODEL: ModelResponse = {
  id: "m1",
  name: "Expense claim",
  key: "expenseClaim",
  category: "togetherflow:form",
};

function stubApi(overrides: Record<string, unknown> = {}) {
  return {
    saveSource: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ModelApi & { saveSource: Mock };
}

function renderBuilder(api: ModelApi, source: string | null = null) {
  const onBack = vi.fn();
  render(
    <ToastProvider>
      <FormBuilder
        modelApi={api}
        model={MODEL}
        initialSource={source}
        onBack={onBack}
        onSaved={vi.fn()}
      />
    </ToastProvider>,
  );
  return { onBack };
}

describe("FormBuilder", () => {
  it("starts empty and says so rather than showing a blank canvas", () => {
    renderBuilder(stubApi());
    expect(screen.getByText(/No fields yet/)).toBeInTheDocument();
  });

  it("adds a field from the palette and selects it for editing", async () => {
    const user = userEvent.setup();
    renderBuilder(stubApi());

    await user.click(screen.getByRole("button", { name: "Text" }));

    expect(screen.getByRole("heading", { name: /Fields \(1\)/ })).toBeInTheDocument();
    // Selecting it opens the properties panel on that field.
    expect(screen.getByLabelText(/^Id/)).toHaveValue("text_1");
  });

  it("saves the Flowable SimpleFormModel shape the renderer consumes", async () => {
    const user = userEvent.setup();
    const api = stubApi();
    renderBuilder(api);

    await user.click(screen.getByRole("button", { name: "Dropdown" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.saveSource).toHaveBeenCalled());
    const saved = JSON.parse(api.saveSource.mock.calls.at(-1)![1] as string);
    expect(saved.key).toBe("expenseClaim");
    expect(saved.fields).toEqual([
      {
        id: "dropdown_1",
        name: "Dropdown",
        type: "dropdown",
        fieldType: "OptionFormField",
        options: [{ name: "Option 1" }],
      },
    ]);
  });

  it("hides placeholder and required for a field that carries no value", async () => {
    const user = userEvent.setup();
    renderBuilder(stubApi());

    await user.click(screen.getByRole("button", { name: "Text" }));
    expect(screen.getByLabelText(/Placeholder/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Divider" }));
    expect(screen.queryByLabelText(/Placeholder/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Required")).not.toBeInTheDocument();
  });

  it("reorders fields", async () => {
    const user = userEvent.setup();
    const api = stubApi();
    renderBuilder(api);

    await user.click(screen.getByRole("button", { name: "Text" }));
    await user.click(screen.getByRole("button", { name: "Date" }));
    await user.click(screen.getByRole("button", { name: "Move up" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.saveSource).toHaveBeenCalled());
    const saved = JSON.parse(api.saveSource.mock.calls.at(-1)![1] as string);
    expect(saved.fields.map((f: { id: string }) => f.id)).toEqual(["date_2", "text_1"]);
  });

  it("deletes a field and clears the properties panel", async () => {
    const user = userEvent.setup();
    renderBuilder(stubApi());

    await user.click(screen.getByRole("button", { name: "Text" }));
    await user.click(screen.getByRole("button", { name: "Delete field" }));

    expect(screen.getByText(/No fields yet/)).toBeInTheDocument();
    expect(screen.getByText(/Select a field to edit/)).toBeInTheDocument();
  });

  it("says forms deploy through an app, since there is no form REST endpoint", () => {
    renderBuilder(stubApi());
    expect(screen.getByRole("note")).toHaveTextContent(/deploy as part of an app/i);
    expect(screen.queryByRole("button", { name: /Deploy|Publish/ })).not.toBeInTheDocument();
  });

  it("reports a failed save instead of silently losing the edit", async () => {
    const user = userEvent.setup();
    const api = stubApi({ saveSource: vi.fn().mockRejectedValue(new Error("boom")) });
    renderBuilder(api);

    await user.click(screen.getByRole("button", { name: "Text" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Could not save this form.")).toBeInTheDocument();
  });

  it("warns before discarding unsaved changes", async () => {
    const user = userEvent.setup();
    const { onBack } = renderBuilder(stubApi());

    await user.click(screen.getByRole("button", { name: "Text" }));
    await user.click(screen.getByRole("button", { name: /Back to models/ }));

    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Leave without saving?");
    expect(onBack).not.toHaveBeenCalled();
  });

  it("leaves straight away when there is nothing to lose", async () => {
    const user = userEvent.setup();
    const { onBack } = renderBuilder(stubApi());

    await user.click(screen.getByRole("button", { name: /Back to models/ }));

    expect(onBack).toHaveBeenCalled();
  });
});
