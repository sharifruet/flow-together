import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import {
  ToastProvider,
  type EventRecorderApi,
  type EventRegistryApi,
} from "@togetherflow/common";
import { EventRegistry } from "./EventRegistry";

const EVENTS = [{ id: "e1", key: "orderPlaced", name: "Order placed", version: 1 }];
const CHANNELS = [
  { id: "ch1", key: "orderChannel", name: "Order channel", version: 1, type: "jms" },
];

function stubApi(overrides: Record<string, unknown> = {}) {
  return {
    listEventDefinitions: vi.fn().mockResolvedValue({ data: EVENTS, total: 1, start: 0, size: 50 }),
    listChannelDefinitions: vi
      .fn()
      .mockResolvedValue({ data: CHANNELS, total: 1, start: 0, size: 50 }),
    getEventModel: vi.fn().mockResolvedValue({ key: "orderPlaced", payload: [] }),
    getChannelModel: vi.fn().mockResolvedValue({ key: "orderChannel", channelType: "inbound" }),
    sendEvent: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as EventRegistryApi & Record<string, Mock>;
}

function renderScreen(api: EventRegistryApi, recorderApi?: EventRecorderApi) {
  render(
    <ToastProvider>
      <EventRegistry eventApi={api} recorderApi={recorderApi} />
    </ToastProvider>,
  );
}

const RECORDS = [
  {
    id: "r1",
    receivedAt: "2026-08-25T12:00:00Z",
    channelKey: "orderChannel",
    eventKey: "orderPlaced",
    status: "RECEIVED" as const,
    payload: '{"orderId":"O-1"}',
    truncated: false,
  },
  {
    id: "r2",
    receivedAt: "2026-08-25T11:00:00Z",
    channelKey: "orderChannel",
    eventKey: null,
    status: "UNRESOLVED" as const,
    payload: '{"mystery":true}',
    truncated: false,
  },
];

function stubRecorder(overrides: Record<string, unknown> = {}) {
  return {
    list: vi.fn().mockResolvedValue({ data: RECORDS, total: 2, start: 0, size: 25 }),
    ...overrides,
  } as unknown as EventRecorderApi & Record<string, Mock>;
}

describe("EventRegistry", () => {
  it("lists deployed event definitions", async () => {
    renderScreen(stubApi());
    expect(await screen.findByText("Order placed")).toBeInTheDocument();
  });

  it("shows the deployed source, so an operator sees what is actually live", async () => {
    const user = userEvent.setup();
    const api = stubApi();
    renderScreen(api);

    await screen.findByText("Order placed");
    await user.click(screen.getByRole("button", { name: "View source" }));

    await waitFor(() => expect(api.getEventModel).toHaveBeenCalledWith("e1", expect.anything()));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.querySelector(".tf-source")?.textContent).toContain("orderPlaced");
  });

  it("shows channels and their transport", async () => {
    const user = userEvent.setup();
    renderScreen(stubApi());

    await user.click(screen.getByRole("tab", { name: "Channels" }));
    expect(await screen.findByText("Order channel")).toBeInTheDocument();
    expect(screen.getByText("jms")).toBeInTheDocument();
  });

  /**
   * The engine requires a channel key ("Either channelDefinitionId or
   * channelDefinitionKey is required") and takes the payload as a plain JSON object
   * under `eventPayload`, not a name/value array — both verified against a live engine.
   */
  it("sends an event in the shape the engine accepts", async () => {
    const user = userEvent.setup();
    const api = stubApi();
    renderScreen(api);

    await user.click(screen.getByRole("tab", { name: "Send an event" }));
    await user.type(screen.getByLabelText("Event key"), "orderPlaced");
    await user.type(screen.getByLabelText("Channel key"), "orderChannel");
    const payload = screen.getByLabelText(/Payload/);
    await user.clear(payload);
    await user.type(payload, '{{"orderId":"O-1"}');
    await user.click(screen.getByRole("button", { name: "Send event" }));

    await waitFor(() =>
      expect(api.sendEvent).toHaveBeenCalledWith({
        eventDefinitionKey: "orderPlaced",
        channelDefinitionKey: "orderChannel",
        eventPayload: { orderId: "O-1" },
      }),
    );
  });

  it("will not send without a channel, which the engine would reject", async () => {
    const user = userEvent.setup();
    renderScreen(stubApi());

    await user.click(screen.getByRole("tab", { name: "Send an event" }));
    await user.type(screen.getByLabelText("Event key"), "orderPlaced");

    expect(screen.getByRole("button", { name: "Send event" })).toBeDisabled();
  });

  it("rejects a payload that is not a JSON object, before calling the engine", async () => {
    const user = userEvent.setup();
    const api = stubApi();
    renderScreen(api);

    await user.click(screen.getByRole("tab", { name: "Send an event" }));
    await user.type(screen.getByLabelText("Event key"), "e");
    await user.type(screen.getByLabelText("Channel key"), "c");
    const payload = screen.getByLabelText(/Payload/);
    await user.clear(payload);
    // "[" starts a key descriptor in user-event's keyboard syntax, so it is escaped.
    await user.type(payload, "[[1,2]");

    expect(await screen.findByText("The payload must be a JSON object.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send event" })).toBeDisabled();
    expect(api.sendEvent).not.toHaveBeenCalled();
  });

  it("flags malformed JSON", async () => {
    const user = userEvent.setup();
    renderScreen(stubApi());

    await user.click(screen.getByRole("tab", { name: "Send an event" }));
    const payload = screen.getByLabelText(/Payload/);
    await user.clear(payload);
    await user.type(payload, "not json");

    expect(await screen.findByText("That isn't valid JSON.")).toBeInTheDocument();
  });

  it("reports a rejected send", async () => {
    const user = userEvent.setup();
    const api = stubApi({ sendEvent: vi.fn().mockRejectedValue(new Error("boom")) });
    renderScreen(api);

    await user.click(screen.getByRole("tab", { name: "Send an event" }));
    await user.type(screen.getByLabelText("Event key"), "e");
    await user.type(screen.getByLabelText("Channel key"), "c");
    await user.click(screen.getByRole("button", { name: "Send event" }));

    expect(await screen.findByText("Could not send that event.")).toBeInTheDocument();
  });

  it("says plainly that received events cannot be listed", async () => {
    const user = userEvent.setup();
    renderScreen(stubApi());

    await user.click(screen.getByRole("tab", { name: "Send an event" }));
    expect(screen.getByText(/keeps no log of received events/i)).toBeInTheDocument();
  });

  it("guides when nothing is deployed", async () => {
    renderScreen(
      stubApi({
        listEventDefinitions: vi.fn().mockResolvedValue({ data: [], total: 0, start: 0, size: 50 }),
      }),
    );
    expect(await screen.findByText("No event definitions")).toBeInTheDocument();
  });
});

