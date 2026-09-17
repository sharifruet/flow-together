import { useCallback, useMemo, useRef, useState } from "react";
import {
  ApiError,
  AsyncBoundary,
  Button,
  DataTable,
  EmptyState,
  FormRenderer,
  Icon,
  Modal,
  NoResultsState,
  PageHeader,
  Pagination,
  asReadOnlyModel,
  formatDateTime,
  initialValues,
  useAsync,
  useDebouncedValue,
  useI18n,
  useListState,
  useToast,
  type Column,
  type FormApi,
  type FormDefinitionResponse,
  type FormDeploymentResponse,
  type FormInstanceResponse,
} from "@togetherflow/common";

/**
 * What the form engine holds (FORM_REQUIREMENTS.md §6.8): the deployed definitions, the
 * deployments that carried them, and every recorded submission. Three tabs over one
 * `/form-api`, each a list with the same filters and paging as the other Control lists.
 */

type FormsTab = "definitions" | "deployments" | "submissions";
const TABS: FormsTab[] = ["definitions", "deployments", "submissions"];

export interface FormsProps {
  /** Undefined when no form API base is configured — the screen then says so. */
  formApi?: FormApi;
  /** Id from `/forms/:formDefinitionId`, so a definition's detail is a link. */
  selectedId?: string;
  onSelect?: (formDefinitionId: string | undefined) => void;
}

export function Forms({ formApi, selectedId, onSelect }: FormsProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<FormsTab>("definitions");

  if (!formApi) {
    return (
      <section className="tf-panel" aria-label={t("forms.label")}>
        <PageHeader title={t("forms.title")} description={t("forms.description")} />
        <EmptyState title={t("forms.unavailable.title")} description={t("forms.unavailable.description")} />
      </section>
    );
  }

  if (selectedId) {
    return <FormDefinitionDetail formApi={formApi} definitionId={selectedId} onBack={() => onSelect?.(undefined)} />;
  }

  return (
    <section className="tf-panel" aria-label={t("forms.label")}>
      <PageHeader title={t("forms.title")} description={t("forms.description")} />

      <div className="tf-inbox__filters" role="tablist" aria-label={t("forms.label")}>
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={["tf-chip", tab === id ? "tf-chip--active" : ""].filter(Boolean).join(" ")}
            onClick={() => setTab(id)}
          >
            {t(`forms.tab.${id}`)}
          </button>
        ))}
      </div>

      {tab === "definitions" ? <Definitions formApi={formApi} onSelect={onSelect} /> : null}
      {tab === "deployments" ? <Deployments formApi={formApi} /> : null}
      {tab === "submissions" ? <Submissions formApi={formApi} /> : null}
    </section>
  );
}

/* ── Definitions ─────────────────────────────────────────────────────────── */

interface DefinitionsView {
  [key: string]: string;
  q: string;
  latest: string;
}

