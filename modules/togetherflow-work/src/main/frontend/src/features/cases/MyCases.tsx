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

import { useMemo, useState } from "react";
import {
  Badge,
  AsyncBoundary,
  DataTable,
  EmptyState,
  NoResultsState,
  Pagination,
  formatDateTime,
  useAsync,
  useDebouncedValue,
  useI18n,
  type CaseApi,
  type CaseInstanceResponse,
  type Column,
  type TFunction,
  type BadgeTone,
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
  const { t, locale } = useI18n();
  const [tab, setTab] = useState<CaseTab>("open");
  const [start, setStart] = useState(0);
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search.trim(), 250);

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
        header: t("cases.column.case"),
        render: (instance) => (
          <div className="tf-task-cell">
            <span className="tf-task-cell__name">
              {instance.name || instance.caseDefinitionName || t("cases.untitled")}
            </span>
            <span className="tf-task-cell__description">
              {instance.businessKey
                ? t("cases.ref", { businessKey: instance.businessKey })
                : instance.id.slice(0, 8)}
            </span>
          </div>
        ),
      },
      {
        key: "state",
        header: t("cases.column.state"),
        width: "120px",
        render: (instance) => (
          <Badge tone={stateBadgeTone(instance)}>{stateLabel(instance, t)}</Badge>
        ),
      },
      {
        key: "started",
        header: tab === "open" ? t("cases.column.started") : t("cases.column.ended"),
        width: "180px",
        secondary: true,
        render: (instance) =>
          formatDateTime(
            (tab === "open" ? instance.startTime : instance.endTime) ?? undefined,
            locale,
          ),
      },
    ],
    [tab, t, locale],
  );

  return (
    <section className="tf-inbox" aria-label={t("cases.label")}>
      <div className="tf-inbox__filters" role="tablist" aria-label={t("cases.stateLabel")}>
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
          {t("cases.tab.open")}
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
          {t("cases.tab.completed")}
        </button>

        <div className="tf-inbox__search">
          <label className="tf-visually-hidden" htmlFor="tf-case-search">
            {t("cases.search.label")}
          </label>
          <input
            id="tf-case-search"
            className="tf-input"
            type="search"
            placeholder={t("cases.search.placeholder")}
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
              title={t("cases.empty.open.title")}
              description={t("cases.empty.open.description")}
            />
          ) : (
            <EmptyState
              title={t("cases.empty.completed.title")}
              description={t("cases.empty.completed.description")}
            />
          )
        }
      >
        {(page) => (
          <>
            <DataTable
              caption={tab === "open" ? t("cases.caption.open") : t("cases.caption.completed")}
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

function stateLabel(instance: CaseInstanceResponse, t: TFunction): string {
  if (instance.endTime) {
    return instance.state === "terminated"
      ? t("cases.state.terminated")
      : t("cases.state.completed");
  }
  // An unrecognised runtime state is shown as the engine reported it rather than
  // guessed at — inventing a translation for a state we don't model would be worse.
  return instance.state ? instance.state[0].toUpperCase() + instance.state.slice(1) : t("cases.state.active");
}

/** C3: the tone, not a class — `Badge` owns how a tone is drawn. */
function stateBadgeTone(instance: CaseInstanceResponse): BadgeTone {
  if (instance.state === "terminated") return "danger";
  return instance.endTime ? "success" : "info";
}

function chipClass(active: boolean): string {
  return ["tf-chip", active ? "tf-chip--active" : ""].filter(Boolean).join(" ");
}
