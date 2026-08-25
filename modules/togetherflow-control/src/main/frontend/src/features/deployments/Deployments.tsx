import { useCallback, useMemo, useRef, useState } from "react";
import {
  ApiError,
  AsyncBoundary,
  Button,
  DataTable,
  EmptyState,
  NoResultsState,
  Pagination,
  formatDateTime,
  useAsync,
  useDebouncedValue,
  useToast,
  type Column,
  type DeploymentResponse,
  type RepositoryApi,
} from "@togetherflow/common";

const PAGE_SIZE = 25;

export interface DeploymentsProps {
  repositoryApi: RepositoryApi;
}

export function Deployments({ repositoryApi }: DeploymentsProps) {
  const { push } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [start, setStart] = useState(0);
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search).trim();
  const [selected, setSelected] = useState<DeploymentResponse | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DeploymentResponse | null>(null);
  const [cascade, setCascade] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const query = useMemo(
    () => ({ start, size: PAGE_SIZE, ...(debounced ? { nameLike: `%${debounced}%` } : {}) }),
    [start, debounced],
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
          message: apiError?.message ?? "That action could not be completed.",
          reference: apiError?.correlationId,
        });
      } finally {
        setBusy(false);
      }
    },
    [push],
  );

  const columns = useMemo<Column<DeploymentResponse>[]>(
    () => [
      {
        key: "name",
        header: "Deployment",
        render: (deployment) => (
          <div className="tf-task-cell">
            <span className="tf-task-cell__name">{deployment.name || deployment.id}</span>
            <span className="tf-task-cell__description">{deployment.id}</span>
          </div>
        ),
      },
      {
        key: "time",
        header: "Deployed",
        width: "180px",
        secondary: true,
        render: (deployment) => formatDateTime(deployment.deploymentTime ?? undefined),
      },
      {
        key: "actions",
        header: "",
        width: "180px",
        render: (deployment) => (
          <div className="tf-row-actions">
            <Button variant="ghost" onClick={() => setSelected(deployment)}>
              Resources
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setCascade(false);
                setPendingDelete(deployment);
              }}
            >
              Delete
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  if (selected) {
    return (
      <DeploymentResources
        repositoryApi={repositoryApi}
        deployment={selected}
        onBack={() => setSelected(null)}
      />
    );
  }

  return (
    <section className="tf-panel" aria-label="Deployments">
      <header className="tf-panel__header">
        <div>
          <h1 className="tf-panel__title">Deployments</h1>
          <p className="tf-panel__meta">
            What has been deployed to the engine, and the resources inside each one.
          </p>
        </div>
        <div>
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
              void run(`"${file.name}" deployed.`, async () => {
                await repositoryApi.upload(file);
                if (fileInput.current) fileInput.current.value = "";
              });
            }}
          />
          <Button loading={busy} onClick={() => fileInput.current?.click()}>
            Deploy file
          </Button>
        </div>
      </header>

      <div className="tf-panel__search">
        <label className="tf-visually-hidden" htmlFor="tf-deployment-search">
          Search deployments by name
        </label>
        <input
          id="tf-deployment-search"
          className="tf-input"
          type="search"
          placeholder="Search deployments…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setStart(0);
          }}
        />
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
          ) : (
            <EmptyState
              title="Nothing deployed"
              description="Deploy a BPMN, CMMN, DMN or form file to get started."
            />
          )
        }
      >
        {(page) => (
          <>
            <DataTable
              caption="Deployments"
              columns={columns}
              rows={page.data}
              rowKey={(deployment) => deployment.id}
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

      {pendingDelete ? (
        <div className="tf-dialog-backdrop" onMouseDown={() => setPendingDelete(null)}>
          <div
            className="tf-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-label="Delete deployment"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 className="tf-dialog__title">Delete this deployment?</h2>
            <p className="tf-dialog__description">
              "{pendingDelete.name || pendingDelete.id}" and its definitions will be removed.
            </p>
            <label className="tf-checkbox tf-checkbox--block">
              <input
                type="checkbox"
                checked={cascade}
                onChange={(event) => setCascade(event.target.checked)}
              />
              Also delete running instances started from it
            </label>
            <p className="tf-dialog__warning" role="note">
              {cascade
                ? "Every running instance from this deployment will be deleted too. Work in progress is lost."
                : "Without this, the delete fails if any instance is still running."}
            </p>
            <div className="tf-dialog__actions">
              <Button variant="secondary" onClick={() => setPendingDelete(null)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={busy}
                onClick={() => {
                  const target = pendingDelete;
                  setPendingDelete(null);
                  void run(`Deployment "${target.name || target.id}" deleted.`, () =>
                    repositoryApi.deleteDeployment(target.id, cascade),
                  );
                }}
              >
                Delete deployment
              </Button>
            </div>
          </div>
        </div>
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
  const { data, error, loading, refetch } = useAsync(
    (signal) => repositoryApi.listDeploymentResources(deployment.id, signal),
    [repositoryApi, deployment.id],
  );

  return (
    <section className="tf-panel" aria-label="Deployment resources">
      <button type="button" className="tf-back" onClick={onBack}>
        ← Back to all deployments
      </button>
      <header className="tf-panel__header">
        <div>
          <h1 className="tf-panel__title">{deployment.name || deployment.id}</h1>
          <p className="tf-panel__meta">
            Deployed {formatDateTime(deployment.deploymentTime ?? undefined)}
          </p>
        </div>
      </header>

      <AsyncBoundary
        loading={loading}
        error={error}
        data={data}
        onRetry={refetch}
        isEmpty={(resources) => resources.length === 0}
        empty={<EmptyState title="No resources" description="This deployment contains no files." />}
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