function Definitions({ formApi, onSelect }: { formApi: FormApi; onSelect?: (id: string | undefined) => void }) {
  const { t } = useI18n();
  const list = useListState<DefinitionsView>({
    defaults: { q: "", latest: "true" },
    defaultSort: { key: "name", order: "asc" },
    preferenceKey: "control.forms.definitions",
  });
  const debounced = useDebouncedValue(list.filters.q).trim();
  const latestOnly = list.filters.latest !== "false";

  const query = useMemo(
    () => ({
      start: list.start,
      size: list.size,
      sort: list.sort?.key as "name" | "key" | "version" | undefined,
      order: list.sort?.order,
      ...(latestOnly ? { latest: true } : {}),
      ...(debounced ? { nameLike: `%${debounced}%` } : {}),
    }),
    [list.start, list.size, list.sort, debounced, latestOnly],
  );
  const { data, error, loading, refetch } = useAsync((signal) => formApi.listDefinitions(query, signal), [formApi, query]);

  const columns = useMemo<Column<FormDefinitionResponse>[]>(
    () => [
      {
        key: "name",
        header: t("forms.definitions.column.form"),
        sortKey: "name",
        render: (definition) => (
          <div className="tf-task-cell">
            <span className="tf-task-cell__name">{definition.name || definition.key}</span>
            <span className="tf-task-cell__description tf-mono">{definition.key}</span>
          </div>
        ),
      },
      {
        key: "version",
        header: t("forms.definitions.column.version"),
        sortKey: "version",
        width: "110px",
        align: "end",
        render: (definition) => <span>v{definition.version}</span>,
      },
      {
        key: "deployment",
        header: t("forms.definitions.column.deployment"),
        secondary: true,
        render: (definition) => <span className="tf-mono">{definition.deploymentId ?? "—"}</span>,
      },
      {
        key: "actions",
        header: "",
        width: "100px",
        render: (definition) => (
          <div className="tf-row-actions">
            <Button variant="ghost" onClick={() => onSelect?.(definition.id)}>
              {t("forms.definition.open")}
            </Button>
          </div>
        ),
      },
    ],
    [t, onSelect],
  );

  return (
    <>
      <div className="tf-panel__search">
        <label className="tf-visually-hidden" htmlFor="tf-form-definition-search">
          {t("forms.definitions.searchLabel")}
        </label>
        <input
          id="tf-form-definition-search"
          className="tf-input"
          type="search"
          placeholder={t("forms.definitions.search")}
          value={list.filters.q}
          onChange={(event) => list.setFilters({ q: event.target.value })}
        />
        <label className="tf-checkbox">
          <input
            type="checkbox"
            checked={latestOnly}
            onChange={(event) => list.setFilters({ latest: event.target.checked ? "true" : "false" })}
          />
          {t("forms.definitions.latestOnly")}
        </label>
      </div>
      <AsyncBoundary
        loading={loading}
        error={error}
        data={data}
        onRetry={refetch}
        isEmpty={(page) => page.data.length === 0}
        empty={
          list.isFiltered ? (
            <NoResultsState onClear={list.clearFilters} />
          ) : (
            <EmptyState
              illustration="nothing-deployed"
              title={t("forms.definitions.empty.title")}
              description={t("forms.definitions.empty.description")}
            />
          )
        }
      >
        {(page) => (
          <>
            <DataTable
              caption={t("forms.definitions.caption")}
              preferenceKey="control.forms.definitions"
              columns={columns}
              rows={page.data}
              rowKey={(definition) => definition.id}
              onRowClick={(definition) => onSelect?.(definition.id)}
              sort={list.sort}
              onSortChange={list.setSort}
              busy={loading}
            />
            <Pagination
              start={page.start}
              size={page.size || list.size}
              total={page.total}
              onChange={list.setStart}
              onSizeChange={list.setSize}
            />
          </>
        )}
      </AsyncBoundary>
    </>
  );
}

