/**
 * The dense-data table (UI_POLISH_BACKLOG.md C1, C2).
 *
 * What this replaces was 93 lines: a styled `<table>` with no sortable headers (no
 * `aria-sort` existed anywhere in the repo, though every backing resource takes
 * `sort`/`order`), no selection — so `Jobs.tsx` hand-rolled `useState<Set<string>>` and
 * its own checkboxes and no other screen got bulk actions — no row-action menu, no column
 * chooser, no density control, no sticky first column, and no virtualization. Control and
 * Work both live in this component, which is why it is the one worth rebuilding.
 *
 * Paging is still never done client-side: the Flowable list resources all support
 * start/size/sort, and loading unbounded result sets is disallowed by §8. Virtualization
 * below is about not *rendering* 100 rows, not about fetching more of them.
 */

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useT } from "../i18n/I18nContext";
import { usePersistentState } from "../hooks/usePersistentState";
import { PAGE_SIZES, type PageSize, type SortState } from "../routing/useListState";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { DropdownMenu, type MenuItem } from "./DropdownMenu";
import { Icon } from "./Icon";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  width?: string;
  /** Column is informative but not essential — hidden at narrow widths. */
  secondary?: boolean;
  /**
   * The value the *server* sorts by. Set it and the header becomes a sort control;
   * leave it unset and the header is inert. Never sorts client-side — a page of 25 rows
   * sorted locally is a lie about the other 4,000.
   */
  sortKey?: string;
  /** Right-align — for numbers and dates, where a ragged left edge is harder to scan. */
  align?: "start" | "end";
  /** Excluded from the column chooser, for a column the screen cannot work without. */
  required?: boolean;
}

export type Density = "comfortable" | "compact";

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Names the table for assistive tech. Rendered as a visually-hidden `<caption>`. */
  caption: string;
  onRowClick?: (row: T) => void;
  selectedKey?: string;

  /**
   * Identity for the persisted column/density preferences — "control.jobs". Omit it and
   * the chooser and density control are not offered, which is right for a small fixed
   * table where they would be noise.
   */
  preferenceKey?: string;

  /** Current server sort. Set both this and `onSortChange` to make headers sortable. */
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;

  /** Set both to add the selection column and the bulk-action bar. */
  selection?: Set<string>;
  onSelectionChange?: (selection: Set<string>) => void;
  /**
   * Names each row's checkbox — "Select job job-1" rather than "Select this row".
   * Worth supplying: a screen reader announcing twenty-five identical "Select this row"
   * checkboxes tells the listener nothing about which row they are on.
   */
  selectionLabel?: (row: T) => string;
  /** Names the header checkbox — "Select all jobs on this page". */
  selectAllLabel?: string;
  /** Rendered in the bulk bar when something is selected. Usually `<Button>`s. */
  bulkActions?: (selected: string[]) => ReactNode;

  /** Per-row overflow menu. Return an empty array for a row with no actions. */
  rowActions?: (row: T) => MenuItem[];

  /** Rendered in place of the body when `rows` is empty. */
  empty?: ReactNode;
  /** Refreshing an already-populated table: dims it rather than replacing it with a skeleton. */
  busy?: boolean;
}

/** Above this many rows, only what fits the viewport (plus an overscan) is rendered. */
const VIRTUALIZE_ABOVE = 60;
const ROW_HEIGHT: Record<Density, number> = { comfortable: 41, compact: 33 };
const OVERSCAN = 8;

