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
  useI18n,
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
import { VersionHistory } from "./VersionHistory";

const PAGE_SIZE = 25;

export interface ModelLibraryProps {
  modelApi: ModelApi;
  onOpen: (model: ModelResponse) => void;
  refreshToken: number;
}

export function ModelLibrary({ modelApi, onOpen, refreshToken }: ModelLibraryProps) {
  const { t, locale } = useI18n();
  const { push } = useToast();
  const [start, setStart] = useState(0);
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search).trim();
  const [creating, setCreating] = useState<ModelKind | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [pendingDelete, setPendingDelete] = useState<ModelResponse | null>(null);
  const [historyFor, setHistoryFor] = useState<ModelResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const query = useMemo(
    () => ({
      start,
      size: PAGE_SIZE,
      // Only working drafts: the model table is versioned natively, so without this the
      // library would list every historical version alongside the one being edited
      // (§7.4.1).
      latestVersion: true,
      ...(debounced ? { nameLike: `%${debounced}%` } : {}),
    }),
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
          message: apiError?.message ?? t("action.failed"),
          reference: apiError?.correlationId,
        });
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [push, t],
  );

  const duplicate = async (model: ModelResponse) => {
    const source = await modelApi.getSource(model.id);
    if (!source) {
      push({ tone: "error", message: t("library.noContentToCopy") });
      return;
    }
    const copy = await run(t("library.duplicated", { name: model.name ?? "" }), async () => {
      const created = await modelApi.create({
        name: t("library.copySuffix", { name: model.name ?? model.id }),
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
          message: t("library.unknownKind", { name: file.name }),
        });
        return;
      }
      const { name, key } = describeImport(file.name, content, kind);
      const created = await run(t("library.imported", { name }), async () => {
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
        push({
          tone: "error",
          message: t("library.noContentToExport", { name: model.name ?? model.id }),
        });
        return;
      }
      exportModel(model, modelKindOf(model), source);
    },
    [modelApi, push, t],
  );

  const columns = useMemo<Column<ModelResponse>[]>(
    () => [
      {
        key: "name",
        header: t("library.column.model"),
        render: (model) => (
          <div className="tf-task-cell">
            <span className="tf-task-cell__name">{model.name || model.key || model.id}</span>
            <span className="tf-task-cell__description">{model.key}</span>
          </div>
        ),
      },
      {
        key: "kind",
        header: t("library.column.type"),
        width: "100px",
        render: (model) => (
          <span className="tf-badge tf-badge--running">{modelKindOf(model).toUpperCase()}</span>
        ),
      },
      {
        key: "version",
        header: t("library.column.version"),
        width: "90px",
        secondary: true,
        render: (model) => `v${model.version ?? 1}`,
      },
      {
        key: "updated",
        header: t("library.column.lastEdited"),
        width: "180px",
        secondary: true,
        render: (model) => formatDateTime(model.lastUpdateTime ?? undefined, locale),
      },
      {
        key: "actions",
        header: "",
        width: "320px",
        render: (model) => (
          <div className="tf-row-actions">
            <Button variant="ghost" onClick={() => onOpen(model)}>
              {t("action.open")}
            </Button>
            <Button variant="ghost" onClick={() => setHistoryFor(model)}>
              {t("library.history.action")}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => void exportOne(model)}>
              {t("action.export")}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => void duplicate(model)}>
              {t("action.duplicate")}
            </Button>
            <Button variant="ghost" onClick={() => setPendingDelete(model)}>
              {t("action.delete")}
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy, onOpen],
  );

  return (
    <section className="tf-panel" aria-label={t("library.label")}>
      <header className="tf-panel__header">
        <div>
          <h1 className="tf-panel__title">{t("library.title")}</h1>
          <p className="tf-panel__meta">
            Drafts you can edit and deploy. Deploying does not delete the draft — keep
            editing and deploy again to publish a new version.
          </p>
        </div>
        <div className="tf-row-actions">
          <Button onClick={() => setCreating("bpmn")}>{t("library.newProcess")}</Button>
          <Button variant="secondary" onClick={() => setCreating("cmmn")}>
            {t("library.new.cmmn")}
          </Button>
          <Button variant="secondary" onClick={() => setCreating("dmn")}>
            {t("library.new.dmn")}
          </Button>
          <Button variant="secondary" onClick={() => setCreating("form")}>
            {t("library.new.form")}
          </Button>
          <Button variant="secondary" onClick={() => setCreating("event")}>
            {t("library.new.event")}
          </Button>
          <Button variant="secondary" onClick={() => setCreating("app")}>
            {t("library.new.app")}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => importRef.current?.click()}>
            {t("action.import")}
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
          {t("library.searchLabel")}
        </label>
        <input
          id="tf-model-search"
          className="tf-input"
          type="search"
          placeholder={t("library.search")}
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
              title={t("library.empty.title")}
              description={t("library.empty.description")}
              action={<Button onClick={() => setCreating("bpmn")}>{t("library.newProcess")}</Button>}
            />
          )
        }
      >
        {(page) => (
          <>
            <DataTable
              caption={t("library.caption")}
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
            const created = await run(t("library.created", { name }), async () => {
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

      {historyFor ? (
        <VersionHistory
          modelApi={modelApi}
          model={historyFor}
          onClose={() => setHistoryFor(null)}
          onRestored={() => {
            setHistoryFor(null);
            setReloadToken((token) => token + 1);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("library.delete.title")}
        description={t("library.delete.description", {
          name: pendingDelete?.name || pendingDelete?.id || "",
        })}
        confirmLabel={t("library.delete.confirm")}
        destructive
        busy={busy}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (target) {
            void run(t("library.deleted", { name: target.name || target.id }), () =>
              modelApi.delete(target.id),
            );
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
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyEdited, setKeyEdited] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const nameError = !name.trim() ? t("library.error.name") : undefined;
  // The key becomes an XML id, so it cannot start with a digit or contain spaces.
  const keyError = !key.trim()
    ? t("library.error.keyRequired")
    : !/^[A-Za-z_][\w.-]*$/.test(key.trim())
      ? t("library.error.keyFormat")
      : undefined;

  return (
    <div className="tf-dialog-backdrop" onMouseDown={onCancel}>
      <form
        className="tf-dialog tf-dialog--form"
        role="dialog"
        aria-modal="true"
        aria-label={t(`library.new.${kind}`)}
        noValidate
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(true);
          if (!nameError && !keyError) onSubmit({ name: name.trim(), key: key.trim() });
        }}
      >
        <h2 className="tf-dialog__title">{t(`library.newTitle.${kind}`)}</h2>

        <TextInput
          label={t("library.field.name")}
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
          label={t("library.field.key")}
          value={key}
          required
          disabled={busy}
          hint={t("library.field.key.hint")}
          error={submitted ? keyError : undefined}
          onChange={(event) => {
            setKeyEdited(true);
            setKey(event.target.value);
          }}
        />

        <div className="tf-dialog__actions">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {t("dialog.cancel")}
          </Button>
          <Button type="submit" loading={busy}>
            {t("library.createAndOpen")}
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