function FormDefinitionDetail({
  formApi,
  definitionId,
  onBack,
}: {
  formApi: FormApi;
  definitionId: string;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const detail = useAsync(
    async (signal) => {
      const [definition, model] = await Promise.all([
        formApi.getDefinition(definitionId, signal),
        formApi.getDefinitionModel(definitionId, signal),
      ]);
      return { definition, model };
    },
    [formApi, definitionId],
  );

  return (
    <section className="tf-panel" aria-label={t("forms.label")}>
      <button type="button" className="tf-back" onClick={onBack}>
        {t("forms.definition.back")}
      </button>
      <AsyncBoundary loading={detail.loading} error={detail.error} data={detail.data} onRetry={detail.refetch}>
        {({ definition, model }) => (
          <>
            <header className="tf-panel__header">
              <div>
                <h1 className="tf-panel__title">{definition.name || definition.key}</h1>
                <p className="tf-panel__meta">
                  {t("forms.definition.meta", {
                    key: definition.key,
                    version: definition.version,
                    deployment: definition.deploymentId ?? "—",
                  })}
                </p>
              </div>
              <a className="tf-button tf-button--secondary" href={formApi.definitionResourceUrl(definition.id)} download>
                <Icon name="download" size={16} />
                {t("forms.definition.download")}
              </a>
            </header>

            <section className="tf-panel__section">
              <h2 className="tf-panel__section-title">{t("forms.definition.preview")}</h2>
              <p className="tf-panel__meta">{t("forms.definition.previewBlurb")}</p>
              <FormRenderer id={`tf-form-preview-${definition.id}`} model={model} values={initialValues(model)} onChange={() => undefined} disabled />
            </section>

            <section className="tf-panel__section">
              <h2 className="tf-panel__section-title">{t("forms.definition.json")}</h2>
              <pre className="tf-code">{JSON.stringify(model, null, 2)}</pre>
            </section>
          </>
        )}
      </AsyncBoundary>
    </section>
  );
}

/* ── Deployments ─────────────────────────────────────────────────────────── */

function Deployments({ formApi }: { formApi: FormApi }) {
  const { t, locale } = useI18n();
  const { push } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const list = useListState<{ [key: string]: string; q: string }>({
    defaults: { q: "" },
    defaultSort: { key: "deployTime", order: "desc" },
    preferenceKey: "control.forms.deployments",
  });
  const debounced = useDebouncedValue(list.filters.q).trim();
  const [pendingDelete, setPendingDelete] = useState<FormDeploymentResponse | null>(null);
  const [cascade, setCascade] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const query = useMemo(
    () => ({
      start: list.start,
      size: list.size,
      sort: list.sort?.key as "deployTime" | "name" | undefined,
      order: list.sort?.order,
      ...(debounced ? { nameLike: `%${debounced}%` } : {}),
    }),
    [list.start, list.size, list.sort, debounced],
  );
  const { data, error, loading, refetch } = useAsync(
    (signal) => formApi.listDeployments(query, signal),
    [formApi, query, reloadToken],
  );

  const run = useCallback(
    async (message: string, action: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await action();
        push({ tone: "success", message });
        setReloadToken((token) => token + 1);
      } catch (cause) {
        const apiError = cause instanceof ApiError ? cause : undefined;
        push({ tone: "error", message: apiError?.message ?? t("action.failed"), reference: apiError?.correlationId });
      } finally {
        setBusy(false);
      }
    },
    [push, t],
  );

  const columns = useMemo<Column<FormDeploymentResponse>[]>(
    () => [
      {
        key: "name",
        header: t("forms.deployments.column.deployment"),
        sortKey: "name",
        render: (deployment) => (
          <div className="tf-task-cell">
            <span className="tf-task-cell__name">{deployment.name || deployment.id}</span>
            <span className="tf-task-cell__description tf-mono">{deployment.id}</span>
          </div>
        ),
      },
      {
        key: "time",
        header: t("forms.deployments.column.deployed"),
        sortKey: "deployTime",
        width: "180px",
        secondary: true,
        render: (deployment) => formatDateTime(deployment.deploymentTime ?? undefined, locale),
      },
      {
        key: "parent",
        header: t("forms.deployments.column.parent"),
        secondary: true,
        render: (deployment) =>
          deployment.parentDeploymentId && deployment.parentDeploymentId !== deployment.id ? (
            <span className="tf-mono">{deployment.parentDeploymentId}</span>
          ) : (
            <span className="tf-muted">{t("forms.deployments.standalone")}</span>
          ),
      },
      {
        key: "actions",
        header: "",
        width: "100px",
        render: (deployment) => (
          <div className="tf-row-actions">
            <Button
              variant="ghost"
              onClick={() => {
                setCascade(false);
                setPendingDelete(deployment);
              }}
            >
              {t("action.delete")}
            </Button>
          </div>
        ),
      },
    ],
    [t, locale],
  );

  return (
    <>
      <div className="tf-panel__search">
        <input
          ref={fileInput}
          id="tf-form-deployment-file"
          className="tf-visually-hidden"
          type="file"
          accept=".form,.zip,.bar"
          multiple
          disabled={busy}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length === 0) return;
            void run(t("forms.deployments.deployed", { name: files.map((file) => file.name).join(", ") }), async () => {
              await formApi.deploy(files);
              if (fileInput.current) fileInput.current.value = "";
            });
          }}
        />
        <Button loading={busy} onClick={() => fileInput.current?.click()}>
          <Icon name="upload" size={16} />
          {t("forms.deployments.deployFile")}
        </Button>
      </div>
      <AsyncBoundary
        loading={loading}
        error={error}
        data={data}
        onRetry={refetch}
        isEmpty={(page) => page.data.length === 0}
        empty={
          list.isFiltered ? (
            <NoResultsState onClear={list.clearFilters} />
          ) : (
            <EmptyState
              illustration="nothing-deployed"
              title={t("forms.deployments.empty.title")}
              description={t("forms.deployments.empty.description")}
            />
          )
        }
      >
        {(page) => (
          <>
            <DataTable
              caption={t("forms.deployments.caption")}
              preferenceKey="control.forms.deployments"
              columns={columns}
              rows={page.data}
              rowKey={(deployment) => deployment.id}
              sort={list.sort}
              onSortChange={list.setSort}
              busy={loading}
            />
            <Pagination
              start={page.start}
              size={page.size || list.size}
              total={page.total}
              onChange={list.setStart}
              onSizeChange={list.setSize}
            />
          </>
        )}
      </AsyncBoundary>

      {pendingDelete ? (
        <Modal
          open
          size="sm"
          role="alertdialog"
          title={t("forms.deployments.delete.title")}
          description={t("forms.deployments.delete.summary", { name: pendingDelete.name || pendingDelete.id })}
          onClose={() => setPendingDelete(null)}
          actions={
            <>
              <Button variant="secondary" onClick={() => setPendingDelete(null)} disabled={busy}>
                {t("dialog.cancel")}
              </Button>
              <Button
                variant="danger"
                loading={busy}
                onClick={() => {
                  const target = pendingDelete;
                  setPendingDelete(null);
                  void run(t("forms.deployments.deleted", { name: target.name || target.id }), () =>
                    formApi.deleteDeployment(target.id, cascade),
                  );
                }}
              >
                {t("forms.deployments.delete.button")}
              </Button>
            </>
          }
        >
          <label className="tf-checkbox tf-checkbox--block">
            <input type="checkbox" checked={cascade} onChange={(event) => setCascade(event.target.checked)} />
            {t("forms.deployments.delete.cascadeLabel")}
          </label>
          <p className="tf-modal__warning" role="note">
            {cascade ? t("forms.deployments.delete.cascade") : t("forms.deployments.delete.noCascade")}
          </p>
        </Modal>
      ) : null}
    </>
  );
}

