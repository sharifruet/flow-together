import { useCallback, useMemo, useRef, useState } from "react";
import {
  ApiError,
  AsyncBoundary,
  Button,
  Badge,
  DataTable,
  EmptyState,
  Icon,
  Modal,
  NoResultsState,
  PageHeader,
  Pagination,
  Skeleton,
  formatDateTime,
  useAsync,
  useI18n,
  useDebouncedValue,
  useListState,
  useToast,
  type Column,
  type DeploymentResponse,
  type RepositoryApi,
} from "@togetherflow/common";

/** What the query string carries for this list (W1.3, F1). */
interface DeploymentsView {
  [key: string]: string;
  q: string;
}

const DEFAULT_VIEW: DeploymentsView = { q: "" };

export interface DeploymentsProps {
  repositoryApi: RepositoryApi;
  /** Id from `/deployments/:deploymentId`, so a deployment's resources are a link. */
  selectedId?: string;
  onSelect?: (deploymentId: string | undefined) => void;
}

export function Deployments({ repositoryApi, selectedId, onSelect }: DeploymentsProps) {
  const { t, locale } = useI18n();
  const { push } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const list = useListState<DeploymentsView>({
    defaults: DEFAULT_VIEW,
    defaultSort: { key: "deployTime", order: "desc" },
    preferenceKey: "control.deployments",
  });
  const search = list.filters.q;
  const setStart = list.setStart;
  const debounced = useDebouncedValue(search).trim();
  const [pendingDelete, setPendingDelete] = useState<DeploymentResponse | null>(null);
  const [cascade, setCascade] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const query = useMemo(
    () => ({
      start: list.start,
      size: list.size,
      sort: list.sort?.key,
      order: list.sort?.order,
      ...(debounced ? { nameLike: `%${debounced}%` } : {}),
    }),
    [list.start, list.size, list.sort, debounced],
  );

  const { data, error, loading, refetch } = useAsync(
    (signal) => repositoryApi.listDeployments(query, signal),
    [repositoryApi, query, reloadToken],
  );

  const run = useCallback(
    async (message: string, action: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await action();
        push({ tone: "success", message });
        setReloadToken((t) => t + 1);
      } catch (cause) {
        const apiError = cause instanceof ApiError ? cause : undefined;
        push({
          tone: "error",
          message: apiError?.message ?? t("action.failed"),
          reference: apiError?.correlationId,
        });
      } finally {
        setBusy(false);
      }
    },
    [push, t],
  );

  const columns = useMemo<Column<DeploymentResponse>[]>(
    () => [
      {
        key: "name",
        header: t("deployments.column.deployment"),
        render: (deployment) => (
          <div className="tf-task-cell">
            <span className="tf-task-cell__name">{deployment.name || deployment.id}</span>
            <span className="tf-task-cell__description">{deployment.id}</span>
          </div>
        ),
      },
      {
        key: "time",
        header: t("deployments.column.deployed"),
        width: "180px",
        secondary: true,
        render: (deployment) => formatDateTime(deployment.deploymentTime ?? undefined, locale),
      },
      {
        key: "actions",
        header: "",
        width: "180px",
        render: (deployment) => (
          <div className="tf-row-actions">
            <Button variant="ghost" onClick={() => onSelect?.(deployment.id)}>
              {t("deployments.resources.action")}
            </Button>
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
    [locale, t, onSelect],
  );

  /** The row for the id in the URL, once the page holding it has loaded. */
  const selected = selectedId
    ? (data?.data ?? []).find((deployment) => deployment.id === selectedId)
    : undefined;

  if (selectedId) {
    return selected ? (
      <DeploymentResources
        repositoryApi={repositoryApi}
        deployment={selected}
        onBack={() => onSelect?.(undefined)}
      />
    ) : (
      // A deep link arrives before the list has loaded, and may point at a deployment
      // that is not on the first page.
      <Skeleton rows={6} label={t("deployments.label")} />
    );
  }

  return (
    <section className="tf-panel" aria-label={t("deployments.label")}>
      <PageHeader
        title={t("deployments.title")}
        description={t("deployments.description")}
        meta={
          data ? (
            <Badge tone="info" subtle srLabel={t("deployments.countLabel", { count: data.total })}>
              {data.total}
            </Badge>
          ) : undefined
        }
        actions={
          <>
          <input
            ref={fileInput}
            id="tf-deployment-file"
            className="tf-visually-hidden"
            type="file"
            accept=".bar,.zip,.bpmn,.bpmn20.xml,.cmmn,.cmmn.xml,.dmn,.dmn.xml,.form"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void run(t("deployments.deployed", { name: file.name }), async () => {
                await repositoryApi.upload(file);
                if (fileInput.current) fileInput.current.value = "";
              });
            }}
          />
          <Button loading={busy} onClick={() => fileInput.current?.click()}>
            <Icon name="upload" size={16} />
            {t("deployments.deployFile")}
          </Button>
          </>
        }
      />

      <div className="tf-panel__search">
        <label className="tf-visually-hidden" htmlFor="tf-deployment-search">
          {t("deployments.searchLabel")}
        </label>
        <input
          id="tf-deployment-search"
          className="tf-input"
          type="search"
          placeholder={t("deployments.search")}
          value={search}
          onChange={(event) => list.setFilters({ q: event.target.value })}
        />
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
              title={t("deployments.empty.title")}
              description={t("deployments.empty.description")}
            />
          )
        }
      >
        {(page) => (
          <>
            <DataTable
              caption={t("deployments.caption")}
              preferenceKey="control.deployments"
              columns={columns}
              rows={page.data}
              rowKey={(deployment) => deployment.id}
              onRowClick={(deployment) => onSelect?.(deployment.id)}
              sort={list.sort}
              onSortChange={list.setSort}
              busy={loading}
            />
            <Pagination
              start={page.start}
              size={page.size || list.size}
              total={page.total}
              onChange={setStart}
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
          title={t("deployments.delete.title")}
          description={t("deployments.delete.summary", {
            name: pendingDelete.name || pendingDelete.id,
          })}
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
                  void run(t("deployments.deleted", { name: target.name || target.id }), () =>
                    repositoryApi.deleteDeployment(target.id, cascade),
                  );
                }}
              >
                {t("deployments.delete.button")}
              </Button>
            </>
          }
        >
          <label className="tf-checkbox tf-checkbox--block">
            <input
              type="checkbox"
              checked={cascade}
              onChange={(event) => setCascade(event.target.checked)}
            />
            {t("deployments.delete.cascadeLabel")}
          </label>
          <p className="tf-dialog__warning" role="note">
            {cascade ? t("deployments.delete.cascade") : t("deployments.delete.noCascade")}
          </p>
        </Modal>
      ) : null}
    </section>
  );
}