const isDensity = (value: unknown): value is Density =>
  value === "comfortable" || value === "compact";
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  onRowClick,
  selectedKey,
  preferenceKey,
  sort,
  onSortChange,
  selection,
  onSelectionChange,
  selectionLabel,
  selectAllLabel,
  bulkActions,
  rowActions,
  empty,
  busy = false,
}: DataTableProps<T>) {
  const t = useT();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [density, setDensity] = usePersistentState<Density>(
    `${preferenceKey ?? "table"}.density`,
    "comfortable",
    isDensity,
  );
  const [hiddenColumns, setHiddenColumns] = usePersistentState<string[]>(
    `${preferenceKey ?? "table"}.hidden`,
    [],
    isStringArray,
  );

  const visibleColumns = useMemo(
    () => columns.filter((column) => column.required || !hiddenColumns.includes(column.key)),
    [columns, hiddenColumns],
  );

  const selectable = Boolean(selection && onSelectionChange);
  const selectedKeys = useMemo(() => [...(selection ?? [])], [selection]);
  const pageKeys = useMemo(() => rows.map(rowKey), [rows, rowKey]);
  const allOnPageSelected = pageKeys.length > 0 && pageKeys.every((key) => selection?.has(key));
  const someOnPageSelected = pageKeys.some((key) => selection?.has(key));

  const toggleAll = () => {
    if (!selection || !onSelectionChange) return;
    const next = new Set(selection);
    // Scoped to this page: selecting "all" across pages the client has not fetched would
    // be a claim about rows nobody has seen, and §8 forbids fetching them to find out.
    if (allOnPageSelected) pageKeys.forEach((key) => next.delete(key));
    else pageKeys.forEach((key) => next.add(key));
    onSelectionChange(next);
  };

  const toggleRow = (key: string) => {
    if (!selection || !onSelectionChange) return;
    const next = new Set(selection);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelectionChange(next);
  };

  const nextSort = (column: Column<T>): SortState | null => {
    if (!column.sortKey || !onSortChange) return null;
    if (sort?.key !== column.sortKey) return { key: column.sortKey, order: "asc" };
    return { key: column.sortKey, order: sort.order === "asc" ? "desc" : "asc" };
  };

  /* ── Virtualization ──────────────────────────────────────────────────────────
   * Only above VIRTUALIZE_ABOVE rows. Below it the whole point is moot and the
   * spacer rows would break `:nth-child` striping and browser find-in-page for no gain.
   */
  const virtual = rows.length > VIRTUALIZE_ABOVE;
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  // Deferred so a fast scroll re-renders the window at React's convenience rather than
  // once per scroll event.
  const deferredScrollTop = useDeferredValue(scrollTop);

  useEffect(() => {
    if (!virtual) return;
    const element = scrollRef.current;
    if (!element) return;
    const measure = () => setViewportHeight(element.clientHeight || 600);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [virtual]);

  const onScroll = useCallback(() => {
    if (!virtual) return;
    setScrollTop(scrollRef.current?.scrollTop ?? 0);
  }, [virtual]);

  const rowHeight = ROW_HEIGHT[density];
  const firstVisible = virtual
    ? Math.max(0, Math.floor(deferredScrollTop / rowHeight) - OVERSCAN)
    : 0;
  const lastVisible = virtual
    ? Math.min(rows.length, Math.ceil((deferredScrollTop + viewportHeight) / rowHeight) + OVERSCAN)
    : rows.length;
  const windowRows = virtual ? rows.slice(firstVisible, lastVisible) : rows;
  const padTop = firstVisible * rowHeight;
  const padBottom = (rows.length - lastVisible) * rowHeight;

  const columnCount = visibleColumns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0);

  return (
    <div className="tf-table-frame">
      {selectable && selectedKeys.length > 0 ? (
        <div className="tf-bulk-bar" role="region" aria-label={t("table.bulk.label")}>
          <span className="tf-bulk-bar__count">
            {t("table.bulk.selected", { count: selectedKeys.length })}
          </span>
          <div className="tf-bulk-bar__actions">{bulkActions?.(selectedKeys)}</div>
          <Button variant="ghost" onClick={() => onSelectionChange?.(new Set())}>
            {t("table.bulk.clear")}
          </Button>
        </div>
      ) : null}

      {preferenceKey ? (
        <div className="tf-table-toolbar">
          <DropdownMenu
            label={t("table.columns.label")}
            align="end"
            trigger={
              <>
                <Icon name="settings" size={16} />
                <span>{t("table.columns.label")}</span>
              </>
            }
            items={columns.map<MenuItem>((column) => ({
              id: column.key,
              label: column.header,
              icon: hiddenColumns.includes(column.key) ? null : <Icon name="check" size={16} />,
              disabled: column.required,
              disabledReason: t("table.columns.required"),
              onSelect: () =>
                setHiddenColumns(
                  hiddenColumns.includes(column.key)
                    ? hiddenColumns.filter((key) => key !== column.key)
                    : [...hiddenColumns, column.key],
                ),
            }))}
          />
          <Button
            variant="ghost"
            onClick={() => setDensity(density === "compact" ? "comfortable" : "compact")}
            aria-pressed={density === "compact"}
          >
            <Icon name="menu" size={16} />
            {density === "compact" ? t("table.density.compact") : t("table.density.comfortable")}
          </Button>
        </div>
      ) : null}

      <div
        className="tf-table-wrap"
        ref={scrollRef}
        onScroll={onScroll}
        // A scrollable region needs to be reachable by keyboard, or its content is
        // unreachable for anyone not using a pointer.
        tabIndex={0}
        role="group"
        aria-label={caption}
      >
        <table
          className={[
            "tf-table",
            `tf-table--${density}`,
            busy ? "tf-table--busy" : "",
            selectable ? "tf-table--selectable" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-busy={busy || undefined}
          /*
           * The *true* row count, not the rendered one (W3.4). While virtualizing, the
           * DOM holds a window — a screen reader told there are 60 rows when there are
           * 5,000 is worse off than one told nothing, and it has no way to discover the
           * difference. Paired with `aria-rowindex` on each row so "row 3,412 of 5,000"
           * is answerable from anywhere in the list.
           */
          aria-rowcount={virtual ? rows.length : undefined}
        >
          <caption className="tf-visually-hidden">{caption}</caption>
          <thead>
            <tr>
              {selectable ? (
                <th scope="col" className="tf-table__select-cell">
                  <input
                    type="checkbox"
                    className="tf-checkbox"
                    checked={allOnPageSelected}
                    ref={(node) => {
                      // Indeterminate is a property, not an attribute — React cannot set it.
                      if (node) node.indeterminate = someOnPageSelected && !allOnPageSelected;
                    }}
                    onChange={toggleAll}
                    aria-label={selectAllLabel ?? t("table.select.all")}
                  />
                </th>
              ) : null}

              {visibleColumns.map((column) => {
                const sorted =
                  sort && column.sortKey && sort.key === column.sortKey ? sort.order : undefined;
                const target = nextSort(column);
                return (
                  <th
                    key={column.key}
                    scope="col"
                    style={column.width ? { width: column.width } : undefined}
                    className={[
                      column.secondary ? "tf-table__cell--secondary" : "",
                      column.align === "end" ? "tf-table__cell--end" : "",
                    ]
                      .filter(Boolean)
                      .join(" ") || undefined}
                    aria-sort={
                      column.sortKey
                        ? sorted === "asc"
                          ? "ascending"
                          : sorted === "desc"
                            ? "descending"
                            : "none"
                        : undefined
                    }
                  >
                    {target ? (
                      <button
                        type="button"
                        className="tf-table__sort"
                        onClick={() => onSortChange?.(target)}
                      >
                        {column.header}
                        <Icon
                          name={sorted === "asc" ? "sort-asc" : sorted === "desc" ? "sort-desc" : "sort"}
                          size={14}
                          className={sorted ? "tf-table__sort-icon--active" : "tf-table__sort-icon"}
                        />
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}

              {rowActions ? (
                <th scope="col" className="tf-table__actions-cell">
                  <span className="tf-visually-hidden">{t("table.rowActions.header")}</span>
                </th>
              ) : null}
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 && empty ? (
              <tr>
                <td colSpan={columnCount} className="tf-table__empty">
                  {empty}
                </td>
              </tr>
            ) : null}

            {padTop > 0 ? (
              <tr aria-hidden="true" style={{ height: padTop }}>
                <td colSpan={columnCount} />
              </tr>
            ) : null}

            {windowRows.map((row, offset) => {
              const key = rowKey(row);
              const selected = key === selectedKey;
              const checked = selection?.has(key) ?? false;
              return (
                <tr
                  key={key}
                  // 1-based, and counted from the top of the *list* rather than the
                  // window, which is the whole point of announcing it.
                  aria-rowindex={virtual ? firstVisible + offset + 1 : undefined}
                  className={[
                    selected ? "tf-table__row--selected" : "",
                    checked ? "tf-table__row--checked" : "",
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined}
                  aria-selected={onRowClick ? selected : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                >
                  {selectable ? (
                    <td
                      className="tf-table__select-cell"
                      // The checkbox is its own control; a click on it must not also open
                      // the row.
                      onClick={(event) => event.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        className="tf-checkbox"
                        checked={checked}
                        onChange={() => toggleRow(key)}
                        aria-label={selectionLabel?.(row) ?? t("table.select.row")}
                      />
                    </td>
                  ) : null}

                  {visibleColumns.map((column) => (
                    <td
                      key={column.key}
                      className={[
                        column.secondary ? "tf-table__cell--secondary" : "",
                        column.align === "end" ? "tf-table__cell--end" : "",
                      ]
                        .filter(Boolean)
                        .join(" ") || undefined}
                    >
                      {column.render(row)}
                    </td>
                  ))}

                  {rowActions ? (
                    <td
                      className="tf-table__actions-cell"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {(() => {
                        const items = rowActions(row);
                        return items.length > 0 ? (
                          <DropdownMenu label={t("table.rowActions.label")} items={items} />
                        ) : null;
                      })()}
                    </td>
                  ) : null}
                </tr>
              );
            })}

            {padBottom > 0 ? (
              <tr aria-hidden="true" style={{ height: padBottom }}>
                <td colSpan={columnCount} />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Pagination (C2) ───────────────────────────────────────────────────────────
 * What this replaces was Previous / Next: no page numbers, no jump to first or last, and
 * no page-size control — `PAGE_SIZE` was a module constant in 48 places. An operator
 * paging to the end of a job queue clicked Next repeatedly.
 */

export interface PaginationProps {
  start: number;
  size: number;
  total: number;
  onChange: (start: number) => void;
  /** Set to offer the page-size control. The caller owns the value so it can go in the URL. */
  onSizeChange?: (size: PageSize) => void;
}

export function Pagination({ start, size, total, onChange, onSizeChange }: PaginationProps) {
  const t = useT();
  if (total === 0) return null;

  const first = start + 1;
  const last = Math.min(start + size, total);
  const pageCount = Math.max(1, Math.ceil(total / size));
  const page = Math.floor(start / size) + 1;
  const hasPrevious = start > 0;
  const hasNext = last < total;

  return (
    <nav className="tf-pagination" aria-label={t("pagination.label")}>
      <p className="tf-pagination__status" aria-live="polite">
        {t("pagination.status", { first, last, total })}
      </p>

      {onSizeChange ? (
        <label className="tf-pagination__size">
          <span className="tf-pagination__size-label">{t("pagination.perPage")}</span>
          <select
            className="tf-input tf-select"
            value={size}
            onChange={(event) => onSizeChange(Number(event.target.value) as PageSize)}
          >
            {PAGE_SIZES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="tf-pagination__controls">
        <Button
          variant="secondary"
          onClick={() => onChange(0)}
          disabled={!hasPrevious}
          aria-label={t("pagination.first")}
        >
          <Icon name="chevron-left" size={16} />
          <Icon name="chevron-left" size={16} className="tf-pagination__stack" />
        </Button>
        <Button
          variant="secondary"
          onClick={() => onChange(Math.max(0, start - size))}
          disabled={!hasPrevious}
        >
          <Icon name="chevron-left" size={16} />
          {t("pagination.previous")}
        </Button>

        <span className="tf-pagination__page">
          <Badge tone="neutral" subtle>
            {t("pagination.page", { page, pageCount })}
          </Badge>
        </span>

        <Button
          variant="secondary"
          onClick={() => onChange(start + size)}
          disabled={!hasNext}
        >
          {t("pagination.next")}
          <Icon name="chevron-right" size={16} />
        </Button>
        <Button
          variant="secondary"
          // Last *page* start, not `total - size`, which would land mid-page when the
          // total is not a multiple of the page size.
          onClick={() => onChange((pageCount - 1) * size)}
          disabled={!hasNext}
          aria-label={t("pagination.last")}
        >
          <Icon name="chevron-right" size={16} />
          <Icon name="chevron-right" size={16} className="tf-pagination__stack" />
        </Button>
      </div>
    </nav>
  );
}