/* ── Submissions ─────────────────────────────────────────────────────────── */

export interface SubmissionsProps {
  formApi: FormApi;
  /** Narrow to one instance — the process/case detail screens pass theirs. */
  scope?: { processInstanceId?: string; scopeId?: string; scopeType?: string };
  /** Compact mode for embedding in a detail screen: no search, no preferences. */
  embedded?: boolean;
}

export function Submissions({ formApi, scope, embedded = false }: SubmissionsProps) {
  const { t, locale } = useI18n();
  const list = useListState<{ [key: string]: string; by: string }>({
    defaults: { by: "" },
    defaultSort: { key: "submittedDate", order: "desc" },
    preferenceKey: embedded ? "control.forms.submissions.embedded" : "control.forms.submissions",
  });
  const debounced = useDebouncedValue(list.filters.by).trim();
  const [viewing, setViewing] = useState<FormInstanceResponse | null>(null);

  const query = useMemo(
    () => ({
      start: list.start,
      size: list.size,
      sort: "submittedDate" as const,
      order: list.sort?.order ?? ("desc" as const),
      ...(scope ?? {}),
      ...(debounced ? { submittedByLike: `%${debounced}%` } : {}),
    }),
    [list.start, list.size, list.sort, debounced, scope],
  );
  const { data, error, loading, refetch } = useAsync((signal) => formApi.listInstances(query, signal), [formApi, query]);

  // The definitions behind the page's submissions, for a name instead of an id.
  const definitionIds = useMemo(
    () => Array.from(new Set((data?.data ?? []).map((instance) => instance.formDefinitionId))),
    [data],
  );
  const definitions = useAsync(
    async (signal) => {
      const entries = await Promise.all(
        definitionIds.map((id) => formApi.getDefinition(id, signal).catch(() => null)),
      );
      return new Map(entries.filter((d): d is FormDefinitionResponse => d !== null).map((d) => [d.id, d]));
    },
    [formApi, definitionIds],
  );

  const columns = useMemo<Column<FormInstanceResponse>[]>(
    () => [
      {
        key: "form",
        header: t("forms.submissions.column.form"),
        render: (instance) => {
          const definition = definitions.data?.get(instance.formDefinitionId);
          return (
            <div className="tf-task-cell">
              <span className="tf-task-cell__name">{definition?.name || definition?.key || instance.formDefinitionId}</span>
              {definition ? <span className="tf-task-cell__description tf-mono">{definition.key} v{definition.version}</span> : null}
            </div>
          );
        },
      },
      {
        key: "by",
        header: t("forms.submissions.column.submittedBy"),
        width: "160px",
        render: (instance) => instance.submittedBy ?? "—",
      },
      {
        key: "when",
        header: t("forms.submissions.column.submitted"),
        sortKey: "submittedDate",
        width: "180px",
        secondary: true,
        render: (instance) => formatDateTime(instance.submittedDate ?? undefined, locale),
      },
      ...(embedded
        ? []
        : [
            {
              key: "context",
              header: t("forms.submissions.column.context"),
              secondary: true,
              render: (instance: FormInstanceResponse) => (
                <span className="tf-mono">
                  {instance.taskId
                    ? t("forms.submissions.task", { id: instance.taskId })
                    : instance.processInstanceId
                      ? t("forms.submissions.processInstance", { id: instance.processInstanceId })
                      : instance.scopeId
                        ? t("forms.submissions.caseInstance", { id: instance.scopeId })
                        : "—"}
                </span>
              ),
            } satisfies Column<FormInstanceResponse>,
          ]),
      {
        key: "actions",
        header: "",
        width: "90px",
        render: (instance) => (
          <div className="tf-row-actions">
            <Button variant="ghost" onClick={() => setViewing(instance)}>
              {t("forms.submissions.view")}
            </Button>
          </div>
        ),
      },
    ],
    [t, locale, definitions.data, embedded],
  );

  return (
    <>
      {!embedded ? (
        <div className="tf-panel__search">
          <label className="tf-visually-hidden" htmlFor="tf-form-submission-by">
            {t("forms.submissions.filter.submittedBy")}
          </label>
          <input
            id="tf-form-submission-by"
            className="tf-input"
            type="search"
            placeholder={t("forms.submissions.filter.submittedBy")}
            value={list.filters.by}
            onChange={(event) => list.setFilters({ by: event.target.value })}
          />
        </div>
      ) : null}
      <AsyncBoundary
        loading={loading}
        error={error}
        data={data}
        onRetry={refetch}
        isEmpty={(page) => page.data.length === 0}
        empty={
          list.isFiltered ? (
            <NoResultsState onClear={list.clearFilters} />
          ) : embedded ? (
            <p className="tf-muted">{t("forms.submissions.empty.title")}</p>
          ) : (
            <EmptyState title={t("forms.submissions.empty.title")} description={t("forms.submissions.empty.description")} />
          )
        }
      >
        {(page) => (
          <>
            <DataTable
              caption={t("forms.submissions.caption")}
              preferenceKey={embedded ? undefined : "control.forms.submissions"}
              columns={columns}
              rows={page.data}
              rowKey={(instance) => instance.id}
              onRowClick={(instance) => setViewing(instance)}
              sort={list.sort}
              onSortChange={list.setSort}
              busy={loading}
            />
            {embedded && page.total <= page.data.length ? null : (
              <Pagination
                start={page.start}
                size={page.size || list.size}
                total={page.total}
                onChange={list.setStart}
                onSizeChange={list.setSize}
              />
            )}
          </>
        )}
      </AsyncBoundary>
      {viewing ? <SubmissionDialog formApi={formApi} instance={viewing} onClose={() => setViewing(null)} /> : null}
    </>
  );
}

