/**
 * Moving execution state (W2.1, ENTERPRISE_PARITY_PLAN E2).
 *
 * `POST /runtime/process-instances/{id}/change-state` takes exactly two lists —
 * `cancelActivityIds` and `startActivityIds` — and this dialog is deliberately shaped like
 * that request rather than around a friendlier metaphor.
 *
 * "Move the token from A to B" reads better and is wrong: the engine allows cancelling
 * without starting (abandon a branch), starting without cancelling (open a parallel one),
 * and either list holding several ids. An abstraction that paired them would be lying
 * about three of the four things an operator uses this for.
 *
 * The cancel side is chosen from what the instance is *actually* at, so it cannot name an
 * activity that is not running. The start side is chosen from the definition's activity
 * ids, because the whole point is to move somewhere the instance is not.
 */

import { useMemo, useState } from "react";
import {
  ApiError,
  AsyncBoundary,
  Button,
  Icon,
  Modal,
  useAsync,
  useI18n,
  useToast,
  type ActivityInstanceResponse,
  type InstanceApi,
  type ProcessInstanceResponse,
  type RepositoryApi,
} from "@togetherflow/common";

export interface ChangeStateDialogProps {
  instanceApi: InstanceApi;
  repositoryApi: RepositoryApi;
  instance: ProcessInstanceResponse;
  activities: ActivityInstanceResponse[];
  onClose: () => void;
  onChanged: () => void;
}

export function ChangeStateDialog({
  instanceApi,
  repositoryApi,
  instance,
  activities,
  onClose,
  onChanged,
}: ChangeStateDialogProps) {
  const { t } = useI18n();
  const { push } = useToast();
  const [cancelIds, setCancelIds] = useState<string[]>([]);
  const [startIds, setStartIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  /** Only what is running can be cancelled. Deduplicated — multi-instance repeats ids. */
  const openActivities = useMemo(() => {
    const seen = new Map<string, ActivityInstanceResponse>();
    for (const activity of activities) {
      if (!activity.endTime && activity.activityId && !seen.has(activity.activityId)) {
        seen.set(activity.activityId, activity);
      }
    }
    return [...seen.values()];
  }, [activities]);

  const definitionActivities = useAsync(
    async (signal) =>
      instance.processDefinitionId
        ? await repositoryApi.listActivityIdsFor(instance.processDefinitionId, signal)
        : [],
    [repositoryApi, instance.processDefinitionId],
  );

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id];

  const apply = async () => {
    setBusy(true);
    try {
      await instanceApi.changeState(instance.id, {
        // Empty lists are omitted rather than sent: the engine treats an empty array as
        // "nothing to do" but an omitted key is what the request means.
        ...(cancelIds.length > 0 ? { cancelActivityIds: cancelIds } : {}),
        ...(startIds.length > 0 ? { startActivityIds: startIds } : {}),
      });
      push({ tone: "success", message: t("changeState.done") });
      onChanged();
      onClose();
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? t("changeState.failed"),
        reference: apiError?.correlationId,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      size="md"
      title={t("changeState.title")}
      description={t("changeState.description")}
      dismissOnBackdrop={false}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t("dialog.cancel")}
          </Button>
          <Button
            variant="danger"
            onClick={() => void apply()}
            loading={busy}
            // Both lists empty is a no-op request; the engine would accept it and nothing
            // would happen, which reads as a silent failure.
            disabled={cancelIds.length === 0 && startIds.length === 0}
          >
            {t("changeState.apply")}
          </Button>
        </>
      }
    >
      <section className="tf-change-state">
        <h3 className="tf-panel__section-title">{t("changeState.cancel")}</h3>
        <p className="tf-muted">{t("changeState.cancel.hint")}</p>
        {openActivities.length === 0 ? (
          <p className="tf-muted">{t("changeState.cancel.none")}</p>
        ) : (
          <ul className="tf-chips">
            {openActivities.map((activity) => {
              const id = activity.activityId ?? "";
              const on = cancelIds.includes(id);
              return (
                <li key={id}>
                  <button
                    type="button"
                    className={`tf-chip${on ? " tf-chip--active" : ""}`}
                    aria-pressed={on}
                    onClick={() => setCancelIds((current) => toggle(current, id))}
                  >
                    {on ? <Icon name="check" size={14} /> : null}
                    {activity.activityName || id}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="tf-change-state">
        <h3 className="tf-panel__section-title">{t("changeState.start")}</h3>
        <p className="tf-muted">{t("changeState.start.hint")}</p>
        <AsyncBoundary
          loading={definitionActivities.loading}
          error={definitionActivities.error}
          data={definitionActivities.data}
          skeletonRows={2}
        >
          {(available) => (
            <ul className="tf-chips">
              {available.map((activity) => {
                const on = startIds.includes(activity.id);
                return (
                  <li key={activity.id}>
                    <button
                      type="button"
                      className={`tf-chip${on ? " tf-chip--active" : ""}`}
                      aria-pressed={on}
                      onClick={() => setStartIds((current) => toggle(current, activity.id))}
                    >
                      {on ? <Icon name="check" size={14} /> : null}
                      {activity.name || activity.id}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </AsyncBoundary>
      </section>
    </Modal>
  );
}
