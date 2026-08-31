/**
 * Control's overview (W2.1).
 *
 * The behaviour worth pinning is what these tiles *are*: one `size=1` query each, so a
 * failing engine costs one tile rather than the screen, and every number is a link to
 * the list it counts.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RouterProvider, type CaseApi, type InstanceApi, type JobApi, type RepositoryApi } from "@togetherflow/common";
import { Dashboard } from "./Dashboard";

function page(total: number) {
  return { data: [], total, start: 0, size: 1 };
}

function stubs(overrides: Record<string, unknown> = {}) {
  const instanceApi = {
    query: vi.fn().mockImplementation((query: { suspended?: boolean }) =>
      Promise.resolve(page(query.suspended ? 2 : 17)),
    ),
  } as unknown as InstanceApi;
  const caseApi = { query: vi.fn().mockResolvedValue(page(5)) } as unknown as CaseApi;
  const jobApi = {
    list: vi.fn().mockImplementation((queue: string) =>
      Promise.resolve(page(queue === "deadletter" ? 3 : 1)),
    ),
  } as unknown as JobApi;
  const repositoryApi = {
    listProcessDefinitions: vi.fn().mockResolvedValue(page(9)),
  } as unknown as RepositoryApi;

  return { instanceApi, caseApi, jobApi, repositoryApi, ...overrides };
}

function renderDashboard(apis = stubs()) {
  render(
    <RouterProvider basePath="/">
      <Dashboard {...(apis as Parameters<typeof Dashboard>[0])} />
    </RouterProvider>,
  );
}

function tile(label: RegExp) {
  return screen.getByText(label).closest("a") as HTMLElement;
}

describe("Dashboard", () => {
  it("counts each population with its own query and links to the list behind it", async () => {
    renderDashboard();

    await waitFor(() => expect(within(tile(/^Process instances$/)).getByText("17")).toBeInTheDocument());
    expect(tile(/^Process instances$/)).toHaveAttribute("href", expect.stringContaining("/instances"));
    expect(within(tile(/^Dead-letter jobs$/)).getByText("3")).toBeInTheDocument();
    expect(within(tile(/^Case instances$/)).getByText("5")).toBeInTheDocument();
    expect(within(tile(/^Process definitions$/)).getByText("9")).toBeInTheDocument();
  });

  it("asks for one row, not a page — these are totals, not data", async () => {
    const apis = stubs();
    renderDashboard(apis);

    await waitFor(() => expect(apis.instanceApi.query).toHaveBeenCalled());
    for (const call of (apis.instanceApi.query as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[0]).toMatchObject({ size: 1 });
    }
  });

  it("loses one tile to an unreachable engine, not the whole screen", async () => {
    // An engine this fork can be deployed without — CMMN — must not take the dashboard
    // down with it.
    const apis = stubs({
      caseApi: { query: vi.fn().mockRejectedValue(new Error("no cmmn engine")) } as unknown as CaseApi,
    });
    renderDashboard(apis);

    await waitFor(() => expect(within(tile(/^Process instances$/)).getByText("17")).toBeInTheDocument());
    // An em dash with the reason on hover — "unknown" rendered as 0 is the kind of
    // quiet wrong answer an operator acts on.
    const cases = within(tile(/^Case instances$/)).getByTitle(/could not be read/i);
    expect(cases).toHaveTextContent("—");
  });

  it("says in as many words that these are row counts, not aggregates", async () => {
    renderDashboard();
    // §9 rules out an aggregation API; the screen has to be honest about what it shows.
    await waitFor(() => expect(screen.getByText(/count/i)).toBeInTheDocument());
  });
});
