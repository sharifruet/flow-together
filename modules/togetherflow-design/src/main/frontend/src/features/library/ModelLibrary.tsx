/**
 * Model library (REQUIREMENTS.md §7.4.1): the draft models this deployment holds,
 * across every language, with create / open / duplicate / delete.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  AsyncBoundary,
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  DropdownMenu,
  EmptyState,
  Icon,
  NoResultsState,
  PageHeader,
  Pagination,
  TextInput,
  formatDateTime,
  useAsync,
  useI18n,
  useDebouncedValue,
  useListState,
  usePersistentState,
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
import { RelationsPanel } from "./RelationsPanel";
import { collectTags, readMeta, writeMeta } from "./modelMeta";
import type { RelationIndex } from "./modelRelations";


/** What the query string carries for this list (W1.3, F1). */
interface LibraryView {
  [key: string]: string;
  q: string;
  /** W2.3 (I9): tag filter, applied client-side — see the note where it is used. */
  tag: string;
}

const DEFAULT_VIEW: LibraryView = { q: "", tag: "" };

export interface ModelLibraryProps {
  modelApi: ModelApi;
  onOpen: (model: ModelResponse) => void;
  /** Reports the model count for the nav badge (B3). */
  onCount?: (total: number) => void;
  refreshToken: number;
}

