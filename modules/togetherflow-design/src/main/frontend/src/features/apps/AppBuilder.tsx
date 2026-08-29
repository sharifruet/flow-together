/**
 * App definition builder (REQUIREMENTS.md §7.4.5).
 *
 * An app is a deployable bundle: one `.app` descriptor plus the process, case and
 * decision models it ships. Publishing zips them client-side and posts the bundle to
 * the app engine, which also deploys each bundled resource to its own engine —
 * verified against a running engine.
 *
 * The app itself is kept as a draft in the same model repository as everything else
 * (category `togetherflow:app`, JSON source), so it can be re-opened and republished
 * rather than being write-only.
 */

import { useCallback, useMemo, useState } from "react";
import { zipSync, strToU8 } from "fflate";
import {
  Badge,
  ApiError,
  AsyncBoundary,
  Button,
  Icon,
  ConfirmDialog,
  SelectInput,
  TextInput,
  bundleFileName,
  modelKindOf,
  useAsync,
  useT,
  useToast,
  type AppApi,
  type ModelApi,
  type ModelResponse,
} from "@togetherflow/common";
import { useConflictPrompt } from "../editors/ConflictPrompt";
import { exportApp } from "./appPackage";
import { EditorMenuBar } from "../editors/EditorMenuBar";
import { isValidVariableName, parseAppDraft, type AppDraft, type AppVariable } from "./appDraft";

export interface AppBuilderProps {
  modelApi: ModelApi;
  appApi: AppApi;
  model: ModelResponse;
  initialSource: string | null;
  loadError?: string | null;
  onBack: () => void;
  /**
   * Discards local changes and re-imports what is stored (W1.1). The parent owns it: a
   * reload is a refetch plus a remount, which resets the editor's undo stack — which is
   * exactly what "take theirs, drop mine" means.
   */
  onReloadSource?: () => void;
  /** Called after a save or deploy; carries the updated draft where one exists. */
  onSaved: (draft?: ModelResponse) => void;
}

