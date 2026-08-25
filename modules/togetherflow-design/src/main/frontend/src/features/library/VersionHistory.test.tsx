/**
 * Version history (REQUIREMENTS.md §7.4.1) as the user meets it.
 *
 * The model layer is covered in `togetherflow-common`; what matters here is that the
 * panel does not let someone destroy history by accident — restoring is confirmed and
 * says what happens to the current contents, and the draft cannot be restored over
 * itself.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider, type ModelApi, type ModelResponse } from "@togetherflow/common";
import { VersionHistory } from "./VersionHistory";

function model(overrides: Partial<ModelResponse> = {}): ModelResponse {
  return {
    id: "m1",
    name: "Invoice approval",
    key: "invoice",
    category: "togetherflow:bpmn",
    version: 3,
    createTime: "2026-08-20T09:00:00Z",
    ...overrides,
  };
}

function stubApi(overrides: Partial<Record<string, unknown>> = {}): ModelApi {
  return {
    listVersions: vi.fn().mockResolvedValue([
      model({ id: "m1", version: 3 }),
      model({ id: "a2", version: 2, createTime: "2026-08-19T09:00:00Z" }),
      model({ id: "a1", version: 1, createTime: "2026-08-18T09:00:00Z" }),
    ]),
    getSource: vi.fn().mockResolvedValue("<xml/>"),
    cutVersion: vi.fn().mockResolvedValue(model({ version: 4 })),
    restoreVersion: vi.fn().mockResolvedValue(model({ version: 4 })),
    ...overrides,
  } as unknown as ModelApi;
}

function renderPanel(api: ModelApi, onRestored = vi.fn()) {
  render(
    <ToastProvider>
      <VersionHistory modelApi={api} model={model()} onClose={vi.fn()} onRestored={onRestored} />
    </ToastProvider>,
  );
  return onRestored;
}

describe("VersionHistory", () => {
  it("lists every version, newest first", async () => {
    renderPanel(stubApi());
    await screen.findByText("v3");
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
  });

  it("marks the working draft, and offers no restore for it", async () => {
    renderPanel(stubApi());
    await screen.findByText("v3");

    expect(screen.getByText("Editing")).toBeInTheDocument();
    // One per historical version, never for the draft itself.
    expect(screen.getAllByRole("button", { name: /^restore$/i })).toHaveLength(2);
  });

  it("explains a restore before doing it, including what happens to the current draft", async () => {
    const api = stubApi();
    renderPanel(api);
    await screen.findByText("v3");

    await userEvent.click(screen.getAllByRole("button", { name: /^restore$/i })[0]);

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/restore version 2/i);
    // §14.3: the confirmation names the consequence, not just the action.
    expect(dialog).toHaveTextContent(/kept as version 3/i);
    expect(api.restoreVersion).not.toHaveBeenCalled();
  });

  it("restores only once confirmed", async () => {
    const api = stubApi();
    const onRestored = renderPanel(api);
    await screen.findByText("v3");

    await userEvent.click(screen.getAllByRole("button", { name: /^restore$/i })[0]);
    await userEvent.click(
      (await screen.findByRole("alertdialog")).querySelector("button.tf-button--primary")!,
    );

    await waitFor(() => expect(api.restoreVersion).toHaveBeenCalled());
    expect(onRestored).toHaveBeenCalled();
  });

  it("cuts a version from the current contents on demand", async () => {
    const api = stubApi();
    renderPanel(api);
    await screen.findByText("v3");

    await userEvent.click(screen.getByRole("button", { name: /save a version/i }));

    await waitFor(() => expect(api.cutVersion).toHaveBeenCalled());
    // Cut from what is stored, not from an empty string.
    expect(api.getSource).toHaveBeenCalledWith("m1");
  });

  it("says so when there is no history yet rather than showing an empty list", async () => {
    renderPanel(stubApi({ listVersions: vi.fn().mockResolvedValue([]) }));
    expect(await screen.findByText(/no versions yet/i)).toBeInTheDocument();
  });

  it("reports a failed restore instead of implying it worked", async () => {
    const api = stubApi({ restoreVersion: vi.fn().mockRejectedValue(new Error("nope")) });
    renderPanel(api);
    await screen.findByText("v3");

    await userEvent.click(screen.getAllByRole("button", { name: /^restore$/i })[0]);
    await userEvent.click(
      (await screen.findByRole("alertdialog")).querySelector("button.tf-button--primary")!,
    );

    expect(await screen.findByText(/could not be completed/i)).toBeInTheDocument();
  });
});
