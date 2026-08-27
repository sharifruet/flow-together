/**
 * Accessibility regression checks for Control's screens (REQUIREMENTS.md §13.6).
 *
 * §8 gives Control a slightly more relaxed cadence than Work but does not exempt it, and
 * §14.4 makes keyboard operation a first-class requirement for exactly this audience —
 * admins triaging at volume. The dense, checkbox-driven job table is where that is
 * easiest to get wrong, so it is checked populated.
 */

import { render, screen } from "@testing-library/react";
import { describe, it, vi } from "vitest";
import { expectNoA11yViolations } from "@togetherflow/common/testing/a11y";
import {
  RouterProvider,
  ToastProvider,
  type DataResponse,
  type InstanceApi,
  type RepositoryApi,
  type JobApi,
} from "@togetherflow/common";
import { Jobs } from "./jobs/Jobs";
import { Instances } from "./instances/Instances";

function page<T>(rows: T[]): DataResponse<T> {
  return { data: rows, total: rows.length, start: 0, size: 25 };
}

const REPOSITORY = {
  listProcessDefinitions: vi.fn().mockResolvedValue(page([])),
  listActivityIdsFor: vi.fn().mockResolvedValue([]),
} as unknown as RepositoryApi;

describe("Control screens meet WCAG 2.1 AA", () => {
  it("the job queue, populated and selectable", async () => {
    const jobApi = {
      list: vi.fn().mockResolvedValue(
        page([
          {
            id: "job-1",
            elementName: "Send email",
            retries: 0,
            exceptionMessage: "SMTP refused the connection",
            createTime: "2026-08-01T10:00:00Z",
          },
        ]),
      ),
    } as unknown as JobApi;

    const { container } = render(
      <RouterProvider>
        <ToastProvider>
          <Jobs jobApi={jobApi} />
        </ToastProvider>
      </RouterProvider>,
    );
    await screen.findByText("Send email");
    await expectNoA11yViolations(container);
  });

  it("the process instance list", async () => {
    const instanceApi = {
      query: vi
        .fn()
        .mockResolvedValue(
          page([
            {
              id: "pi-1",
              name: "Invoice 42",
              processDefinitionName: "Invoice",
              startTime: "2026-08-01T10:00:00Z",
              suspended: false,
            },
          ]),
        ),
    } as unknown as InstanceApi;

    const { container } = render(
      <RouterProvider>
        <ToastProvider>
          <Instances instanceApi={instanceApi} repositoryApi={REPOSITORY} />
        </ToastProvider>
      </RouterProvider>,
    );
    await screen.findByText("Invoice 42");
    await expectNoA11yViolations(container);
  });
});