export function ModelLibrary({ modelApi, onOpen, onCount, refreshToken }: ModelLibraryProps) {
  const { t, locale } = useI18n();
  const { push } = useToast();
  const list = useListState<LibraryView>({
    defaults: DEFAULT_VIEW,
    defaultSort: { key: "lastUpdateTime", order: "desc" },
    preferenceKey: "design.library",
  });
  const search = list.filters.q;
  const setStart = list.setStart;
  const debounced = useDebouncedValue(search).trim();
  const [creating, setCreating] = useState<ModelKind | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [pendingDelete, setPendingDelete] = useState<ModelResponse | null>(null);
  /** W2.3: I4 relations, I9's card/table toggle and tag filter. */
  const [relationsFor, setRelationsFor] = useState<ModelResponse | null>(null);
  /** Filled once the relations panel has been opened; see `referrersOf`. */
  const [relations, setRelations] = useState<RelationIndex | null>(null);
  const [layout, setLayout] = usePersistentState<"cards" | "table">(
    "design.library.layout",
    // Table by default: it carries every row action, and a card view that only opens
    // would be a downgrade for anyone who arrived expecting the old screen.
    "table",
    (value): value is "cards" | "table" => value === "cards" || value === "table",
  );
  const [historyFor, setHistoryFor] = useState<ModelResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const query = useMemo(
    () => ({
      start: list.start,
      size: list.size,
      sort: list.sort?.key as "lastUpdateTime" | undefined,
      order: list.sort?.order,
      // Only working drafts: the model table is versioned natively, so without this the
      // library would list every historical version alongside the one being edited
      // (§7.4.1).
      latestVersion: true,
      ...(debounced ? { nameLike: `%${debounced}%` } : {}),
    }),
    [list.start, list.size, list.sort, debounced],
  );

  const { data, error, loading, refetch } = useAsync(
    (signal) => modelApi.list(query, signal),
    [modelApi, query, reloadToken, refreshToken],
  );

  useEffect(() => {
    if (data) onCount?.(data.total);
  }, [data, onCount]);

  const allTags = useMemo(() => collectTags(data?.data ?? []), [data]);

  /*
   * I4: "a delete that would break a reference says so."
   *
   * Answered from the relation index built over sources already fetched for the panel —
   * and where none has been built yet, this is empty, so the warning is *best-effort in
   * the same way the panel is*. It never claims a model is unreferenced; it only warns
   * when it knows one is.
   */
  const referrersOf = useCallback(
    (model: ModelResponse) => relations?.usedBy.get(model.id) ?? [],
    [relations],
  );

  /*
   * Tag filtering is client-side, and that is a real limitation rather than a shortcut:
   * tags live in `metaInfo`, which the engine stores as opaque text and cannot query. So
   * this filters the page you are on, not the whole library. Said plainly in the UI
   * rather than left to be discovered on page two.
   */
  const visible = useMemo(() => {
    const rows = data?.data ?? [];
    if (!list.filters.tag) return rows;
    return rows.filter((model) => (readMeta(model).tags ?? []).includes(list.filters.tag));
  }, [data, list.filters.tag]);

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
          <Badge tone="info">{modelKindOf(model).toUpperCase()}</Badge>
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
            <Button variant="ghost" onClick={() => setRelationsFor(model)}>
              {t("relations.action")}
            </Button>
            {/* W2.3 (I5): a flag in metaInfo. The engine never reads metaInfo, which is
                what makes it usable for this — and why W3.1 must not use it for
                workspaces, where the lack of enforcement would matter. */}
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void run(
                  readMeta(model).template
                    ? t("library.template.cleared", { name: model.name ?? model.id })
                    : t("library.template.marked", { name: model.name ?? model.id }),
                  () =>
                    modelApi.update(model.id, {
                      metaInfo: writeMeta(model, { template: !readMeta(model).template }),
                    }),
                )
              }
            >
              {readMeta(model).template ? t("library.template.clear") : t("library.template.mark")}
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
      <PageHeader
        title={t("library.title")}
        description={t("library.description")}
        meta={
          data ? (
            <Badge tone="info" subtle srLabel={t("library.countLabel", { count: data.total })}>
              {data.total}
            </Badge>
          ) : undefined
        }
        actions={
          <>
          <Button onClick={() => setCreating("bpmn")}>
            <Icon name="add" size={16} />
            {t("library.newProcess")}
          </Button>
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
          </>
        }
      />

      {/* W2.3 (I9): the library was a flat table. Cards, tags and a layout toggle are
          what "a library rather than a list" means. */}
      <div className="tf-library-toolbar">
        <div className="tf-editor__group" role="group" aria-label={t("library.layout")}>
          <Button
            variant="secondary"
            aria-pressed={layout === "cards"}
            onClick={() => setLayout("cards")}
          >
            <Icon name="models" size={16} />
            {t("library.layout.cards")}
          </Button>
          <Button
            variant="secondary"
            aria-pressed={layout === "table"}
            onClick={() => setLayout("table")}
          >
            <Icon name="menu" size={16} />
            {t("library.layout.table")}
          </Button>
        </div>

        {allTags.length > 0 ? (
          <ul className="tf-chips" aria-label={t("library.tags")}>
            {allTags.map((tag) => {
              const on = list.filters.tag === tag;
              return (
                <li key={tag}>
                  <button
                    type="button"
                    className={`tf-chip${on ? " tf-chip--active" : ""}`}
                    aria-pressed={on}
                    // Clicking the active tag clears it — a filter you cannot turn off
                    // needs a second control nobody looks for.
                    onClick={() => list.setFilters({ tag: on ? "" : tag })}
                  >
                    {tag}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

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
              illustration="no-models"
              title={t("library.empty.title")}
              description={t("library.empty.description")}
              action={<Button onClick={() => setCreating("bpmn")}>{t("library.newProcess")}</Button>}
            />
          )
        }
      >
        {(page) => (
          <>
            {layout === "cards" ? (
              <ul className="tf-cards tf-model-cards">
                {visible.map((model) => {
                  const meta = readMeta(model);
                  return (
                    <li key={model.id}>
                      <div className="tf-card tf-model-card">
                        <span className="tf-model-card__head">
                          <Badge tone="info">{modelKindOf(model).toUpperCase()}</Badge>
                          {meta.template ? (
                            <Badge tone="success" subtle>
                              {t("library.template")}
                            </Badge>
                          ) : null}
                          <span className="tf-model-card__menu">
                            <DropdownMenu
                              label={t("library.actionsFor", {
                                name: model.name || model.key || model.id,
                              })}
                              items={[
                                {
                                  id: "open",
                                  label: t("action.open"),
                                  onSelect: () => onOpen(model),
                                },
                                {
                                  id: "history",
                                  label: t("library.history.action"),
                                  onSelect: () => setHistoryFor(model),
                                },
                                {
                                  id: "relations",
                                  label: t("relations.action"),
                                  onSelect: () => setRelationsFor(model),
                                },
                                {
                                  id: "delete",
                                  label: t("action.delete"),
                                  destructive: true,
                                  onSelect: () => setPendingDelete(model),
                                },
                              ]}
                            />
                          </span>
                        </span>
                        <button
                          type="button"
                          className="tf-model-card__open"
                          onClick={() => onOpen(model)}
                        >
                        <span className="tf-card__title">{model.name || model.key || model.id}</span>
                        <span className="tf-card__meta">
                          {model.key} · v{model.version ?? 1}
                        </span>
                        {meta.description ? (
                          <span className="tf-model-card__description">{meta.description}</span>
                        ) : null}
                        </button>
                        {meta.tags?.length ? (
                          <span className="tf-model-card__tags">
                            {meta.tags.map((tag) => (
                              <Badge key={tag} tone="neutral" subtle>
                                {tag}
                              </Badge>
                            ))}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
            <DataTable
              caption={t("library.caption")}
              preferenceKey="design.library"
              columns={columns}
              rows={visible}
              rowKey={(model) => model.id}
              sort={list.sort}
              onSortChange={list.setSort}
              busy={loading}
            />
            )}
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

      {relationsFor ? (
        <RelationsPanel
          modelApi={modelApi}
          model={relationsFor}
          models={data?.data ?? []}
          onIndexed={setRelations}
          onOpen={(model) => {
            setRelationsFor(null);
            onOpen(model);
          }}
          onClose={() => setRelationsFor(null)}
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
        description={
          pendingDelete && referrersOf(pendingDelete).length > 0
            ? t("library.delete.referenced", {
                name: pendingDelete.name || pendingDelete.id,
                referrers: referrersOf(pendingDelete)
                  .map((referrer) => referrer.name || referrer.key || referrer.id)
                  .join(", "),
              })
            : t("library.delete.description", {
                name: pendingDelete?.name || pendingDelete?.id || "",
              })
        }
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
