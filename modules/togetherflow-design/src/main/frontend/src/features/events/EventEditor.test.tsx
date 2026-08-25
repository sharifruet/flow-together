import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import {
  ToastProvider,
  emptyEventDraft,
  type EventRegistryApi,
  type ModelApi,
  type ModelResponse,
} from "@togetherflow/common";
import { EventEditor } from "./EventEditor";

const MODEL: ModelResponse = {
  id: "m1",
  name: "Order placed",
  key: "orderPlaced",
  category: "togetherflow:event",
};

function stubs(overrides: { model?: Record<string, unknown>; event?: Record<string, unknown> } = {}) {
  const modelApi = {
    saveSource: vi.fn().mockResolvedValue(undefined),
    ...overrides.model,
  } as unknown as ModelApi & { saveSource: Mock };
  const eventApi = {
    deploy: vi.fn().mockResolvedValue({ id: "d1" }),
    ...overrides.event,
  } as unknown as EventRegistryApi & { deploy: Mock };
  return { modelApi, eventApi };
}

function renderEditor(
  api: ReturnType<typeof stubs>,
  source: string | null = JSON.stringify(emptyEventDraft("orderPlaced", "Order placed")),
) {
  const onBack = vi.fn();
  render(
    <ToastProvider>
      <EventEditor
        modelApi={api.modelApi}
        eventApi={api.eventApi}
        model={MODEL}
        initialSource={source}
        onBack={onBack}
        onSaved={vi.fn()}
      />
    </ToastProvider>,
  );
  return { onBack };
}

async function confirmDeploy(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Deploy" }));
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Save and deploy" }));
}

describe("EventEditor", () => {
  it("deploys the event and the channel as separate files, because the endpoint takes one file per call", async () => {
    const user = userEvent.setup();
    const api = stubs();
    renderEditor(api);

    await user.click(screen.getByRole("button", { name: "Add a channel" }));
    await confirmDeploy(user);

    await waitFor(() => expect(api.eventApi.deploy).toHaveBeenCalledTimes(2));
    const [eventCall, channelCall] = api.eventApi.deploy.mock.calls;
    expect(eventCall[0]).toBe("event");
    expect(eventCall[1]).toBe("orderPlaced");
    expect(channelCall[0]).toBe("channel");
    expect(channelCall[1]).toBe("orderPlacedChannel");
  });

  it("deploys only the event when the draft has no channel", async () => {
    const user = userEvent.setup();
    const api = stubs();
    renderEditor(api);

    await confirmDeploy(user);

    await waitFor(() => expect(api.eventApi.deploy).toHaveBeenCalledTimes(1));
    expect(api.eventApi.deploy.mock.calls[0][0]).toBe("event");
  });

  it("saves the draft before deploying, so what ships is what is on screen", async () => {
    const user = userEvent.setup();
    const api = stubs();
    renderEditor(api);

    await user.clear(screen.getByLabelText(/Event name/));
    await user.type(screen.getByLabelText(/Event name/), "Renamed");
    await confirmDeploy(user);

    await waitFor(() => expect(api.eventApi.deploy).toHaveBeenCalled());
    expect(api.modelApi.saveSource).toHaveBeenCalled();
    const saved = JSON.parse(api.modelApi.saveSource.mock.calls.at(-1)![1] as string);
    expect(saved.event.name).toBe("Renamed");
    // The saved draft and the deployed file must agree.
    expect(JSON.parse(api.eventApi.deploy.mock.calls[0][2] as string).name).toBe("Renamed");
  });

  it("reports a failed deployment instead of claiming success", async () => {
    const user = userEvent.setup();
    const api = stubs({ event: { deploy: vi.fn().mockRejectedValue(new Error("boom")) } });
    renderEditor(api);

    await confirmDeploy(user);

    expect(await screen.findByText("Deployment failed.")).toBeInTheDocument();
  });

  it("cannot deploy a draft with neither an event nor a channel", async () => {
    const user = userEvent.setup();
    const api = stubs();
    renderEditor(api);

    await user.click(screen.getByRole("button", { name: "Remove event" }));

    expect(screen.getByRole("button", { name: "Deploy" })).toBeDisabled();
  });

  it("warns before discarding unsaved changes", async () => {
    const user = userEvent.setup();
    const api = stubs();
    const { onBack } = renderEditor(api);

    await user.type(screen.getByLabelText(/Event name/), "!");
    await user.click(screen.getByRole("button", { name: /Back to models/ }));

    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Leave without saving?");
    expect(onBack).not.toHaveBeenCalled();
  });

  it("adds and removes payload fields", async () => {
    const user = userEvent.setup();
    const api = stubs();
    renderEditor(api);

    expect(screen.getByRole("heading", { name: /Payload \(1\)/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add field" }));
    expect(screen.getByRole("heading", { name: /Payload \(2\)/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Remove field id/ }));
    expect(screen.getByRole("heading", { name: /Payload \(1\)/ })).toBeInTheDocument();
  });
});
