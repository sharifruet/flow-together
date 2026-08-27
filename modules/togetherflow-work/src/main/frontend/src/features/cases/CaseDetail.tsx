/**
 * Case detail (REQUIREMENTS.md §7.1 "Case work"): the plan items, milestones and
 * variables of one case instance.
 *
 * Two things are deliberate here:
 *
 * - **Plan items are nested under their stage.** The engine returns a flat list with a
 *   `stageInstanceId` pointer; presenting it flat would lose the one structural fact
 *   that makes a case readable — what is inside what.
 * - **Only actions the engine will accept, and this audience should have, are offered.**
 *   A plan item blocked on a sentry cannot be started manually (the engine answers "Can
 *   only enable a plan item instance which is in state ENABLED"), so no button appears.
 *   Nor is "trigger" offered on a human task here: the engine accepts it and completes
 *   the task outright, bypassing its form and assignee — an admin escape hatch that
 *   belongs in Control, not beside the task a user is meant to fill in.
 *
 * A completed case has no runtime rows left, so its plan items and live variables are
 * simply absent — the panel says so rather than rendering an empty table.
 */

import { useCallback, useMemo, useState } from "react";
import {
  ApiError,
  AsyncBoundary,
  Badge,
  Button,
  ConfirmDialog,
  Skeleton,
  availablePlanItemActions,
  formatDateTime,
  useAsync,
  useI18n,
  useToast,
  type CaseApi,
  type CaseInstanceResponse,
  type PlanItemAction,
  type PlanItemInstanceResponse,
  type BadgeTone,
  type TFunction,
} from "@togetherflow/common";

export interface CaseDetailProps {
  caseApi: CaseApi;
  /**
   * The row the list already has. Rendered immediately where present, so opening a case
   * from the list does not flash a loading state for data the list is holding.
   */
  instance?: CaseInstanceResponse;
  /**
   * The id from the URL (W1.3). It is the source of truth: a deep link or a refresh
   * arrives with an id and no row, and the pane fetches the instance itself.
   */
  caseId?: string;
  onClose: () => void;
  onChanged: () => void;
}

/** Message-key suffix per action; the copy itself lives in the catalogue. */
const ACTION_KEYS: Record<PlanItemAction, string> = {
  start: "case.action.start",
  enable: "case.action.enable",
  disable: "case.action.disable",
  trigger: "case.action.trigger",
};

