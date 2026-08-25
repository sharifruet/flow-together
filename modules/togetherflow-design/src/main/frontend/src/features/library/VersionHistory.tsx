/**
 * Model version history (REQUIREMENTS.md §7.4.1).
 *
 * Built on the engine's own model versioning rather than a side table: rows sharing a
 * `key` form a series, the highest version is the working draft, and everything below it
 * is a snapshot taken when a version was cut — on deploy, or explicitly from here.
 *
 * Two things this deliberately does not do:
 *
 * - **Delete a version.** History that can be edited is not history. The library's delete
 *   removes a whole draft; individual versions stay until it does.
 * - **Diff two versions.** Worth having, but a real diff of BPMN XML is a graph
 *   comparison rather than a text one, and a line diff of serialised XML would mostly
 *   report attribute reordering. Better absent than misleading.
 */

import { useState } from "react";
import {
  ApiError,
  AsyncBoundary,
  Button,
  ConfirmDialog,
  EmptyState,
  formatDateTime,
  useAsync,
  useI18n,
  useToast,
  type ModelApi,
  type ModelResponse,
} from "@togetherflow/common";

export interface VersionHistoryProps {
  modelApi: ModelApi;
  model: ModelResponse;
  onClose: () => void;
  /** Fired after a restore, so the library can refresh the version it displays. */
  onRestored: () => void;
}

export function VersionHistory({ modelApi, model, onClose, onRestored }: VersionHistoryProps) {
  const { t, locale } = useI18n();
  const { push } = useToast();
  const [busy, setBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [pendingRestore, setPendingRestore] = useState<ModelResponse | null>(null);

  const versions = useAsync(
    (signal) => modelApi.listVersions(model, signal),
    [modelApi, model.id, model.key, reloadToken],
  );

  const run = async (message: string, action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      push({ tone: "success", message });
      setReloadToken((token) => token + 1);
      onRestored();
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? t("library.history.failed"),
        reference: apiError?.correlationId,
      });
    } finally {
      setBusy(false);
    }
  };

  const currentVersion = model.version ?? 1;

  return (
    <div className="tf-dialog-backdrop" onMouseDown={onClose}>
      <div
        className="tf-dialog tf-dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-label={t("library.history.title", { name: model.name || model.id })}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="tf-dialog__title">
          {t("library.history.title", { name: model.name || model.id })}
        </h2>
        <p className="tf-dialog__description">{t("library.history.blurb")}</p>

        <AsyncBoundary
          loading={versions.loading}
          error={versions.error}
          data={versions.data}
          onRetry={versions.refetch}
          skeletonRows={3}
          isEmpty={(rows) => rows.length === 0}
          empty={
            <EmptyState
              title={t("library.history.empty.title")}
              description={t("library.history.empty.description")}
            />
          }
        >
          {(rows) => (
            <ol className="tf-versions">
              {rows.map((version) => {
                const isDraft = version.id === model.id;
                return (
                  <li
                    className={["tf-versions__item", isDraft ? "is-current" : ""]
                      .filter(Boolean)
                      .join(" ")}
                    key={version.id}
                  >
                    <span className="tf-versions__number">v{version.version ?? 1}</span>
                    <span className="tf-versions__when">
                      {formatDateTime(version.createTime ?? undefined, locale)}
                    </span>
                    {isDraft ? (
                      <span className="tf-badge tf-badge--running">
                        {t("library.history.current")}
                      </span>
                    ) : (
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => setPendingRestore(version)}
                      >
                        {t("library.history.restore")}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </AsyncBoundary>

        <div className="tf-dialog__actions">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void run(t("library.history.saved", { version: currentVersion }), async () => {
                const source = await modelApi.getSource(model.id);
                await modelApi.cutVersion(model, source ?? "");
              })
            }
          >
            {t("library.history.save")}
          </Button>
          <Button onClick={onClose}>{t("action.close")}</Button>
        </div>

        <ConfirmDialog
          open={pendingRestore !== null}
          title={t("library.history.restore.title", { version: pendingRestore?.version ?? 1 })}
          description={t("library.history.restore.description", {
            version: pendingRestore?.version ?? 1,
            current: currentVersion,
          })}
          confirmLabel={t("library.history.restore")}
          busy={busy}
          onCancel={() => setPendingRestore(null)}
          onConfirm={() => {
            const target = pendingRestore;
            setPendingRestore(null);
            if (!target) return;
            void run(
              t("library.history.restored", { version: target.version ?? 1 }),
              () => modelApi.restoreVersion(model, target),
            );
          }}
        />
      </div>
    </div>
  );
}
