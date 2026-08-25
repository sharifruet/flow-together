/**
 * Model library (REQUIREMENTS.md §7.4.1): the draft models this deployment holds,
 * across every language, with create / open / duplicate / delete.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import {
  ApiError,
  AsyncBoundary,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  NoResultsState,
  Pagination,
  TextInput,
  formatDateTime,
  useAsync,
  useDebouncedValue,
  useToast,
  type Column,
  type ModelApi,
  type ModelKind,
  type ModelResponse,
} from "@togetherflow/common";
import { MODEL_CATEGORY, modelKindOf } from "@togetherflow/common";
import { emptyBpmnDiagram, emptyDmnDiagram } from "../bpmn/flowableModdle";
import { emptyCase, serialiseCmmn } from "../cmmn/cmmnModel";
import { emptyAppDraft } from "../apps/appDraft";
import { emptyEventDraft } from "@togetherflow/common";
import { emptyFormModel } from "../forms/formDraft";
import {
  IMPORT_ACCEPT,
  categoryFor,
  describeImport,
  detectKind,
  exportModel,
} from "./importExport";

const PAGE_SIZE = 25;

export interface ModelLibraryProps {
  modelApi: ModelApi;
  onOpen: (model: ModelResponse) => void;
  refreshToken: number;
}

export function ModelLibrary({ modelApi, onOpen, refreshToken }: ModelLibraryProps) {
  const { push } = useToast();
  const [start, setStart] = useState(0);
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search).trim();
  const [creating, setCreating] = useState<ModelKind | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [pendingDelete, setPendingDelete] = useState<ModelResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const query = useMemo(
    () => ({ start, size: PAGE_SIZE, ...(debounced ? { nameLike: `%${debounced}%` } : {}) }),
    [start, debounced],
  );

  const { data, error, loading, refetch } = useAsync(
    (signal) => modelApi.list(query, signal),
    [modelApi, query, reloadToken, refreshToken],
  );

  const run = useCallback(
    async <T,>(message: string, action: () => Promise<T>): Promise<T | undefined> => {
      setBusy(true);
      try {
        const result = await action();
        push({ tone: "success", message });
        setReloadToken((t) => t + 1);
        return result;
      } catch (cause) {
        const apiError = cause instanceof ApiError ? cause : undefined;
        push({
          tone: "error",
          message: apiError?.message ?? "That action could not be completed.",
          reference: apiError?.correlationId,
        });
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [push],
  );

  const duplicate = async (model: ModelResponse) => {
    const source = await modelApi.getSource(model.id);
    if (!source) {
      push({ tone: "error", message: "That model has no saved content to copy." });
      return;
    }
    const copy = await run(`"${model.name}" duplicated.`, async () => {
      const created = await modelApi.create({
        name: `${model.name ?? model.id} (copy)`,
        key: `${model.key ?? "model"}_copy`,
        category: model.category,
        version: 1,
      });
      await modelApi.saveSource(created.id, source);
      return created;
    });
    if (copy) onOpen(copy);
  };

  /**
   * Imports a file as a new draft.
   *
   * The engine's model repository stores opaque bytes, so the content goes in exactly
   * as it arrived — a round trip through an editor would risk changing a model the user
   * only meant to bring in.
   */
  const importFile = useCallback(
    async (file: File) => {
      const content = await file.text();
      const kind = detectKind(file.name, content);
      if (!kind) {
        push({
          tone: "error",
          message: `Can't tell what kind of model "${file.name}" is. Expected BPMN, CMMN, DMN, a form or an event.`,
        });
        return;
      }
      const { name, key } = describeImport(file.name, content, kind);
      const created = await run(`Imported "${name}".`, async () => {
        const model = await modelApi.create({ name, key, category: categoryFor(kind), version: 1 });
        await modelApi.saveSource(model.id, content);
        return model;
      });
      if (created) onOpen(created);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [modelApi, onOpen, push],
  );

  const exportOne = useCallback(
    async (model: ModelResponse) => {
      const source = await modelApi.getSource(model.id);
      if (!source) {
        push({ tone: "error", message: `"${model.name ?? model.id}" has no saved content to export.` });
        return;
      }
      exportModel(model, modelKindOf(model), source);
    },
    [modelApi, push],
  );

  const columns = useMemo<Column<ModelResponse>[]>(
    () => [
      {
        key: "name",
        header: "Model",
        render: (model) => (
          <div className="tf-task-cell">
            <span className="tf-task-cell__name">{model.name || model.key || model.id}</span>
            <span className="tf-task-cell__description">{model.key}</span>
          </div>
        ),
      },
      {
        key: "kind",
        header: "Type",
        width: "100px",
        render: (model) => (
          <span className="tf-badge tf-badge--running">{modelKindOf(model).toUpperCase()}</span>
        ),
      },
      {
        key: "updated",
        header: "Last edited",
        width: "180px",
        secondary: true,
        render: (model) => formatDateTime(model.lastUpdateTime ?? undefined),
      },
      {
        key: "actions",
        header: "",
        width: "220px",
        render: (model) => (
          <div className="tf-row-actions">
            <Button variant="ghost" onClick={() => onOpen(model)}>
              Open
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => void exportOne(model)}>
              Export
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => void duplicate(model)}>
              Duplicate
            </Button>
            <Button variant="ghost" onClick={() => setPendingDelete(model)}>
              Delete
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy, onOpen],
  );

  return (
    <section className="tf-panel" aria-label="Model library">
      <header className="tf-panel__header">
        <div>
          <h1 className="tf-panel__title">Models</h1>
          <p className="tf-panel__meta">
            Drafts you can edit and deploy. Deploying does not delete the draft — keep
            editing and deploy again to publish a new version.
          </p>
        </div>
        <div className="tf-row-actions">
          <Button onClick={() => setCreating("bpmn")}>New process</Button>
          <Button variant="secondary" onClick={() => setCreating("cmmn")}>
            New case
          </Button>
          <Button variant="secondary" onClick={() => setCreating("dmn")}>
            New decision
          </Button>
          <Button variant="secondary" onClick={() => setCreating("form")}>
            New form
          </Button>
          <Button variant="secondary" onClick={() => setCreating("event")}>
            New event
          </Button>
          <Button variant="secondary" onClick={() => setCreating("app")}>
            New app
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => importRef.current?.click()}>
            Import
          </Button>
          {/*
            A hidden input rather than a drop zone: importing is occasional, and the
            native picker is the control people already know.
          */}
          <input
            ref={importRef}
            type="file"
            className="tf-visually-hidden"
            accept={IMPORT_ACCEPT}
            aria-hidden="true"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Reset so re-picking the same file fires change again.
              event.target.value = "";
              if (file) void importFile(file);
            }}
          />
        </div>
      </header>

      <div className="tf-panel__search">
        <label className="tf-visually-hidden" htmlFor="tf-model-search">
          Search models by name
        </label>
        <input
          id="tf-model-search"
          className="tf-input"
          type="search"
          placeholder="Search models…"
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
              title="No models yet"
              description="Create a process or decision model to get started."
              action={<Button onClick={() => setCreating("bpmn")}>New process</Button>}
            />
          )
        }
      >
        {(page) => (
          <>
            <DataTable
              caption="Models"
              columns={columns}
              rows={page.data}
              rowKey={(model) => model.id}
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

      {creating ? (
        <NewModelDialog
          kind={creating}
          busy={busy}
          onCancel={() => setCreating(null)}
          onSubmit={async ({ name, key }) => {
            const kind = creating;
            const created = await run(`"${name}" created.`, async () => {
              const model = await modelApi.create({
                name,
                key,
                category: MODEL_CATEGORY[kind],
                version: 1,
              });
              const xml =
                kind === "bpmn"
                  ? emptyBpmnDiagram(key, name)
                  : kind === "cmmn"
                    ? serialiseCmmn(emptyCase(key, name))
                    : kind === "app"
                      ? JSON.stringify(emptyAppDraft(key, name), null, 2)
                      : kind === "form"
                        ? JSON.stringify(emptyFormModel(key, name), null, 2)
                        : kind === "event"
                          ? JSON.stringify(emptyEventDraft(key, name), null, 2)
                          : emptyDmnDiagram(key, name);
              await modelApi.saveSource(model.id, xml);
              return model;
            });
            setCreating(null);
            if (created) onOpen(created);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this model?"
        description={`The draft "${pendingDelete?.name || pendingDelete?.id || ""}" will be deleted. Anything already deployed from it keeps running — this removes the editable draft only. This can't be undone.`}
        confirmLabel="Delete model"
        destructive
        busy={busy}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (target) {
            void run(`"${target.name || target.id}" deleted.`, () => modelApi.delete(target.id));
          }
        }}
      />
    </section>
  );
}

function NewModelDialog({
  kind,
  busy,
  onCancel,
  onSubmit,
}: {
  kind: ModelKind;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (values: { name: string; key: string }) => void;
}) {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyEdited, setKeyEdited] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const nameError = !name.trim() ? "Give the model a name." : undefined;
  // The key becomes an XML id, so it cannot start with a digit or contain spaces.
  const keyError = !key.trim()
    ? "A key is required."
    : !/^[A-Za-z_][\w.-]*$/.test(key.trim())
      ? "Start with a letter or underscore; letters, digits, dot, dash and underscore only."
      : undefined;

  return (
    <div className="tf-dialog-backdrop" onMouseDown={onCancel}>
      <form
        className="tf-dialog tf-dialog--form"
        role="dialog"
        aria-modal="true"
        aria-label={
          kind === "bpmn"
            ? "New process"
            : kind === "cmmn"
              ? "New case"
              : kind === "app"
                ? "New app"
                : kind === "form"
                  ? "New form"
                  : kind === "event"
                    ? "New event"
                    : "New decision"
        }
        noValidate
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(true);
          if (!nameError && !keyError) onSubmit({ name: name.trim(), key: key.trim() });
        }}
      >
        <h2 className="tf-dialog__title">
          {kind === "bpmn"
            ? "New process model"
            : kind === "cmmn"
              ? "New case model"
              : kind === "app"
                ? "New app"
                : kind === "form"
                  ? "New form"
                  : kind === "event"
                    ? "New event"
                    : "New decision model"}
        </h2>

        <TextInput
          label="Name"
          value={name}
          required
          disabled={busy}
          error={submitted ? nameError : undefined}
          onChange={(event) => {
            const next = event.target.value;
            setName(next);
            // Derive the key until the user takes control of it themselves.
            if (!keyEdited) setKey(slugify(next));
          }}
        />
        <TextInput
          label="Key"
          value={key}
          required
          disabled={busy}
          hint="Used by the engine to identify this model. Can't contain spaces."
          error={submitted ? keyError : undefined}
          onChange={(event) => {
            setKeyEdited(true);
            setKey(event.target.value);
          }}
        />

        <div className="tf-dialog__actions">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Create and open
          </Button>
        </div>
      </form>
    </div>
  );
}

export function slugify(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s-]+/g, "_");
  if (!cleaned) return "";
  // An XML id may not start with a digit.
  return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned;
}
