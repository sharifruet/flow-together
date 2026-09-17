import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { RouterProvider, ToastProvider, matchPath, useLocation, useNavigate, type FormApi } from "@togetherflow/common";
import { Forms } from "./Forms";

function page<T>(rows: T[]) {
  return { data: rows, total: rows.length, start: 0, size: 25 };
}

const DEFINITION = { id: "def-1", key: "salesClearanceForm", name: "Sales clearance", version: 3, deploymentId: "dep-1" };
const MODEL = {
  id: "def-1",
  key: "salesClearanceForm",
  name: "Sales clearance",
  fields: [{ id: "outstandingCollection", name: "Outstanding collection", type: "amount", required: true }],
};

function stubApi(overrides: Record<string, unknown> = {}) {
  return {
    listDefinitions: vi.fn().mockResolvedValue(page([DEFINITION])),
    getDefinition: vi.fn().mockResolvedValue(DEFINITION),
    getDefinitionModel: vi.fn().mockResolvedValue(MODEL),
    definitionResourceUrl: (id: string) => `/form-api/form-repository/form-definitions/${id}/resourcedata`,
    listDeployments: vi.fn().mockResolvedValue(page([{ id: "dep-1", name: "resignation-forms", deploymentTime: "2026-09-16T11:00:00Z" }])),
    deleteDeployment: vi.fn().mockResolvedValue(undefined),
    deploy: vi.fn().mockResolvedValue({ id: "dep-2" }),
    listInstances: vi.fn().mockResolvedValue(
      page([{ id: "fi-1", formDefinitionId: "def-1", taskId: "t-1", submittedBy: "imran.kabir", submittedDate: "2026-09-16T11:13:08Z" }]),
    ),
    getInstanceModel: vi.fn().mockResolvedValue({
      ...MODEL,
      formInstanceId: "fi-1",
      selectedOutcome: "approve",
      fields: [{ ...MODEL.fields[0], value: 1250.5 }],
    }),
    ...overrides,
  } as unknown as FormApi & Record<string, Mock>;
}

function Harness({ formApi }: { formApi?: FormApi }) {
  const { path } = useLocation();
  const navigate = useNavigate();
  const selectedId = matchPath("/forms/:formDefinitionId", path)?.formDefinitionId;
  return <Forms formApi={formApi} selectedId={selectedId} onSelect={(id) => navigate(id ? `/forms/${id}` : "/forms")} />;
}

function renderForms(formApi?: FormApi) {
  window.history.replaceState({}, "", "/forms");
  return render(
    <RouterProvider>
      <ToastProvider>
        <Harness formApi={formApi} />
      </ToastProvider>
    </RouterProvider>,
  );
}

describe("Forms", () => {
  it("says what is missing when no form API is configured", () => {
    renderForms(undefined);
    expect(screen.getByText(/form engine is not configured/i)).toBeInTheDocument();
  });

  it("lists deployed definitions and opens one with its preview and JSON", async () => {
    const api = stubApi();
    renderForms(api);
    expect(await screen.findByText("Sales clearance")).toBeInTheDocument();
    expect(screen.getByText("v3")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^open$/i }));

    expect(await screen.findByRole("heading", { name: "Sales clearance" })).toBeInTheDocument();
    expect(screen.getByLabelText(/outstanding collection/i)).toBeDisabled();
    expect(screen.getByText(/"key": "salesClearanceForm"/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /download \.form/i })).toHaveAttribute(
      "href",
      "/form-api/form-repository/form-definitions/def-1/resourcedata",
    );
  });

  it("deletes a deployment with an explicit cascade choice", async () => {
    const api = stubApi();
    renderForms(api);
    await userEvent.click(await screen.findByRole("tab", { name: /deployments/i }));
    expect(await screen.findByText("resignation-forms")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("checkbox"));
    await userEvent.click(within(dialog).getByRole("button", { name: /delete deployment/i }));

    await waitFor(() => expect(api.deleteDeployment).toHaveBeenCalledWith("dep-1", true));
  });

  it("lists submissions with the form's name and opens one read-only", async () => {
    const api = stubApi();
    renderForms(api);
    await userEvent.click(await screen.findByRole("tab", { name: /submissions/i }));
    expect(await screen.findByText("imran.kabir")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText("Sales clearance").length).toBeGreaterThan(0));

    await userEvent.click(screen.getByRole("button", { name: /^view$/i }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/outcome: approve/i)).toBeInTheDocument();
    expect(within(dialog).getByText("1250.5")).toBeInTheDocument();
    expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
  });
});
