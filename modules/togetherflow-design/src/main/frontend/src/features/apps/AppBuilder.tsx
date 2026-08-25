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
  ApiError,
  AsyncBoundary,
  Button,
  ConfirmDialog,
  TextInput,
  bundleFileName,
  modelKindOf,
  useAsync,
  useToast,
  type AppApi,
  type ModelApi,
  type ModelResponse,
} from "@togetherflow/common";
import { parseAppDraft, type AppDraft } from "./appDraft";

export interface AppBuilderProps {
  modelApi: ModelApi;
  appApi: AppApi;
  model: ModelResponse;
  initialSource: string | null;
  loadError?: string | null;
  onBack: () => void;
  onSaved: () => void;
}

export function AppBuilder({
  modelApi,
  appApi,
  model,
  initialSource,
  loadError,
  onBack,
  onSaved,
}: AppBuilderProps) {
  const { push } = useToast();
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

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await modelApi.saveSource(model.id, JSON.stringify(draft, null, 2));
      setDirty(false);
      push({ tone: "success", message: "Saved." });
      onSaved();
      return true;
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? "Could not save this app.",
        reference: apiError?.correlationId,
      });
      return false;
    } finally {
      setSaving(false);
    }
  }, [modelApi, model.id, draft, push, onSaved]);

  const publish = async () => {
    setPublishing(true);
    try {
      // Save first, so publishing never ships something different from the draft.
      await modelApi.saveSource(model.id, JSON.stringify(draft, null, 2));
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
          message: `Can't publish: ${missing.join(", ")} ${missing.length === 1 ? "has" : "have"} no saved content.`,
        });
        return;
      }

      const deployment = await appApi.deployBundle(zipSync(files), draft.key);
      setPublishedToken((n) => n + 1);
      push({
        tone: "success",
        message: `Published "${draft.name}" with ${selected.length} model${selected.length === 1 ? "" : "s"}.`,
      });
      onSaved();
      return deployment;
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? (cause as Error).message ?? "Publishing failed.",
        reference: apiError?.correlationId,
      });
    } finally {
      setPublishing(false);
    }
  };

  const busy = saving || publishing;
  const keyError = !/^[A-Za-z_][\w.-]*$/.test(draft.key)
    ? "Start with a letter or underscore; no spaces."
    : undefined;

  return (
    <section className="tf-panel" aria-label={`Editing ${model.name || model.id}`}>
      <button
        type="button"
        className="tf-back"
        onClick={() => (dirty ? setConfirmLeave(true) : onBack())}
      >
        ← Back to models
      </button>

      <header className="tf-panel__header">
        <div>
          <h1 className="tf-panel__title">{draft.name || model.id}</h1>
          <p className="tf-panel__meta" aria-live="polite">
            {dirty ? "Unsaved changes" : "App definition"}
          </p>
        </div>
        <div className="tf-row-actions">
          <Button variant="secondary" loading={saving} onClick={() => void save()}>
            Save
          </Button>
          <Button
            loading={publishing}
            disabled={Boolean(keyError)}
            onClick={() => setConfirmPublish(true)}
          >
            Publish
          </Button>
        </div>
      </header>

      {loadError ? (
        <p className="tf-detail__note tf-detail__note--error" role="alert">
          {loadError}
        </p>
      ) : null}

      <div className="tf-app-builder">
        <section>
          <h2 className="tf-panel__section-title">Details</h2>
          <TextInput
            label="Name"
            value={draft.name}
            disabled={busy}
            onChange={(event) => update({ name: event.target.value })}
          />
          <TextInput
            label="Key"
            value={draft.key}
            disabled={busy}
            error={keyError}
            hint="Identifies the app in the engine."
            onChange={(event) => update({ key: event.target.value })}
          />
          <TextInput
            label="Description"
            value={draft.description ?? ""}
            disabled={busy}
            onChange={(event) => update({ description: event.target.value })}
          />
          <TextInput
            label="Icon"
            value={draft.icon ?? ""}
            disabled={busy}
            hint="Glyph name, e.g. glyphicon-cog."
            onChange={(event) => update({ icon: event.target.value })}
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
                        <span className="tf-badge tf-badge--running">
                          {modelKindOf(candidate).toUpperCase()}
                        </span>
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
        <h2 className="tf-panel__section-title">Published versions</h2>
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
                  <span className="tf-badge tf-badge--running">v{definition.version}</span>
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
        title="Publish this app?"
        description={`"${draft.name}" and its ${draft.modelIds.length} bundled model${draft.modelIds.length === 1 ? "" : "s"} will be deployed to the engine. New instances use these versions; anything already running keeps the version it started on.`}
        confirmLabel="Save and publish"
        busy={publishing}
        onCancel={() => setConfirmPublish(false)}
        onConfirm={() => {
          setConfirmPublish(false);
          void publish();
        }}
      />

      <ConfirmDialog
        open={confirmLeave}
        title="Leave without saving?"
        description={`"${draft.name}" has unsaved changes. Leaving now discards them.`}
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        destructive
        onCancel={() => setConfirmLeave(false)}
        onConfirm={() => {
          setConfirmLeave(false);
          onBack();
        }}
      />
    </section>
  );
}
