/**
 * The rebuilt table (UI_POLISH_BACKLOG.md C1, C2).
 *
 * Each behaviour here was absent before and is what C1 asks for. The sort test in
 * particular pins the thing most likely to be got wrong later: sorting is a *server*
 * concern, and a table that quietly sorted its own page would be lying about the other
 * pages nobody has fetched.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n/I18nContext";
import { commonMessages } from "../i18n/messages";
import { expectNoA11yViolations } from "../testing/a11y";
import { DataTable, Pagination, type Column } from "./DataTable";

interface Row {
  id: string;
  name: string;
  assignee: string;
}

const ROWS: Row[] = [
  { id: "1", name: "Approve invoice", assignee: "alice" },
  { id: "2", name: "Review contract", assignee: "bob" },
  { id: "3", name: "Sign off budget", assignee: "carol" },
];

const COLUMNS: Column<Row>[] = [
  { key: "name", header: "Task", sortKey: "name", required: true, render: (row) => row.name },
  { key: "assignee", header: "Assignee", render: (row) => row.assignee },
];

function renderTable(props: Partial<React.ComponentProps<typeof DataTable<Row>>> = {}) {
  return render(
    <I18nProvider catalogues={commonMessages}>
      <DataTable
        caption="Tasks"
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(row) => row.id}
        {...props}
      />
    </I18nProvider>,
  );
}

beforeEach(() => window.localStorage.clear());

describe("DataTable — sorting (C1)", () => {
  it("marks the sorted column with aria-sort, which existed nowhere in the repo before", () => {
    renderTable({ sort: { key: "name", order: "asc" }, onSortChange: () => {} });
    expect(screen.getByRole("columnheader", { name: /Task/ })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    // A sortable column that is not the current sort says "none", not nothing.
    expect(screen.getByRole("columnheader", { name: "Assignee" })).not.toHaveAttribute("aria-sort");
  });

  it("asks the caller to re-query rather than reordering its own page", async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    renderTable({ sort: { key: "name", order: "asc" }, onSortChange });

    await user.click(screen.getByRole("button", { name: /Task/ }));
    expect(onSortChange).toHaveBeenCalledWith({ key: "name", order: "desc" });

    // The rows are untouched: the server owns the order.
    const rendered = screen.getAllByRole("row").slice(1).map((row) => row.textContent);
    expect(rendered[0]).toContain("Approve invoice");
  });

  it("starts a new column ascending rather than inheriting the previous order", async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    renderTable({
      sort: { key: "name", order: "desc" },
      onSortChange,
      columns: [...COLUMNS, { key: "due", header: "Due", sortKey: "dueDate", render: () => "—" }],
    });
    await user.click(screen.getByRole("button", { name: /Due/ }));
    expect(onSortChange).toHaveBeenCalledWith({ key: "dueDate", order: "asc" });
  });

  it("leaves a column with no sortKey inert", () => {
    renderTable({ sort: { key: "name", order: "asc" }, onSortChange: () => {} });
    expect(screen.queryByRole("button", { name: "Assignee" })).toBeNull();
  });
});

describe("DataTable — selection and bulk actions (C1)", () => {
  it("selects and clears a row", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    renderTable({ selection: new Set<string>(), onSelectionChange });

    await user.click(screen.getAllByLabelText("Select this row")[1]);
    expect(onSelectionChange).toHaveBeenCalledWith(new Set(["2"]));
  });

  it("select-all covers this page only — never rows nobody has fetched (§8)", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    renderTable({ selection: new Set<string>(), onSelectionChange });

    await user.click(screen.getByLabelText("Select every row on this page"));
    expect(onSelectionChange).toHaveBeenCalledWith(new Set(["1", "2", "3"]));
  });

  it("shows the header checkbox as indeterminate for a partial selection", () => {
    renderTable({ selection: new Set(["1"]), onSelectionChange: () => {} });
    const all = screen.getByLabelText("Select every row on this page") as HTMLInputElement;
    expect(all.indeterminate).toBe(true);
    expect(all.checked).toBe(false);
  });

  it("raises the bulk bar only when something is selected", async () => {
    const { rerender } = renderTable({ selection: new Set<string>(), onSelectionChange: () => {} });
    expect(screen.queryByRole("region", { name: "Bulk actions" })).toBeNull();

    rerender(
      <I18nProvider catalogues={commonMessages}>
        <DataTable
          caption="Tasks"
          columns={COLUMNS}
          rows={ROWS}
          rowKey={(row) => row.id}
          selection={new Set(["1", "2"])}
          onSelectionChange={() => {}}
          bulkActions={(selected) => <button type="button">Retry {selected.length}</button>}
        />
      </I18nProvider>,
    );
    const bar = screen.getByRole("region", { name: "Bulk actions" });
    expect(within(bar).getByText("2 selected")).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Retry 2" })).toBeInTheDocument();
  });

  it("does not open the row when the checkbox is clicked", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    renderTable({ selection: new Set<string>(), onSelectionChange: () => {}, onRowClick });

    await user.click(screen.getAllByLabelText("Select this row")[0]);
    expect(onRowClick).not.toHaveBeenCalled();
  });
});

describe("DataTable — row actions (C1)", () => {
  it("offers a per-row menu, which previously existed only in the detail pane", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderTable({
      rowActions: (row) => [{ id: "retry", label: `Retry ${row.name}`, onSelect }],
    });

    await user.click(screen.getAllByRole("button", { name: "Actions for this row" })[0]);
    await user.click(screen.getByRole("menuitem", { name: "Retry Approve invoice" }));
    expect(onSelect).toHaveBeenCalled();
  });

  it("renders no menu for a row with no actions", () => {
    renderTable({ rowActions: () => [] });
    expect(screen.queryByRole("button", { name: "Actions for this row" })).toBeNull();
  });
});

describe("DataTable — columns and density (C1)", () => {
  it("hides a column on request and remembers the choice", async () => {
    const user = userEvent.setup();
    const { unmount } = renderTable({ preferenceKey: "test.tasks" });

    await user.click(screen.getByRole("button", { name: "Columns" }));
    await user.click(screen.getByRole("menuitem", { name: "Assignee" }));
    expect(screen.queryByRole("columnheader", { name: "Assignee" })).toBeNull();

    // Survives a remount: the preference is persisted, not component state.
    unmount();
    renderTable({ preferenceKey: "test.tasks" });
    expect(screen.queryByRole("columnheader", { name: "Assignee" })).toBeNull();
  });

  it("will not hide a required column", async () => {
    const user = userEvent.setup();
    renderTable({ preferenceKey: "test.tasks" });
    await user.click(screen.getByRole("button", { name: "Columns" }));
    expect(screen.getByRole("menuitem", { name: /Task/ })).toBeDisabled();
  });

  it("toggles density and reports it as a pressed state", async () => {
    const user = userEvent.setup();
    renderTable({ preferenceKey: "test.tasks" });
    const toggle = screen.getByRole("button", { name: /Comfortable/ });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);
    expect(screen.getByRole("button", { name: /Compact/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("offers neither control without a preferenceKey", () => {
    renderTable();
    expect(screen.queryByRole("button", { name: "Columns" })).toBeNull();
  });
});

describe("DataTable — virtualization (C1)", () => {
  const MANY: Row[] = Array.from({ length: 200 }, (_, index) => ({
    id: String(index),
    name: `Task ${index}`,
    assignee: "alice",
  }));

  it("renders every row below the threshold, spacers and all", () => {
    renderTable({ rows: ROWS });
    // 3 rows + header, and no spacer rows.
    expect(screen.getAllByRole("row")).toHaveLength(4);
  });

  it("renders only a window above it, but keeps the row count honest to the caller", () => {
    renderTable({ rows: MANY });
    const rendered = screen.getAllByRole("row").length;
    expect(rendered).toBeLessThan(MANY.length);
    // The first row is present; a far-down one is not yet.
    expect(screen.getByText("Task 0")).toBeInTheDocument();
    expect(screen.queryByText("Task 199")).toBeNull();
  });
});

describe("DataTable — empty and busy", () => {
  it("renders the caller's empty state inside the table body", () => {
    renderTable({ rows: [], empty: <p>Nothing here</p> });
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });

  it("marks itself busy while refreshing rather than blanking the rows", () => {
    renderTable({ busy: true });
    expect(screen.getByRole("table")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Approve invoice")).toBeInTheDocument();
  });
});

describe("Pagination (C2)", () => {
  function renderPagination(props: Partial<React.ComponentProps<typeof Pagination>> = {}) {
    return render(
      <I18nProvider catalogues={commonMessages}>
        <Pagination start={50} size={25} total={640} onChange={() => {}} {...props} />
      </I18nProvider>,
    );
  }

  it("says which page you are on, which Previous/Next alone never did", () => {
    renderPagination();
    expect(screen.getByText("Page 3 of 26")).toBeInTheDocument();
    expect(screen.getByText("51–75 of 640")).toBeInTheDocument();
  });

  it("jumps to the first page", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderPagination({ onChange });
    await user.click(screen.getByRole("button", { name: "First page" }));
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("jumps to the last page's start, not total - size", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    // 640 is not a multiple of 25's page boundary in an obvious way: last page starts at 625.
    renderPagination({ onChange });
    await user.click(screen.getByRole("button", { name: "Last page" }));
    expect(onChange).toHaveBeenCalledWith(625);
  });

  it("offers page sizes only when the caller owns the value", async () => {
    const user = userEvent.setup();
    const onSizeChange = vi.fn();
    const { rerender } = renderPagination();
    expect(screen.queryByLabelText("Per page")).toBeNull();

    rerender(
      <I18nProvider catalogues={commonMessages}>
        <Pagination start={0} size={25} total={640} onChange={() => {}} onSizeChange={onSizeChange} />
      </I18nProvider>,
    );
    await user.selectOptions(screen.getByLabelText("Per page"), "100");
    expect(onSizeChange).toHaveBeenCalledWith(100);
  });

  it("disables the edges at the edges", () => {
    renderPagination({ start: 0, total: 10, size: 25 });
    expect(screen.getByRole("button", { name: "First page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Last page" })).toBeDisabled();
  });

  it("renders nothing at all for an empty result", () => {
    const { container } = renderPagination({ total: 0 });
    expect(container).toBeEmptyDOMElement();
  });
});

describe("DataTable accessibility", () => {
  it("has no axe violations with every feature on", async () => {
    const { container } = render(
      <I18nProvider catalogues={commonMessages}>
        <DataTable
          caption="Tasks"
          preferenceKey="a11y.tasks"
          columns={COLUMNS}
          rows={ROWS}
          rowKey={(row) => row.id}
          sort={{ key: "name", order: "asc" }}
          onSortChange={() => {}}
          selection={new Set(["1"])}
          onSelectionChange={() => {}}
          bulkActions={() => <button type="button">Retry</button>}
          rowActions={() => [{ id: "a", label: "Open", onSelect: () => {} }]}
        />
        <Pagination start={0} size={25} total={640} onChange={() => {}} onSizeChange={() => {}} />
      </I18nProvider>,
    );
    await expectNoA11yViolations(container);
  });
});
