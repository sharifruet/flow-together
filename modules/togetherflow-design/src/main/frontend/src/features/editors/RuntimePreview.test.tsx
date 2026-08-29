/**
 * Starting a test instance from the modeller (W3.3).
 *
 * There is no sandbox in this distribution, so the thing worth pinning is that the dialog
 * says so, and that nothing starts without an explicit click.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError, ToastProvider, type ProcessApi } from "@togetherflow/common";
import { RuntimePreview } from "./RuntimePreview";

function renderPreview(overrides: Record<string, unknown> = {}) {
  const processApi = {
    start: vi.fn().mockResolvedValue({ id: "pi-9", activityId: "approveTask" }),
    ...overrides,
  } as unknown as ProcessApi & { start: ReturnType<typeof vi.fn> };
  const onClose = vi.fn();

  render(
    <ToastProvider>
      <RuntimePreview
        processApi={processApi}
        definitionKey="invoice"
        modelName="Invoice Approval"
        onClose={onClose}
      />
    </ToastProvider>,
  );
  return { processApi, onClose };
}

describe("RuntimePreview", () => {
  it("says this is real before offering the button", () => {
    renderPreview();
    expect(screen.getByText(/no sandbox in this distribution/i)).toBeInTheDocument();
  });

  it("starts nothing until asked", () => {
    const { processApi } = renderPreview();
    expect(processApi.start).not.toHaveBeenCalled();
  });

  it("starts the deployed definition and reports where it stopped", async () => {
    const { processApi } = renderPreview();

    await userEvent.type(screen.getByLabelText(/business key/i), "INV-1");
    await userEvent.click(screen.getByRole("button", { name: /start it/i }));

    await waitFor(() =>
      expect(processApi.start).toHaveBeenCalledWith({
        processDefinitionKey: "invoice",
        businessKey: "INV-1",
      }),
    );
    expect(await screen.findByText("pi-9")).toBeInTheDocument();
    expect(screen.getByText("approveTask")).toBeInTheDocument();
  });

  it("says so when the process ran straight through", async () => {
    // No activity means it finished rather than waiting, which is itself the answer.
    const { processApi } = renderPreview({
      start: vi.fn().mockResolvedValue({ id: "pi-10" }),
    });
    await userEvent.click(screen.getByRole("button", { name: /start it/i }));

    await waitFor(() => expect(processApi.start).toHaveBeenCalled());
    expect(await screen.findByText(/finished without waiting/i)).toBeInTheDocument();
  });

  it("omits an empty business key rather than sending a blank one", async () => {
    const { processApi } = renderPreview();
    await userEvent.click(screen.getByRole("button", { name: /start it/i }));

    await waitFor(() => expect(processApi.start).toHaveBeenCalled());
    expect(processApi.start.mock.calls[0][0].businessKey).toBeUndefined();
  });

  it("reports a refusal without claiming an instance exists", async () => {
    renderPreview({
      start: vi.fn().mockRejectedValue(new ApiError("no such definition", 404, "c-1", undefined)),
    });
    await userEvent.click(screen.getByRole("button", { name: /start it/i }));

    expect(await screen.findByText(/no such definition/i)).toBeInTheDocument();
    expect(screen.queryByText(/waiting at/i)).not.toBeInTheDocument();
  });
});
