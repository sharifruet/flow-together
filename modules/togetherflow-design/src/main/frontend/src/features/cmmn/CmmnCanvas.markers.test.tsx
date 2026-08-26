/**
 * Validation markers on the CMMN canvas.
 *
 * A list of problems the reader has to match back to the diagram by name is much weaker
 * than the diagram showing them, so what is pinned here is that the marker reaches the
 * *shape* — the class and the element it lands on, not just the map that feeds it.
 */

import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { I18nProvider } from "@togetherflow/common";

import { CmmnCanvas } from "./CmmnCanvas";
import { designMessages } from "../../i18n/messages";
import { EMPTY_PRESERVED, type CmmnCase, type CmmnElement } from "./cmmnModel";

function element(id: string, type: CmmnElement["type"] = "humanTask"): CmmnElement {
  return {
    planItemId: id,
    definitionId: `def_${id}`,
    type,
    name: id,
    bounds: { x: 100, y: 100, width: 100, height: 60 },
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
  elements: [element("a"), element("b")],
  ...EMPTY_PRESERVED,
};

function draw(problems?: Map<string, "error" | "warning">) {
  const { container } = render(
    <I18nProvider catalogues={designMessages}>
      <CmmnCanvas
        model={model}
        selectedId={null}
        onSelect={vi.fn()}
        onCommit={vi.fn()}
        onPreview={vi.fn()}
        problems={problems}
      />
    </I18nProvider>,
  );
  return container;
}

/** The shape whose label is `name`, found through its accessible name. */
function shape(container: HTMLElement, name: string): Element {
  const found = [...container.querySelectorAll(".tf-cmmn__shape")].find((node) =>
    node.getAttribute("aria-label")?.includes(name),
  );
  if (!found) throw new Error(`no shape for ${name}`);
  return found;
}

describe("CmmnCanvas — validation markers", () => {
  it("marks nothing when no problems are passed", () => {
    const container = draw();
    expect(container.querySelectorAll(".tf-problem")).toHaveLength(0);
  });

  it("marks only the element with the problem", () => {
    const container = draw(new Map([["a", "error"]]));

    expect(shape(container, "a").classList.contains("tf-problem--error")).toBe(true);
    expect(shape(container, "b").classList.contains("tf-problem")).toBe(false);
  });

  it("distinguishes an error from a warning", () => {
    const container = draw(
      new Map<string, "error" | "warning">([
        ["a", "error"],
        ["b", "warning"],
      ]),
    );

    expect(shape(container, "a").classList.contains("tf-problem--error")).toBe(true);
    expect(shape(container, "b").classList.contains("tf-problem--warning")).toBe(true);
  });

  it("keeps the marker off the selection class, so a marked shape can still be selected", () => {
    const container = draw(new Map([["a", "error"]]));
    const marked = shape(container, "a");

    expect(marked.classList.contains("tf-cmmn__shape")).toBe(true);
    expect(marked.classList.contains("is-selected")).toBe(false);
  });
});
