/**
 * Case work (REQUIREMENTS.md §7.1): the cases the signed-in user is involved in.
 *
 * A case is not a task — it is the container the tasks live in. The inbox already shows
 * case *tasks* (the task table is shared across engines, so they arrive tagged
 * `scopeType: "cmmn"`), but until now there was nowhere to see the case itself: what
 * stage it has reached, which milestones have passed, what is waiting on a sentry.
 *
 * Open cases come from the runtime query; completed ones only exist in history, so the
 * two tabs hit different endpoints rather than passing a `finished` flag to one.
 */

import { useEffect, useMemo, useState } from "react";
import {
  AsyncBoundary,
  DataTable,
  EmptyState,
  NoResultsState,
  Pagination,
  formatDateTime,
  useAsync,
  type CaseApi,
  type CaseInstanceResponse,
  type Column,
} from "@togetherflow/common";

const PAGE_SIZE = 25;

export type CaseTab = "open" | "completed";

export interface MyCasesProps {
  caseApi: CaseApi;
  userId: string;
  selectedCaseId?: string;
  onSelectCase: (instance: CaseInstanceResponse) => void;
  refreshToken: number;
}

export function MyCases({
  caseApi,
  userId,
  selectedCaseId,
  onSelectCase,
  refreshToken,
}: MyCasesProps) {
  const [tab, setTab] = useState<CaseTab>("open");
  const [start, setStart] = useState(0);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const request = useMemo(
    () => ({
      start,
      size: PAGE_SIZE,
      involvedUser: userId,
      ...(debounced ? { businessKey: debounced } : {}),
    }),
    [start, userId, debounced],
  );

  const { data, error, loading, refetch } = useAsync(
    (signal) =>
      tab === "open"
        ? caseApi.query(request, signal)
        : caseApi.queryHistoric({ ...request, finished: true }, signal),
    [caseApi, request, tab, refreshToken],
  );

  const columns = useMemo<Column<CaseInstanceResponse>[]>(
    () => [
      {
        key: "name",
        header: "Case",
        render: (instance) => (
          <div className="tf-task-cell">
            <span className="tf-task-cell__name">
              {instance.name || instance.caseDefinitionName || "(untitled case)"}
            </span>
            <span className="tf-task-cell__description">
              {instance.businessKey ? `Ref ${instance.businessKey}` : instance.id.slice(0, 8)}
            </span>
          </div>
        ),
      },
      {
        key: "state",
        header: "State",
        width: "120px",
        render: (instance) => (
          <span className={stateBadgeClass(instance)}>{stateLabel(instance)}</span>
        ),
      },
      {
        key: "started",
        header: tab === "open" ? "Started" : "Ended",
        width: "180px",
        secondary: true,
        render: (instance) =>
          formatDateTime((tab === "open" ? instance.startTime : instance.endTime) ?? undefined),
      },
    ],
    [tab],
  );

  return (
    <section className="tf-inbox" aria-label="My cases">
      <div className="tf-inbox__filters" role="tablist" aria-label="Case state">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "open"}
          className={chipClass(tab === "open")}
          onClick={() => {
            setTab("open");
            setStart(0);
          }}
        >
          Open
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "completed"}
          className={chipClass(tab === "completed")}
          onClick={() => {
            setTab("completed");
            setStart(0);
          }}
        >
          Completed
        </button>

        <div className="tf-inbox__search">
          <label className="tf-visually-hidden" htmlFor="tf-case-search">
            Search cases by reference
          </label>
          <input
            id="tf-case-search"
            className="tf-input"
            type="search"
            placeholder="Search by reference…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setStart(0);
            }}
          />
        </div>
      </div>

      <AsyncBoundary
        loading={loading}
        error={error}
        data={data}
        onRetry={refetch}
        isEmpty={(page) => page.data.length === 0}
        empty={
          debounced ? (
            <NoResultsState
              onClear={() => {
                setSearch("");
                setStart(0);
              }}
            />
          ) : tab === "open" ? (
            <EmptyState
              title="No open cases"
              description="Cases you're involved in will appear here once one is started."
            />
          ) : (
            <EmptyState
              title="No completed cases"
              description="Cases you've been part of will be listed here when they finish."
            />
          )
        }
      >
        {(page) => (
          <>
            <DataTable
              caption={tab === "open" ? "Open cases" : "Completed cases"}
              columns={columns}
              rows={page.data}
              rowKey={(instance) => instance.id}
              onRowClick={onSelectCase}
              selectedKey={selectedCaseId}
            />
            <Pagination
              start={page.start}
              size={page.size || PAGE_SIZE}
              total={page.total}
              onChange={setStart}
            />
          </>
        )}
      </AsyncBoundary>
    </section>
  );
}

function stateLabel(instance: CaseInstanceResponse): string {
  if (instance.endTime) return instance.state === "terminated" ? "Terminated" : "Completed";
  return instance.state ? instance.state[0].toUpperCase() + instance.state.slice(1) : "Active";
}

function stateBadgeClass(instance: CaseInstanceResponse): string {
  const ended = Boolean(instance.endTime);
  const terminated = instance.state === "terminated";
  return [
    "tf-badge",
    terminated ? "tf-badge--danger" : ended ? "tf-badge--done" : "tf-badge--running",
  ].join(" ");
}

function chipClass(active: boolean): string {
  return ["tf-chip", active ? "tf-chip--active" : ""].filter(Boolean).join(" ");
}
