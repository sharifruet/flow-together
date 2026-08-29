/**
 * Scale behaviour of the shared table (ENTERPRISE_PARITY_PLAN.md W3.4, REQUIREMENTS §13.5).
 *
 * §13.5 asks for performance that is *tested*, not merely designed for. A full load test
 * needs an engine at realistic volume and belongs in the environment, not here — but the
 * claim this component makes is checkable in isolation: that a large page does not become
 * a large DOM. That is the property that actually decides whether Control stays usable on
 * a busy engine, and it is the one a later change can silently undo.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataTable, type Column } from "./DataTable";

interface Row {
  id: string;
  name: string;
  state: string;
}

function rows(count: number): Row[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `row-${index}`,
    name: `Instance ${index}`,
    state: index % 3 === 0 ? "suspended" : "running",
  }));
}

const columns: Column<Row>[] = [
  { key: "name", header: "Name", render: (row) => row.name },
  { key: "state", header: "State", render: (row) => row.state },
];

function renderTable(count: number) {
  return render(
    <DataTable caption="Instances" columns={columns} rows={rows(count)} rowKey={(row) => row.id} />,
  );
}

describe("DataTable at scale", () => {
  it("renders every row while the page is small", () => {
    // Below the threshold, virtualizing costs more than it saves and would break
    // Ctrl-F, which is how people actually find a row on a short list.
    renderTable(25);
    expect(screen.getAllByRole("row")).toHaveLength(26); // + the header
  });

  it("renders a window, not the whole page, once the page is large", () => {
    const { container } = renderTable(5000);

    const rendered = container.querySelectorAll("tbody tr").length;
    expect(rendered).toBeGreaterThan(0);
    // The number that matters: a 5,000-row page must not become a 5,000-row DOM.
    expect(rendered).toBeLessThan(200);
  });

  it("keeps the scroll height honest so the scrollbar still means something", () => {
    // Virtualizing by dropping rows without reserving their height gives a scrollbar
    // that claims the list is short — the user scrolls once and hits the end.
    const { container } = renderTable(5000);
    const spacers = container.querySelectorAll("tbody tr[aria-hidden='true']");
    expect(spacers.length).toBeGreaterThan(0);
  });

  it("still reports the true row count to assistive tech", () => {
    // A screen reader told there are 60 rows when there are 5,000 is worse off than one
    // told nothing.
    const { container } = renderTable(5000);
    const grid = container.querySelector("[aria-rowcount]");
    expect(grid?.getAttribute("aria-rowcount")).toBe("5000");
  });
});