export function AppBuilder({
  modelApi,
  appApi,
  model,
  initialSource,
  loadError,
  onBack,
  onReloadSource,
  onSaved,
}: AppBuilderProps) {
  const t = useT();
  const { push } = useToast();
  /* The concurrent-edit guard's user half (W1.1). */
  const conflict = useConflictPrompt({ onReload: () => onReloadSource?.() });

  const parsed = useMemo(() => parseAppDraft(initialSource, model), [initialSource, model]);
  const [edits, setEdits] = useState<{ modelId: string; draft: AppDraft } | null>(null);
  const draft = edits && edits.modelId === model.id ? edits.draft : parsed;

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [publishedToken, setPublishedToken] = useState(0);

  // Only non-app models can be bundled — an app cannot contain another app.
  const models = useAsync(
    async (signal) => {
      const page = await modelApi.list({ size: 200 }, signal);
      return page.data.filter((m) => m.id !== model.id && m.category !== "togetherflow:app");
    },
    [modelApi, model.id],
  );

  /**
   * Every deployed version of this app key, newest first. `latest: false` is the point:
   * the default would show only the current one and hide the history entirely.
   */
  const published = useAsync(
    async (signal) => {
      const page = await appApi.listDefinitions({ latest: false, size: 100 }, signal);
      return page.data
        .filter((definition) => definition.key === draft.key)
        .sort((a, b) => b.version - a.version);
    },
    [appApi, draft.key, publishedToken],
  );

  /** Edits one variable in place, leaving the others untouched. */
  const updateVariable = (index: number, changes: Partial<AppVariable>) =>
    update({
      variables: (draft.variables ?? []).map((variable, i) =>
        i === index ? { ...variable, ...changes } : variable,
      ),
    });

  const update = useCallback(
    (changes: Partial<AppDraft>) => {
      setEdits({ modelId: model.id, draft: { ...draft, ...changes } });
      setDirty(true);
    },
    [draft, model.id],
  );

  const toggleModel = (modelId: string) =>
    update({
      modelIds: draft.modelIds.includes(modelId)
        ? draft.modelIds.filter((id) => id !== modelId)
        : [...draft.modelIds, modelId],
    });

  /**
   * W2.3 (I6): hands the app and everything it bundles to the user as one archive.
   *
   * Deliberately not the engine's deployment bundle — that one is shaped for the app
   * engine and carries no keys, versions or draft metadata, so a round trip through it
   * would lose what an author cares about. See `appPackage.ts`.
   */
  const [exporting, setExporting] = useState(false);
  const exportPackage = useCallback(async () => {
    setExporting(true);
    try {
      const bundled = (models.data ?? []).filter((candidate) =>
        draft.modelIds.includes(candidate.id),
      );
      const withSources = await Promise.all(
        bundled.map(async (bundledModel) => ({
          model: bundledModel,
          source: await modelApi.getSource(bundledModel.id),
        })),
      );
      const bytes = exportApp({
        app: model,
        appSource: JSON.stringify(draft, null, 2),
        // A model whose source failed to load is omitted rather than packaged empty —
        // an archive containing a blank process is worse than one missing it.
        models: withSources.filter(
          (entry): entry is { model: ModelResponse; source: string } => entry.source !== null,
        ),
      });
      const blob = new Blob([bytes as BlobPart], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${draft.key || model.id}.tfapp.zip`;
      link.click();
      URL.revokeObjectURL(url);
      push({ tone: "success", message: t("app.exported", { name: draft.name || model.id }) });
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({ tone: "error", message: apiError?.message ?? t("app.exportFailed") });
    } finally {
      setExporting(false);
    }
  }, [models.data, draft, model, modelApi, push, t]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const written = await conflict.guard(async (overwrite) => {
        await modelApi.saveSource(model.id, JSON.stringify(draft, null, 2), { overwrite });
        return true;
      });
      // Refused: someone else saved since this builder last read.
      if (!written) return false;
      setDirty(false);
      push({ tone: "success", message: t("editor.saved.toast") });
      onSaved();
      return true;
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? t("app.saveFailed"),
        reference: apiError?.correlationId,
      });
      return false;
    } finally {
      setSaving(false);
    }
  }, [modelApi, model.id, draft, push, onSaved, t, conflict]);

  const publish = async () => {
    setPublishing(true);
    try {
      // Save first, so publishing never ships something different from the draft.
      const written = await conflict.guard(async (overwrite) => {
        await modelApi.saveSource(model.id, JSON.stringify(draft, null, 2), { overwrite });
        return true;
      });
      // A refused save must stop the publish: shipping a bundle built from a draft the
      // server rejected would be the same data loss one step further along.
      if (!written) return;
      setDirty(false);

      const selected = (models.data ?? []).filter((m) => draft.modelIds.includes(m.id));
      const files: Record<string, Uint8Array> = {
        [`${draft.key}.app`]: strToU8(
          JSON.stringify(
            {
              key: draft.key,
              name: draft.name,
              description: draft.description,
              theme: draft.theme || "default",
              icon: draft.icon || "glyphicon-cog",
            },
            null,
            2,
          ),
        ),
      };

      const missing: string[] = [];
      for (const bundled of selected) {
        const source = await modelApi.getSource(bundled.id);
        if (!source) {
          missing.push(bundled.name || bundled.id);
          continue;
        }
        files[bundleFileName(modelKindOf(bundled), bundled.key || bundled.id)] = strToU8(source);
      }

      if (missing.length > 0) {
        // Publishing a bundle that silently omits a model is worse than refusing.
        push({
          tone: "error",
          message: t("app.cannotPublish", { models: missing.join(", ") }),
        });
        return;
      }

      const deployment = await appApi.deployBundle(zipSync(files), draft.key);
      setPublishedToken((n) => n + 1);
      push({
        tone: "success",
        message: t("app.published", { name: draft.name, count: selected.length }),
      });
      onSaved();
      return deployment;
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? (cause as Error).message ?? t("app.publishFailed"),
        reference: apiError?.correlationId,
      });
    } finally {
      setPublishing(false);
    }
  };

  const busy = saving || publishing;
  const keyError = !/^[A-Za-z_][\w.-]*$/.test(draft.key)
    ? t("app.field.keyError")
    : undefined;

  return (
    <section className="tf-panel" aria-label={t("editor.editing", { name: model.name || model.id })}>
      {/* W2.3 (I8): one menu bar, shared by all six editors. */}
      <EditorMenuBar
        title={draft.name || model.id}
        status={dirty ? t("editor.unsaved") : t("app.definition")}
        onBack={() => (dirty ? setConfirmLeave(true) : onBack())}
        onSave={() => void save()}
        saving={saving}
        ready={!keyError}
        extra={
          <Button variant="secondary" loading={exporting} onClick={() => void exportPackage()}>
            <Icon name="download" size={16} />
            {t("app.export")}
          </Button>
        }
        primary={{
          label: t("action.publish"),
          run: () => setConfirmPublish(true),
          busy: publishing,
        }}
      />

      {loadError ? (
        <p className="tf-detail__note tf-detail__note--error" role="alert">
          {loadError}
        </p>
      ) : null}

      <div className="tf-app-builder">
        <section>
          <h2 className="tf-panel__section-title">{t("app.details")}</h2>
          <TextInput
            label={t("app.field.name")}
            value={draft.name}
            disabled={busy}
            onChange={(event) => update({ name: event.target.value })}
          />
          <TextInput
            label={t("app.field.key")}
            value={draft.key}
            disabled={busy}
            error={keyError}
            hint={t("app.field.key.hint")}
            onChange={(event) => update({ key: event.target.value })}
          />
          <TextInput
            label={t("app.field.description")}
            value={draft.description ?? ""}
            disabled={busy}
            onChange={(event) => update({ description: event.target.value })}
          />
          <TextInput
            label={t("app.field.icon")}
            value={draft.icon ?? ""}
            disabled={busy}
            hint={t("app.field.icon.hint")}
            onChange={(event) => update({ icon: event.target.value })}
          />
          {/* W2.3 (I7): theme, tags and display order — the depth Enterprise's app
              editor has and ours did not. All three are draft-only: the engine's app
              deployment reads none of them, so they describe the app here rather than
              once deployed, and the hints say so. */}
          <TextInput
            label={t("app.field.theme")}
            value={draft.theme ?? ""}
            disabled={busy}
            hint={t("app.field.theme.hint")}
            onChange={(event) => update({ theme: event.target.value })}
          />
          <TextInput
            label={t("app.field.tags")}
            value={(draft.tags ?? []).join(", ")}
            disabled={busy}
            hint={t("app.field.tags.hint")}
            onChange={(event) =>
              update({
                tags: event.target.value
                  .split(",")
                  .map((tag) => tag.trim())
                  .filter(Boolean),
              })
            }
          />
          <TextInput
            label={t("app.field.displayOrder")}
            type="number"
            value={draft.displayOrder ?? ""}
            disabled={busy}
            hint={t("app.field.displayOrder.hint")}
            onChange={(event) =>
              update({
                displayOrder: event.target.value === "" ? undefined : Number(event.target.value),
              })
            }
          />
        </section>

        <section>
          <h2 className="tf-panel__section-title">
            Models in this app ({draft.modelIds.length})
          </h2>
          <p className="tf-panel__meta">
            Publishing deploys the app and every model inside it, in one step.
          </p>

          <AsyncBoundary
            loading={models.loading}
            error={models.error}
            data={models.data}
            onRetry={models.refetch}
            isEmpty={(list) => list.length === 0}
            empty={
              <p className="tf-muted">
                No other models exist yet. Create a process, case or decision first.
              </p>
            }
          >
            {(list) => (
              <ul className="tf-app-models">
                {list.map((candidate) => {
                  const checked = draft.modelIds.includes(candidate.id);
                  return (
                    <li key={candidate.id}>
                      <label className="tf-app-models__item">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={busy}
                          onChange={() => toggleModel(candidate.id)}
                        />
                        <span className="tf-app-models__name">
                          {candidate.name || candidate.key || candidate.id}
                        </span>
                        <Badge tone="info">
                          {modelKindOf(candidate).toUpperCase()}
                        </Badge>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </AsyncBoundary>
        </section>
      </div>

      {/*
        What is actually live, as opposed to what this draft says. Publishing creates a
        new version rather than mutating one, so seeing the version history is the only
        way to tell whether the draft has been published since it was last edited.
      */}
      <section className="tf-panel__section">
        <h2 className="tf-panel__section-title">{t("app.variables")}</h2>
        {/*
          Draft-only, and it says so. This distribution's app engine reads no app-level
          variables, so these document what the app expects rather than seeding anything
          — and a variable that looks configured but is never set is worse than absent.
        */}
        <p className="tf-muted">{t("app.variables.hint")}</p>

        {(draft.variables ?? []).map((variable, index) => (
          <div className="tf-inline-form" key={index}>
            <TextInput
              label={t("app.variable.name")}
              value={variable.name}
              disabled={saving}
              error={
                variable.name !== "" && !isValidVariableName(variable.name)
                  ? t("app.variable.name.invalid")
                  : undefined
              }
              onChange={(event) => updateVariable(index, { name: event.target.value })}
            />
            <SelectInput
              label={t("app.variable.type")}
              value={variable.type}
              disabled={saving}
              onChange={(event) =>
                updateVariable(index, { type: event.target.value as AppVariable["type"] })
              }
            >
              {(["string", "integer", "double", "boolean", "date"] as const).map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </SelectInput>
            <SelectInput
              label={t("app.variable.mode")}
              hint={t("app.variable.mode.hint")}
              value={variable.mode}
              disabled={saving}
              onChange={(event) =>
                updateVariable(index, { mode: event.target.value as AppVariable["mode"] })
              }
            >
              <option value="value">{t("app.variable.mode.value")}</option>
              <option value="default">{t("app.variable.mode.default")}</option>
            </SelectInput>
            <TextInput
              label={t("app.variable.value")}
              value={variable.value ?? ""}
              disabled={saving}
              onChange={(event) => updateVariable(index, { value: event.target.value })}
            />
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() =>
                update({ variables: (draft.variables ?? []).filter((_, i) => i !== index) })
              }
            >
              {t("action.remove")}
            </Button>
          </div>
        ))}

        <Button
          variant="secondary"
          disabled={saving}
          onClick={() =>
            update({
              variables: [
                ...(draft.variables ?? []),
                { name: "", type: "string", mode: "default" },
              ],
            })
          }
        >
          {t("app.variable.add")}
        </Button>
      </section>

      <section className="tf-panel__section">
        <h2 className="tf-panel__section-title">{t("app.publishedVersions")}</h2>
        <AsyncBoundary
          loading={published.loading}
          error={published.error}
          data={published.data}
          onRetry={published.refetch}
          isEmpty={(rows) => rows.length === 0}
          empty={
            <p className="tf-muted">
              Never published. Publishing deploys this app and everything in it.
            </p>
          }
        >
          {(rows) => (
            <ul className="tf-versions">
              {rows.map((definition) => (
                <li className="tf-versions__item" key={definition.id}>
                  <Badge tone="info">v{definition.version}</Badge>
                  <span className="tf-versions__name">{definition.name ?? definition.key}</span>
                  <span className="tf-versions__meta">{definition.deploymentId?.slice(0, 8)}</span>
                </li>
              ))}
            </ul>
          )}
        </AsyncBoundary>
      </section>

      <ConfirmDialog
        open={confirmPublish}
        title={t("app.publish.title")}
        description={t("app.publish.description", {
          name: draft.name,
          count: draft.modelIds.length,
        })}
        confirmLabel={t("app.publish.confirm")}
        busy={publishing}
        onCancel={() => setConfirmPublish(false)}
        onConfirm={() => {
          setConfirmPublish(false);
          void publish();
        }}
      />

      <ConfirmDialog
        open={confirmLeave}
        title={t("editor.leave.title")}
        description={t("editor.leave.description", { name: draft.name })}
        confirmLabel={t("editor.leave.confirm")}
        cancelLabel={t("editor.leave.cancel")}
        destructive
        onCancel={() => setConfirmLeave(false)}
        onConfirm={() => {
          setConfirmLeave(false);
          onBack();
        }}
      />

      {/* Reload-or-overwrite, when someone else saved this model (W1.1). */}
      {conflict.prompt}
    </section>
  );
}
