/**
 * The debounced property field.
 *
 * Two things are being pinned. The first is the point of it: typing must not put one
 * entry on the undo stack per character. The second is the risk it introduces — a draft
 * that has not reached the model yet — so every path that could lose one is covered.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@togetherflow/common";
import { PropertiesPanel, activeToken, searchKindFor, suggestionsFor } from "./PropertiesPanel";
import { designMessages } from "../../i18n/messages";
import type { BpmnElement } from "./useBpmnModeler";

function element(overrides: Record<string, unknown> = {}): BpmnElement {
  return {
    id: "Task_1",
    type: "bpmn:UserTask",
    businessObject: { $type: "bpmn:UserTask", id: "Task_1", name: "", ...overrides },
  };
}

function renderPanel(onChange: (element: BpmnElement, properties: Record<string, unknown>) => void) {
  return render(
    <I18nProvider catalogues={designMessages}>
      <PropertiesPanel element={element()} onChange={onChange} />
    </I18nProvider>,
  );
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

describe("debounced property fields", () => {
  it("writes once for a burst of typing, not once per keystroke", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPanel(onChange);

    await user.type(screen.getByLabelText("Name"), "Approve order");
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    // One command, so one press of undo reverses the rename.
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][1]).toEqual({ name: "Approve order" });
  });

  it("writes immediately on blur, before anything can read the model", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPanel(onChange);

    await user.type(screen.getByLabelText("Name"), "Draft");
    // Clicking Save or another element blurs first; this is what makes the pause safe.
    await user.tab();

    expect(onChange).toHaveBeenCalledWith(expect.anything(), { name: "Draft" });
  });

  it("does not write when the value is unchanged", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPanel(onChange);

    await user.click(screen.getByLabelText("Name"));
    await user.tab();

    // An empty command would still be an undo step for a user who changed nothing.
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clears an emptied field rather than writing an empty attribute", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <I18nProvider catalogues={designMessages}>
        <PropertiesPanel element={element({ name: "Old" })} onChange={onChange} />
      </I18nProvider>,
    );

    await user.clear(screen.getByLabelText("Name"));
    await user.tab();

    // `undefined` removes the attribute; an empty string would serialise as name="".
    expect(onChange).toHaveBeenCalledWith(expect.anything(), { name: undefined });
  });
});

const IDENTITIES = {
  users: [
    { id: "kermit", label: "Kermit the Frog" },
    { id: "fozzie", label: "Fozzie Bear" },
    { id: "gonzo", label: "Gonzo" },
  ],
  groups: [
    { id: "sales", label: "Sales" },
    { id: "legal", label: "Legal" },
  ],
  processes: [{ id: "approvalProcess", label: "Approval" }],
};

describe("reference-field suggestions", () => {
  it("offers users and the initiator expression for a single-valued field", () => {
    const options = suggestionsFor("assignee", "", IDENTITIES);

    // `${initiator}` assigns a task back to whoever started the process and is often the
    // right answer — offering only real user ids would steer people away from it.
    expect(options).toEqual([
      { value: "kermit", label: "Kermit the Frog" },
      { value: "fozzie", label: "Fozzie Bear" },
      { value: "gonzo", label: "Gonzo" },
      { value: "${initiator}", label: undefined },
    ]);
  });

  it("commits the id while showing the name", () => {
    const [first] = suggestionsFor("assignee", "", IDENTITIES);
    // What the engine needs is the id; the name only makes the list recognisable.
    expect(first.value).toBe("kermit");
    expect(first.label).toBe("Kermit the Frog");
  });

  it("offers groups, not users, for a group field", () => {
    expect(suggestionsFor("candidateGroups", "", IDENTITIES).map((o) => o.value)).toEqual([
      "sales",
      "legal",
    ]);
  });

  it("offers deployed process keys for a call activity", () => {
    // A key typed from memory fails only at runtime, and only for the instance that
    // reaches it — which is the worst possible moment to learn about a typo.
    expect(suggestionsFor("calledElement", "", IDENTITIES)).toEqual([
      { value: "approvalProcess", label: "Approval" },
    ]);
  });

  it("does not offer the initiator expression where it is meaningless", () => {
    const values = suggestionsFor("calledElement", "", IDENTITIES).map((o) => o.value);
    expect(values).not.toContain("${initiator}");
  });

  it("keeps what is already typed when completing a comma-separated field", () => {
    /*
     * Selecting a datalist option replaces the input's whole value, so each option has to
     * carry the existing entries. Offering the bare id would silently discard them.
     */
    const options = suggestionsFor("candidateUsers", "kermit, fo", IDENTITIES);

    expect(options.map((o) => o.value)).toContain("kermit, fozzie");
    expect(options.map((o) => o.value)).toContain("kermit, gonzo");
    // The label names the candidate being added, not the accumulated value.
    expect(options.find((o) => o.value === "kermit, fozzie")?.label).toBe("Fozzie Bear");
    // Already chosen, so no longer offered.
    expect(options.some((o) => o.value.endsWith(", kermit"))).toBe(false);
  });

  it("suggests nothing for fields that are not references", () => {
    expect(suggestionsFor("formKey", "", IDENTITIES)).toEqual([]);
  });

  it("suggests nothing when no source is available", () => {
    // Design has to keep working without IDM; the fields simply stay free text.
    expect(suggestionsFor("assignee", "", undefined)).toEqual([]);
  });
});

describe("widening the search as you type", () => {
  it("reports the kind a field searches, and nothing for the rest", () => {
    expect(searchKindFor("assignee")).toBe("users");
    expect(searchKindFor("candidateGroups")).toBe("groups");
    // Process keys come from one fetch of deployed definitions; there is nothing to widen.
    expect(searchKindFor("calledElement")).toBeNull();
    expect(searchKindFor("formKey")).toBeNull();
  });

  it("searches on the entry being typed, not the whole list", () => {
    // Otherwise a second candidate would search for "kermit, fo".
    expect(activeToken("kermit, fo")).toBe("fo");
    expect(activeToken("kermit")).toBe("kermit");
    expect(activeToken("")).toBe("");
  });
});
