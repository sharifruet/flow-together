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
  Button,
  ConfirmDialog,
  availablePlanItemActions,
  formatDateTime,
  useAsync,
  useToast,
  type CaseApi,
  type CaseInstanceResponse,
  type PlanItemAction,
  type PlanItemInstanceResponse,
} from "@togetherflow/common";

export interface CaseDetailProps {
  caseApi: CaseApi;
  instance?: CaseInstanceResponse;
  onClose: () => void;
  onChanged: () => void;
}

const ACTION_LABELS: Record<PlanItemAction, string> = {
  start: "Start",
  enable: "Enable",
  disable: "Skip",
  trigger: "Trigger",
};

export function CaseDetail({ caseApi, instance, onClose, onChanged }: CaseDetailProps) {
  const { push } = useToast();
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [confirmTerminate, setConfirmTerminate] = useState(false);
  const [terminating, setTerminating] = useState(false);
  const [localRefresh, setLocalRefresh] = useState(0);

  const caseId = instance?.id;
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
      push({ tone: "success", message: `${ACTION_LABELS[action]}: ${item.name ?? "plan item"}.` });
      refreshAll();
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? `Could not ${action} this plan item.`,
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
      push({ tone: "success", message: "Case terminated." });
      onClose();
      onChanged();
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? "Could not terminate this case.",
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
      <section className="tf-detail tf-detail--empty" aria-label="Case detail">
        <p className="tf-detail__empty-title">No case selected</p>
        <p className="tf-detail__empty-hint">Choose a case from the list to see its progress.</p>
      </section>
    );
  }

  return (
    <section className="tf-detail" aria-label={`Case ${instance.name ?? instance.id}`}>
      <header className="tf-detail__header">
        <div>
          <h2 className="tf-detail__title">
            {instance.name || instance.caseDefinitionName || "Case"}
          </h2>
          <p className="tf-detail__meta">
            {instance.businessKey ? `Ref ${instance.businessKey} · ` : ""}
            Started {formatDateTime(instance.startTime)}
            {instance.startUserId ? ` by ${instance.startUserId}` : ""}
            {ended ? ` · Ended ${formatDateTime(instance.endTime ?? undefined)}` : ""}
          </p>
        </div>
        <button type="button" className="tf-detail__close" onClick={onClose} aria-label="Close case detail">
          ×
        </button>
      </header>

      {/* Progress: stages and milestones, in the order the engine reports them. */}
      <section className="tf-detail__section">
        <h3 className="tf-detail__section-title">Progress</h3>
        {ended ? (
          <p className="tf-muted">
            This case has finished. Its live progress is no longer tracked.
          </p>
        ) : (
          <AsyncBoundary
            loading={stages.loading}
            error={stages.error}
            data={stages.data}
            onRetry={stages.refetch}
            skeletonRows={2}
            isEmpty={(rows) => rows.length === 0}
            empty={<p className="tf-muted">This case defines no stages or milestones.</p>}
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
                        ? `Reached ${formatDateTime(stage.endTime ?? undefined)}`
                        : stage.current
                          ? "In progress"
                          : "Not yet reached"}
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
        <h3 className="tf-detail__section-title">Plan items</h3>
        {ended ? (
          <p className="tf-muted">Plan items are only tracked while a case is running.</p>
        ) : (
          <AsyncBoundary
            loading={planItems.loading}
            error={planItems.error}
            data={tree}
            onRetry={planItems.refetch}
            skeletonRows={3}
            isEmpty={(nodes) => nodes.length === 0}
            empty={<p className="tf-muted">Nothing is active in this case right now.</p>}
          >
            {(nodes) => (
              <PlanItemList
                nodes={nodes}
                busyItem={busyItem}
                onAction={runAction}
              />
            )}
          </AsyncBoundary>
        )}
      </section>

      <section className="tf-detail__section">
        <h3 className="tf-detail__section-title">Case data</h3>
        <AsyncBoundary
          loading={variables.loading}
          error={variables.error}
          data={variables.data}
          onRetry={variables.refetch}
            skeletonRows={2}
          isEmpty={(rows) => rows.length === 0}
          empty={<p className="tf-muted">This case carries no data.</p>}
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
            Terminate case
          </Button>
        </footer>
      ) : null}

      <ConfirmDialog
        open={confirmTerminate}
        title="Terminate this case?"
        description={`"${instance.name || instance.caseDefinitionName || instance.id}" will stop immediately and its open tasks will be cancelled. Its history is kept.`}
        confirmLabel="Terminate case"
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
  depth = 0,
}: {
  nodes: PlanItemNode[];
  busyItem: string | null;
  onAction: (item: PlanItemInstanceResponse, action: PlanItemAction) => void;
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
              <span className={planItemBadgeClass(item.state)}>{item.state ?? "unknown"}</span>
              <span className="tf-planitems__actions">
                {isOpenTask ? (
                  <span className="tf-planitems__hint">Open it from Tasks</span>
                ) : null}
                {actions.map((action) => (
                  <Button
                    key={action}
                    variant="secondary"
                    loading={busyItem === item.id}
                    onClick={() => onAction(item, action)}
                  >
                    {ACTION_LABELS[action]}
                  </Button>
                ))}
              </span>
            </div>
            {children.length > 0 ? (
              <PlanItemList
                nodes={children}
                busyItem={busyItem}
                onAction={onAction}
                depth={depth + 1}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function planItemBadgeClass(state: string | undefined): string {
  const s = (state ?? "").toLowerCase();
  const tone =
    s === "active"
      ? "tf-badge--running"
      : s === "completed"
        ? "tf-badge--done"
        : s === "terminated" || s === "disabled"
          ? "tf-badge--danger"
          : "tf-badge--warning";
  return `tf-badge ${tone}`;
}