export function CaseDetail({
  caseApi,
  instance: given,
  caseId: routeCaseId,
  onClose,
  onChanged,
}: CaseDetailProps) {
  const { t, locale } = useI18n();
  const { push } = useToast();
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [confirmTerminate, setConfirmTerminate] = useState(false);
  const [terminating, setTerminating] = useState(false);
  const [localRefresh, setLocalRefresh] = useState(0);

  const caseId = given?.id ?? routeCaseId;

  /*
   * Only fetched when the list did not hand a row over — i.e. a deep link or a refresh.
   * A completed case has no runtime row, so the historic resource is the fallback rather
   * than an error.
   */
  const fetched = useAsync(
    async (signal) => {
      if (given || !routeCaseId) return undefined;
      try {
        return await caseApi.get(routeCaseId, signal);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        return await caseApi.getHistoric(routeCaseId, signal);
      }
    },
    [caseApi, given, routeCaseId],
  );

  const instance = given ?? fetched.data;
  const ended = Boolean(instance?.endTime);

  const planItems = useAsync(
    async (signal) => (caseId && !ended ? (await caseApi.listPlanItems(caseId, signal)).data : []),
    [caseApi, caseId, ended, localRefresh],
  );

  const stages = useAsync(
    async (signal) => (caseId && !ended ? await caseApi.stageOverview(caseId, signal) : []),
    [caseApi, caseId, ended, localRefresh],
  );

  const variables = useAsync(
    async (signal) => {
      if (!caseId) return [];
      return ended
        ? await caseApi.listHistoricVariables(caseId, signal)
        : await caseApi.listVariables(caseId, signal);
    },
    [caseApi, caseId, ended, localRefresh],
  );

  const refreshAll = useCallback(() => {
    setLocalRefresh((n) => n + 1);
    onChanged();
  }, [onChanged]);

  const runAction = async (item: PlanItemInstanceResponse, action: PlanItemAction) => {
    setBusyItem(item.id);
    try {
      await caseApi.performPlanItemAction(item.id, action);
      push({
        tone: "success",
        message: t("case.action.done", {
          action: t(ACTION_KEYS[action]),
          name: item.name ?? t("case.action.fallbackItem"),
        }),
      });
      refreshAll();
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? t("case.action.failed", { action }),
        reference: apiError?.correlationId,
      });
    } finally {
      setBusyItem(null);
    }
  };

  const terminate = async () => {
    if (!caseId) return;
    setTerminating(true);
    try {
      await caseApi.terminate(caseId);
      push({ tone: "success", message: t("case.terminate.done") });
      onClose();
      onChanged();
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? t("case.terminate.failed"),
        reference: apiError?.correlationId,
      });
    } finally {
      setTerminating(false);
      setConfirmTerminate(false);
    }
  };

  const tree = useMemo(() => buildTree(planItems.data ?? []), [planItems.data]);

  if (!instance) {
    return (
      <section className="tf-detail tf-detail--empty" aria-label={t("case.detail.label")}>
        {routeCaseId && fetched.loading ? (
          <Skeleton rows={4} label={t("case.detail.label")} />
        ) : (
          <>
            <p className="tf-detail__empty-title">{t("case.detail.none.title")}</p>
            <p className="tf-detail__empty-hint">{t("case.detail.none.hint")}</p>
          </>
        )}
      </section>
    );
  }

  return (
    <section
      className="tf-detail"
      aria-label={t("case.detail.for", { name: instance.name ?? instance.id })}
    >
      <header className="tf-detail__header">
        <div>
          <h2 className="tf-detail__title">
            {instance.name || instance.caseDefinitionName || t("case.detail.fallbackName")}
          </h2>
          <p className="tf-detail__meta">
            {instance.businessKey
              ? `${t("cases.ref", { businessKey: instance.businessKey })} · `
              : ""}
            {t("case.meta.started", { when: formatDateTime(instance.startTime, locale) })}
            {instance.startUserId ? t("case.meta.by", { userId: instance.startUserId }) : ""}
            {ended
              ? ` · ${t("case.meta.ended", {
                  when: formatDateTime(instance.endTime ?? undefined, locale),
                })}`
              : ""}
          </p>
        </div>
        <button type="button" className="tf-detail__close" onClick={onClose} aria-label={t("case.detail.close")}>
          ×
        </button>
      </header>

      {/* Progress: stages and milestones, in the order the engine reports them. */}
      <section className="tf-detail__section">
        <h3 className="tf-detail__section-title">{t("case.section.progress")}</h3>
        {ended ? (
          <p className="tf-muted">{t("case.progress.finished")}</p>
        ) : (
          <AsyncBoundary
            loading={stages.loading}
            error={stages.error}
            data={stages.data}
            onRetry={stages.refetch}
            skeletonRows={2}
            isEmpty={(rows) => rows.length === 0}
            empty={<p className="tf-muted">{t("case.progress.none")}</p>}
          >
            {(rows) => (
              <ol className="tf-stages">
                {rows.map((stage) => (
                  <li
                    key={stage.id}
                    className={[
                      "tf-stages__item",
                      stage.ended ? "is-done" : "",
                      stage.current ? "is-current" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <span className="tf-stages__marker" aria-hidden="true" />
                    <span className="tf-stages__name">{stage.name || stage.id}</span>
                    <span className="tf-stages__state">
                      {stage.ended
                        ? t("case.progress.reached", {
                            when: formatDateTime(stage.endTime ?? undefined, locale),
                          })
                        : stage.current
                          ? t("case.progress.inProgress")
                          : t("case.progress.notReached")}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </AsyncBoundary>
        )}
      </section>

      {/* Plan items, nested by stage. */}
      <section className="tf-detail__section">
        <h3 className="tf-detail__section-title">{t("case.section.planItems")}</h3>
        {ended ? (
          <p className="tf-muted">{t("case.planItems.historyOnly")}</p>
        ) : (
          <AsyncBoundary
            loading={planItems.loading}
            error={planItems.error}
            data={tree}
            onRetry={planItems.refetch}
            skeletonRows={3}
            isEmpty={(nodes) => nodes.length === 0}
            empty={<p className="tf-muted">{t("case.planItems.none")}</p>}
          >
            {(nodes) => (
              <PlanItemList
                nodes={nodes}
                busyItem={busyItem}
                onAction={runAction}
                t={t}
              />
            )}
          </AsyncBoundary>
        )}
      </section>

      <section className="tf-detail__section">
        <h3 className="tf-detail__section-title">{t("case.section.data")}</h3>
        <AsyncBoundary
          loading={variables.loading}
          error={variables.error}
          data={variables.data}
          onRetry={variables.refetch}
            skeletonRows={2}
          isEmpty={(rows) => rows.length === 0}
          empty={<p className="tf-muted">{t("case.data.none")}</p>}
        >
          {(rows) => (
            <dl className="tf-variables">
              {rows.map((variable) => (
                <div className="tf-variables__row" key={variable.name}>
                  <dt className="tf-variables__name">{variable.name}</dt>
                  <dd className="tf-variables__value">
                    {variable.value === null || variable.value === undefined
                      ? "—"
                      : String(variable.value)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </AsyncBoundary>
      </section>

      {!ended ? (
        <footer className="tf-detail__actions">
          <Button variant="danger" onClick={() => setConfirmTerminate(true)}>
            {t("case.terminate.confirm")}
          </Button>
        </footer>
      ) : null}

      <ConfirmDialog
        open={confirmTerminate}
        title={t("case.terminate.confirmTitle")}
        description={t("case.terminate.confirmDescription", {
          name: instance.name || instance.caseDefinitionName || instance.id,
        })}
        confirmLabel={t("case.terminate.confirm")}
        destructive
        busy={terminating}
        onCancel={() => setConfirmTerminate(false)}
        onConfirm={() => void terminate()}
      />
    </section>
  );
}

/* ── Plan item tree ──────────────────────────────────────────────────────── */

interface PlanItemNode {
  item: PlanItemInstanceResponse;
  children: PlanItemNode[];
}

/**
 * Nests plan items under the stage that contains them.
 *
 * The engine returns a flat list keyed by `stageInstanceId`. Items whose parent is not
 * in the list (the case plan model itself is not returned as a plan item) become roots,
 * so nothing is dropped even when the shape is unexpected.
 */
export function buildTree(items: PlanItemInstanceResponse[]): PlanItemNode[] {
  const nodes = new Map<string, PlanItemNode>();
  for (const item of items) nodes.set(item.id, { item, children: [] });

  const roots: PlanItemNode[] = [];
  for (const node of nodes.values()) {
    const parentId = node.item.stageInstanceId;
    const parent = parentId ? nodes.get(parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function PlanItemList({
  nodes,
  busyItem,
  onAction,
  t,
  depth = 0,
}: {
  nodes: PlanItemNode[];
  busyItem: string | null;
  onAction: (item: PlanItemInstanceResponse, action: PlanItemAction) => void;
  /** Threaded down rather than hooked: this renders recursively, not once. */
  t: TFunction;
  depth?: number;
}) {
  return (
    <ul className="tf-planitems" style={depth > 0 ? { paddingInlineStart: "1.25rem" } : undefined}>
      {nodes.map(({ item, children }) => {
        // Work never offers "trigger" on a human task: the engine accepts it and
        // completes the task, skipping the form the user is meant to fill in.
        const actions = availablePlanItemActions(item.state, {
          planItemDefinitionType: item.planItemDefinitionType,
        });
        const isOpenTask =
          (item.planItemDefinitionType ?? "").toLowerCase() === "humantask" &&
          (item.state ?? "").toLowerCase() === "active";
        return (
          <li className="tf-planitems__item" key={item.id}>
            <div className="tf-planitems__row">
              <span className="tf-planitems__name">{item.name || item.elementId || item.id}</span>
              <span className="tf-planitems__type">{item.planItemDefinitionType}</span>
              <Badge tone={planItemBadgeTone(item.state)}>{item.state ?? "unknown"}</Badge>
              <span className="tf-planitems__actions">
                {isOpenTask ? (
                  <span className="tf-planitems__hint">{t("case.planItems.openFromTasks")}</span>
                ) : null}
                {actions.map((action) => (
                  <Button
                    key={action}
                    variant="secondary"
                    loading={busyItem === item.id}
                    onClick={() => onAction(item, action)}
                  >
                    {t(ACTION_KEYS[action])}
                  </Button>
                ))}
              </span>
            </div>
            {children.length > 0 ? (
              <PlanItemList
                nodes={children}
                busyItem={busyItem}
                onAction={onAction}
                t={t}
                depth={depth + 1}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * C3: the tone, not a class. Not `toneForState` — a plan item's vocabulary is CMMN's, and
 * "available"/"enabled" mean something different here than they do for a process instance.
 */
function planItemBadgeTone(state: string | undefined): BadgeTone {
  switch ((state ?? "").toLowerCase()) {
    case "active":
      return "info";
    case "completed":
      return "success";
    case "terminated":
    case "disabled":
      return "danger";
    default:
      return "warning";
  }
}