/**
 * The inbound log (§7.2, ADR 0015). The engine has no such feed; these cover the view
 * over the optional recorder, and — first — that its absence is visible rather than
 * silently rendered as "nothing has happened".
 */
describe("EventRegistry — received events", () => {
  it("offers no Received tab when the recorder is not deployed", async () => {
    renderScreen(stubApi());

    await screen.findByText("Order placed");
    expect(screen.queryByRole("tab", { name: "Received" })).not.toBeInTheDocument();
  });

  it("lists what arrived, with the outcome of each", async () => {
    const user = userEvent.setup();
    renderScreen(stubApi(), stubRecorder());

    await user.click(screen.getByRole("tab", { name: "Received" }));

    expect(await screen.findByText("orderPlaced")).toBeInTheDocument();
    // Scoped to the table: the outcome filter lists the same labels as <option>s.
    const rows = within(screen.getByRole("table"));
    expect(rows.getByText("Dispatched")).toBeInTheDocument();
    expect(rows.getByText("Matched nothing")).toBeInTheDocument();
  });

  it("names an event that resolved to nothing rather than leaving the cell blank", async () => {
    const user = userEvent.setup();
    renderScreen(stubApi(), stubRecorder());

    await user.click(screen.getByRole("tab", { name: "Received" }));

    expect(await screen.findByText("Unrecognised event")).toBeInTheDocument();
  });

  it("explains an unresolved payload when inspected — the case the feed exists for", async () => {
    const user = userEvent.setup();
    renderScreen(stubApi(), stubRecorder());

    await user.click(screen.getByRole("tab", { name: "Received" }));
    await screen.findByText("Unrecognised event");
    await user.click(screen.getAllByRole("button", { name: "Inspect" })[1]);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/resolved to no event definition/i)).toBeInTheDocument();
    expect(dialog.querySelector(".tf-source")?.textContent).toContain("mystery");
  });

  it("shows why the pipeline rejected a payload", async () => {
    const user = userEvent.setup();
    const recorder = stubRecorder({
      list: vi.fn().mockResolvedValue({
        data: [
          {
            id: "r3",
            receivedAt: "2026-08-25T12:00:00Z",
            channelKey: "orderChannel",
            eventKey: null,
            status: "FAILED",
            payload: "not json",
            truncated: false,
            errorMessage: "FlowableException: no key detector",
          },
        ],
        total: 1,
        start: 0,
        size: 25,
      }),
    });
    renderScreen(stubApi(), recorder);

    await user.click(screen.getByRole("tab", { name: "Received" }));
    await screen.findByRole("table");
    expect(within(screen.getByRole("table")).getByText("Rejected")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Inspect" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("no key detector");
  });

  it("says so when the deployment records arrivals but not payloads (§13.7)", async () => {
    const user = userEvent.setup();
    const recorder = stubRecorder({
      list: vi.fn().mockResolvedValue({
        data: [{ ...RECORDS[0], payload: null }],
        total: 1,
        start: 0,
        size: 25,
      }),
    });
    renderScreen(stubApi(), recorder);

    await user.click(screen.getByRole("tab", { name: "Received" }));
    await screen.findByText("orderPlaced");
    await user.click(screen.getByRole("button", { name: "Inspect" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/records arrivals but not their contents/i)).toBeInTheDocument();
    expect(dialog.querySelector(".tf-source")).toBeNull();
  });

  it("filters by channel, using the deployed channels rather than what has been seen", async () => {
    const user = userEvent.setup();
    const recorder = stubRecorder();
    renderScreen(stubApi(), recorder);

    await user.click(screen.getByRole("tab", { name: "Received" }));
    await screen.findByText("orderPlaced");
    await user.selectOptions(screen.getByLabelText("Channel"), "orderChannel");

    await waitFor(() =>
      expect(recorder.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ channelKey: "orderChannel" }),
        expect.anything(),
      ),
    );
  });

  it("filters by outcome", async () => {
    const user = userEvent.setup();
    const recorder = stubRecorder();
    renderScreen(stubApi(), recorder);

    await user.click(screen.getByRole("tab", { name: "Received" }));
    await screen.findByText("orderPlaced");
    await user.selectOptions(screen.getByLabelText("Outcome"), "UNRESOLVED");

    await waitFor(() =>
      expect(recorder.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "UNRESOLVED" }),
        expect.anything(),
      ),
    );
  });

  it("distinguishes an empty recorder from a filter that matched nothing (§14.1)", async () => {
    const user = userEvent.setup();
    const recorder = stubRecorder({
      list: vi.fn().mockResolvedValue({ data: [], total: 0, start: 0, size: 25 }),
    });
    renderScreen(stubApi(), recorder);

    await user.click(screen.getByRole("tab", { name: "Received" }));
    expect(await screen.findByText("Nothing received yet")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Outcome"), "FAILED");

    // Same empty page, different meaning — and now a way back out of the filter.
    expect(await screen.findByRole("button", { name: /clear/i })).toBeInTheDocument();
    expect(screen.queryByText("Nothing received yet")).not.toBeInTheDocument();
  });
});

describe("EventRegistry — channel source", () => {
  it("reads the channel model, not the event model", async () => {
    const user = userEvent.setup();
    const api = stubApi();
    renderScreen(api);

    await user.click(screen.getByRole("tab", { name: "Channels" }));
    await screen.findByText("Order channel");
    await user.click(screen.getByRole("button", { name: "View source" }));

    await waitFor(() => expect(api.getChannelModel).toHaveBeenCalledWith("ch1", expect.anything()));
    expect(api.getEventModel).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/inbound/)).toBeInTheDocument();
  });
});
