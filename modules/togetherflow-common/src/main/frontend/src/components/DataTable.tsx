/**
 * Server-paged table. Paging is never done client-side — the Flowable list resources
 * all support start/size/sort, and loading unbounded result sets is explicitly
 * disallowed by REQUIREMENTS.md §8.
 */

import type { ReactNode } from "react";
import { useT } from "../i18n/I18nContext";
import { Button } from "./Button";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  width?: string;
  /** Column is informative but not essential — hidden at narrow widths. */
  secondary?: boolean;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  onRowClick?: (row: T) => void;
  selectedKey?: string;
  emptyLabel?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  onRowClick,
  selectedKey,
}: DataTableProps<T>) {
  return (
    <div className="tf-table-wrap">
      <table className="tf-table">
        <caption className="tf-visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={column.width ? { width: column.width } : undefined}
                className={column.secondary ? "tf-table__cell--secondary" : undefined}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row);
            const selected = key === selectedKey;
            return (
              <tr
                key={key}
                className={selected ? "tf-table__row--selected" : undefined}
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
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={column.secondary ? "tf-table__cell--secondary" : undefined}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export interface PaginationProps {
  start: number;
  size: number;
  total: number;
  onChange: (start: number) => void;
}

export function Pagination({ start, size, total, onChange }: PaginationProps) {
  const t = useT();
  if (total === 0) return null;
  const first = start + 1;
  const last = Math.min(start + size, total);
  const hasPrevious = start > 0;
  const hasNext = last < total;

  return (
    <nav className="tf-pagination" aria-label={t("pagination.label")}>
      <p className="tf-pagination__status" aria-live="polite">
        {t("pagination.status", { first, last, total })}
      </p>
      <div className="tf-pagination__controls">
        <Button
          variant="secondary"
          onClick={() => onChange(Math.max(0, start - size))}
          disabled={!hasPrevious}
        >
          {t("pagination.previous")}
        </Button>
        <Button variant="secondary" onClick={() => onChange(start + size)} disabled={!hasNext}>
          {t("pagination.next")}
        </Button>
      </div>
    </nav>
  );
}