function DeploymentResources({
  repositoryApi,
  deployment,
  onBack,
}: {
  repositoryApi: RepositoryApi;
  deployment: DeploymentResponse;
  onBack: () => void;
}) {
  const { t, locale } = useI18n();
  const { data, error, loading, refetch } = useAsync(
    (signal) => repositoryApi.listDeploymentResources(deployment.id, signal),
    [repositoryApi, deployment.id],
  );

  return (
    <section className="tf-panel" aria-label={t("deployments.resources.label")}>
      <button type="button" className="tf-back" onClick={onBack}>
        ← Back to all deployments
      </button>
      <header className="tf-panel__header">
        <div>
          <h1 className="tf-panel__title">{deployment.name || deployment.id}</h1>
          <p className="tf-panel__meta">
            {t("deployments.deployedAt", {
              when: formatDateTime(deployment.deploymentTime ?? undefined, locale),
            })}
          </p>
        </div>
      </header>

      <AsyncBoundary
        loading={loading}
        error={error}
        data={data}
        onRetry={refetch}
        isEmpty={(resources) => resources.length === 0}
        empty={
          <EmptyState
            title={t("deployments.resources.empty.title")}
            description={t("deployments.resources.empty.description")}
          />
        }
      >
        {(resources) => (
          <ul className="tf-resources">
            {resources.map((resource) => (
              <li className="tf-resources__item" key={resource.id}>
                <a
                  className="tf-resources__name"
                  href={repositoryApi.resourceDataUrl(deployment.id, resource.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {resource.id}
                </a>
                <span className="tf-resources__meta">
                  {resource.type ?? "resource"}
                  {resource.mediaType ? ` · ${resource.mediaType}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </AsyncBoundary>
    </section>
  );
}
