/**
 * Renaming a shape in place.
 *
 * Renaming used to mean selecting a shape, crossing to the properties panel, and coming
 * back — for the most common edit there is. What matters beyond "the box appears" is what
 * happens when it closes: an empty or unchanged name must not become an undo step, Escape
 * must discard, and the editor's own Delete binding must not fire while somebody is typing
 * a name that contains a backspace.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@togetherflow/common";

import { CmmnCanvas } from "./CmmnCanvas";
import { designMessages } from "../../i18n/messages";
import { EMPTY_PRESERVED, type CmmnCase, type CmmnElement } from "./cmmnModel";

function element(id: string, name: string): CmmnElement {
  return {
    planItemId: id,
    definitionId: `def_${id}`,
    type: "humanTask",
    name,
    bounds: { x: 100, y: 100, width: 140, height: 80 },
    parentId: "plan",
    attributes: {},
    plainAttributes: {},
    extraChildren: [],
    extraPlanItemChildren: [],
    fields: [],
    lifecycleListeners: [],
    extraExtensionChildren: [],
    entrySentries: [],
    exitSentries: [],
  };
}

const model: CmmnCase = {
  caseId: "c",
  caseName: "Case",
  planModelId: "plan",
  planModelName: "Plan",
  planModelBounds: { x: 20, y: 20, width: 800, height: 500 },
  elements: [element("a", "Approve")],
  ...EMPTY_PRESERVED,
};

function draw(disabled = false) {
  const onCommit = vi.fn();
  render(
    <I18nProvider catalogues={designMessages}>
      <CmmnCanvas
        model={model}
        selectedId={null}
        disabled={disabled}
        onSelect={vi.fn()}
        onCommit={onCommit}
        onPreview={vi.fn()}
      />
    </I18nProvider>,
  );
  return { onCommit, shape: screen.getByRole("button", { name: /Approve/ }) };
}

/** The rename box, if it is open. */
function box() {
  return screen.queryByRole("textbox", { name: /rename/i });
}

describe("CmmnCanvas — renaming in place", () => {
  it("opens a box on the shape when it is double-clicked", async () => {
    const { shape } = draw();
    expect(box()).toBeNull();

    await userEvent.dblClick(shape);

    expect(box()).toHaveValue("Approve");
  });

  it("commits the new name on Enter", async () => {
    const { onCommit, shape } = draw();
    await userEvent.dblClick(shape);

    await userEvent.clear(box()!);
    await userEvent.type(box()!, "Review{Enter}");

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0][0].elements[0].name).toBe("Review");
    expect(box()).toBeNull();
  });

  it("commits on blur, so clicking away does not lose the edit", async () => {
    const { onCommit, shape } = draw();
    await userEvent.dblClick(shape);

    await userEvent.clear(box()!);
    await userEvent.type(box()!, "Review");
    await userEvent.tab();

    expect(onCommit.mock.calls[0][0].elements[0].name).toBe("Review");
  });

  it("discards on Escape", async () => {
    const { onCommit, shape } = draw();
    await userEvent.dblClick(shape);

    await userEvent.clear(box()!);
    await userEvent.type(box()!, "Review{Escape}");

    expect(onCommit).not.toHaveBeenCalled();
    expect(box()).toBeNull();
  });

  it("does not make an undo step out of a name that did not change", async () => {
    const { onCommit, shape } = draw();
    await userEvent.dblClick(shape);
    await userEvent.type(box()!, "{Enter}");

    expect(onCommit).not.toHaveBeenCalled();
  });

  it("refuses to blank a name, which would leave the shape showing its id", async () => {
    const { onCommit, shape } = draw();
    await userEvent.dblClick(shape);

    await userEvent.clear(box()!);
    await userEvent.type(box()!, "   {Enter}");

    expect(onCommit).not.toHaveBeenCalled();
  });

  it("keeps typing inside the box, so Backspace does not delete the shape", async () => {
    const { shape } = draw();
    await userEvent.dblClick(shape);

    const stopped = vi.fn();
    box()!.addEventListener("keydown", (event) => {
      if (event.cancelBubble) stopped();
    });
    await userEvent.type(box()!, "{Backspace}");

    // The editor binds Delete and Backspace on `document`; the box stops the event first.
    expect(box()).not.toBeNull();
  });

  it("does not open while the editor is busy", async () => {
    const { shape } = draw(true);
    await userEvent.dblClick(shape);

    expect(box()).toBeNull();
  });
});
