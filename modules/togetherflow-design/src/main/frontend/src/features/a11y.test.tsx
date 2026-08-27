/**
 * Accessibility regression checks for Design's screens (REQUIREMENTS.md §13.6).
 *
 * The canvas editors are deliberately not covered: bpmn-js and dmn-js render their own
 * DOM, so an axe run over them measures a third-party library rather than this code, and
 * would fail on things this repo cannot fix. What is checked is what Design itself owns —
 * the model library and the form builder's palette, list and properties panel.
 */

import { render, screen } from "@testing-library/react";
import { describe, it, vi } from "vitest";
import { expectNoA11yViolations } from "@togetherflow/common/testing/a11y";
import {
  RouterProvider,
  ToastProvider,
  type DataResponse,
  type ModelApi,
  type ModelResponse,
} from "@togetherflow/common";
import { ModelLibrary } from "./library/ModelLibrary";
import { FormBuilder } from "./forms/FormBuilder";

function page<T>(rows: T[]): DataResponse<T> {
  return { data: rows, total: rows.length, start: 0, size: 25 };
}

const MODEL: ModelResponse = {
  id: "model-1",
  name: "Invoice approval",
  key: "invoice",
  category: "bpmn",
  version: 1,
  lastUpdateTime: "2026-08-01T10:00:00Z",
} as ModelResponse;

describe("Design screens meet WCAG 2.1 AA", () => {
  it("the model library", async () => {
    const modelApi = { list: vi.fn().mockResolvedValue(page([MODEL])) } as unknown as ModelApi;
    const { container } = render(
      <RouterProvider>
        <ToastProvider>
          <ModelLibrary modelApi={modelApi} onOpen={vi.fn()} refreshToken={0} />
        </ToastProvider>
      </RouterProvider>,
    );
    await screen.findByText("Invoice approval");
    await expectNoA11yViolations(container);
  });

  it("the form builder, with a field selected", async () => {
    const modelApi = { saveSource: vi.fn() } as unknown as ModelApi;
    const source = JSON.stringify({
      key: "invoice",
      name: "Invoice form",
      fields: [{ id: "amount", name: "Amount", type: "integer", required: true }],
    });
    const { container } = render(
      <ToastProvider>
        <FormBuilder
          modelApi={modelApi}
          model={{ ...MODEL, category: "togetherflow:form" } as ModelResponse}
          initialSource={source}
          onBack={vi.fn()}
          onSaved={vi.fn()}
        />
      </ToastProvider>,
    );
    await screen.findByDisplayValue("invoice");
    await expectNoA11yViolations(container);
  });
});