/** One recorded submission, read-only: the definition's fields with the values as sent. */
function SubmissionDialog({
  formApi,
  instance,
  onClose,
}: {
  formApi: FormApi;
  instance: FormInstanceResponse;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const model = useAsync((signal) => formApi.getInstanceModel(instance.id, signal), [formApi, instance.id]);

  return (
    <Modal
      open
      size="lg"
      title={model.data?.name || t("forms.submissions.title")}
      description={t("forms.submissions.meta", {
        by: instance.submittedBy ?? "—",
        when: formatDateTime(instance.submittedDate ?? undefined, locale),
      })}
      onClose={onClose}
      actions={
        <Button variant="secondary" onClick={onClose}>
          {t("forms.submissions.close")}
        </Button>
      }
    >
      <AsyncBoundary loading={model.loading} error={model.error} data={model.data} onRetry={model.refetch}>
        {(submission) => (
          <>
            {submission.selectedOutcome ? (
              <p className="tf-detail__note">{t("forms.submissions.outcome", { outcome: submission.selectedOutcome })}</p>
            ) : null}
            <FormRenderer
              id={`tf-submission-${instance.id}`}
              model={asReadOnlyModel(submission)}
              values={initialValues(submission)}
              onChange={() => undefined}
            />
          </>
        )}
      </AsyncBoundary>
    </Modal>
  );
}

