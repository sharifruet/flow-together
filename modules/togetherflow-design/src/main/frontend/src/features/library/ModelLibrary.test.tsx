import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import {
  RouterProvider,
  ToastProvider,
  type ModelApi,
  type ModelResponse,
} from "@togetherflow/common";
import { ModelLibrary, slugify } from "./ModelLibrary";

function page(rows: ModelResponse[], total = rows.length) {
  return { data: rows, total, start: 0, size: 25 };
}

type StubApi = ModelApi & {
  list: Mock;
  create: Mock;
  delete: Mock;
  getSource: Mock;
  saveSource: Mock;
};

const PROCESS: ModelResponse = {
  id: "m1",
  name: "Invoice approval",
  key: "invoiceApproval",
  category: "togetherflow:bpmn",
  lastUpdateTime: "2026-08-20T10:00:00Z",
};

const DECISION: ModelResponse = {
  id: "m2",
  name: "Discount rules",
  key: "discountRules",
  category: "togetherflow:dmn",
  lastUpdateTime: "2026-08-21T10:00:00Z",
};

function stubApi(overrides: Record<string, unknown> = {}): StubApi {
  return {
    list: vi.fn().mockResolvedValue(page([PROCESS, DECISION])),
    create: vi.fn().mockResolvedValue({ id: "new", name: "New", key: "new" }),
    delete: vi.fn().mockResolvedValue(undefined),
    getSource: vi.fn().mockResolvedValue("<xml/>"),
    saveSource: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as StubApi;
}

/** The library's search and page live in the URL since W1.3. */
function renderLibrary(api: ModelApi, onOpen = vi.fn()) {
  window.history.replaceState({}, "", "/models");
  render(
    <RouterProvider>
      <ToastProvider>
        <ModelLibrary modelApi={api} onOpen={onOpen} refreshToken={0} />
      </ToastProvider>
    </RouterProvider>,
  );
  return { onOpen };
}

describe("slugify", () => {
  it("makes a value usable as an XML id", () => {
    expect(slugify("Invoice Approval")).toBe("Invoice_Approval");
    expect(slugify("order-to cash!")).toBe("order_to_cash");
    // An XML id may not start with a digit.
    expect(slugify("2026 review")).toBe("_2026_review");
    expect(slugify("   ")).toBe("");
  });
});

describe("ModelLibrary", () => {
  it("lists models and labels their language", async () => {
    renderLibrary(stubApi());
    expect(await screen.findByText("Invoice approval")).toBeInTheDocument();
    expect(screen.getByText("BPMN")).toBeInTheDocument();
    expect(screen.getByText("DMN")).toBeInTheDocument();
  });

  it("shows a guiding empty state", async () => {
    renderLibrary(stubApi({ list: vi.fn().mockResolvedValue(page([])) }));
    expect(await screen.findByText(/no models yet/i)).toBeInTheDocument();
  });

  it("creates a process model with seeded source and opens it", async () => {
    const api = stubApi({ list: vi.fn().mockResolvedValue(page([])) });
    const { onOpen } = renderLibrary(api);
    await screen.findByText(/no models yet/i);

    await userEvent.click(screen.getAllByRole("button", { name: /new process/i })[0]);
    const dialog = await screen.findByRole("dialog", { name: /new process/i });
    await userEvent.type(within(dialog).getByLabelText(/^name/i), "Order to cash");
    await userEvent.click(within(dialog).getByRole("button", { name: /create and open/i }));

    await waitFor(() => expect(api.create).toHaveBeenCalled());
    expect(api.create.mock.calls[0][0]).toMatchObject({
      name: "Order to cash",
      category: "togetherflow:bpmn",
    });
    // A new model must arrive with valid starting XML, or the editor opens empty.
    const [, xml] = api.saveSource.mock.calls[0];
    expect(xml).toContain("<bpmn:process");
    expect(xml).toContain('xmlns:flowable="http://flowable.org/bpmn"');
    expect(onOpen).toHaveBeenCalled();
  });

  it("derives the key from the name until the key is edited by hand", async () => {
    const api = stubApi({ list: vi.fn().mockResolvedValue(page([])) });
    renderLibrary(api);
    await screen.findByText(/no models yet/i);

    await userEvent.click(screen.getAllByRole("button", { name: /new process/i })[0]);
    const dialog = await screen.findByRole("dialog", { name: /new process/i });
    await userEvent.type(within(dialog).getByLabelText(/^name/i), "Order to cash");

    expect(within(dialog).getByLabelText(/^key/i)).toHaveValue("Order_to_cash");

    await userEvent.clear(within(dialog).getByLabelText(/^key/i));
    await userEvent.type(within(dialog).getByLabelText(/^key/i), "custom");
    await userEvent.type(within(dialog).getByLabelText(/^name/i), " extra");

    expect(within(dialog).getByLabelText(/^key/i)).toHaveValue("custom");
  });

  it("rejects a key that would be invalid as an XML id", async () => {
    const api = stubApi({ list: vi.fn().mockResolvedValue(page([])) });
    renderLibrary(api);
    await screen.findByText(/no models yet/i);

    await userEvent.click(screen.getAllByRole("button", { name: /new process/i })[0]);
    const dialog = await screen.findByRole("dialog", { name: /new process/i });
    await userEvent.type(within(dialog).getByLabelText(/^name/i), "X");
    await userEvent.clear(within(dialog).getByLabelText(/^key/i));
    await userEvent.type(within(dialog).getByLabelText(/^key/i), "9bad key");
    await userEvent.click(within(dialog).getByRole("button", { name: /create and open/i }));

    expect(await within(dialog).findByText(/start with a letter/i)).toBeInTheDocument();
    expect(api.create).not.toHaveBeenCalled();
  });

  it("creates a decision model with DMN starting XML", async () => {
    const api = stubApi({ list: vi.fn().mockResolvedValue(page([])) });
    renderLibrary(api);
    await screen.findByText(/no models yet/i);

    await userEvent.click(screen.getByRole("button", { name: /new decision/i }));
    const dialog = await screen.findByRole("dialog", { name: /new decision/i });
    await userEvent.type(within(dialog).getByLabelText(/^name/i), "Discounts");
    await userEvent.click(within(dialog).getByRole("button", { name: /create and open/i }));

    await waitFor(() => expect(api.create).toHaveBeenCalled());
    expect(api.create.mock.calls[0][0]).toMatchObject({ category: "togetherflow:dmn" });
    expect(api.saveSource.mock.calls[0][1]).toContain("<decisionTable");
  });

  it("duplicates a model by copying its source", async () => {
    const api = stubApi();
    const { onOpen } = renderLibrary(api);
    await screen.findByText("Invoice approval");

    await userEvent.click(screen.getAllByRole("button", { name: /duplicate/i })[0]);

    await waitFor(() => expect(api.create).toHaveBeenCalled());
    expect(api.getSource).toHaveBeenCalledWith("m1");
    expect(api.saveSource).toHaveBeenCalledWith("new", "<xml/>");
    expect(onOpen).toHaveBeenCalled();
  });

  it("refuses to duplicate a model with no saved content", async () => {
    const api = stubApi({ getSource: vi.fn().mockResolvedValue(null) });
    renderLibrary(api);
    await screen.findByText("Invoice approval");

    await userEvent.click(screen.getAllByRole("button", { name: /duplicate/i })[0]);

    expect(await screen.findByText(/no saved content to copy/i)).toBeInTheDocument();
    expect(api.create).not.toHaveBeenCalled();
  });

  it("confirms before deleting and clarifies deployed versions keep running", async () => {
    const api = stubApi();
    renderLibrary(api);
    await screen.findByText("Invoice approval");

    await userEvent.click(screen.getAllByRole("button", { name: /^delete$/i })[0]);
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/keeps running/i);
    expect(api.delete).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: /delete model/i }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("m1"));
  });
});
