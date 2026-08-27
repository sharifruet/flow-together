/**
 * Process-instance migration with a mapping editor (W2.1, ENTERPRISE_PARITY_PLAN E2).
 *
 * Control already listed the *batches* a migration produces; what it had no way to do was
 * start one. The plan is explicit that the batch list "is not the feature — the mapping
 * editor is".
 *
 * The flow is validate-then-migrate, in that order and never collapsed into one step. The
 * engine offers `/migrate/validate` as a real dry run, and an operator moving live
 * instances between definitions should see what will break before anything moves. A
 * validation failure is shown and the migrate button stays disabled.
 *
 * **Scope, decided in W2.1's discovery** (docs/ui/WAVE2_DISCOVERY.md): one-to-one activity
 * mappings and the target definition. One-to-many and many-to-one are expressible in the
 * migration document and `InstanceApi.migrate` would send them, but they describe
 * multi-instance and parallel-gateway reshapes that need a diagram-level editor to be
 * comprehensible. The pre/post-upgrade script hooks are deliberately absent: they execute
 * arbitrary code server-side, and a free-text script box in an operations console is a
 * privilege-escalation surface rather than a feature.
 */

import { useCallback, useMemo, useState } from "react";
import {
  ApiError,
  AsyncBoundary,
  Badge,
  Button,
  Icon,
  Modal,
  SelectInput,
  Skeleton,
  useAsync,
  useI18n,
  useToast,
  type ActivityInstanceResponse,
  type ActivityMigrationMapping,
  type InstanceApi,
  type MigrationDocument,
  type ProcessDefinitionResponse,
  type ProcessInstanceResponse,
  type RepositoryApi,
} from "@togetherflow/common";

export interface MigrationDialogProps {
  instanceApi: InstanceApi;
  repositoryApi: RepositoryApi;
  instance: ProcessInstanceResponse;
  /** The instance's currently-open activities — the ones that actually need a mapping. */
  activities: ActivityInstanceResponse[];
  onClose: () => void;
  onMigrated: () => void;
}

/** "Leave it to the engine" — an unmapped activity keeps its id if the target has one. */
const AUTO = "";

export function MigrationDialog({
  instanceApi,
  repositoryApi,
  instance,
  activities,
  onClose,
  onMigrated,
}: MigrationDialogProps) {
  const { t } = useI18n();
  const { push } = useToast();
  const [targetId, setTargetId] = useState("");
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [validation, setValidation] = useState<{ messages: string[]; valid: boolean } | null>(null);
  const [validating, setValidating] = useState(false);
  const [migrating, setMigrating] = useState(false);

  /**
   * Only *unfinished* activities need mapping: a completed one is history, and the engine
   * does not move it. Deduplicated by activityId — a multi-instance activity appears once
   * per instance and would otherwise fill the editor with identical rows.
   */
  const openActivities = useMemo(() => {
    const seen = new Map<string, ActivityInstanceResponse>();
    for (const activity of activities) {
      if (activity.endTime) continue;
      if (activity.activityId && !seen.has(activity.activityId)) {
        seen.set(activity.activityId, activity);
      }
    }
    return [...seen.values()];
  }, [activities]);

  /**
   * Other versions of the same definition key — the only sensible migration targets.
   *
   * Two calls, because a process instance carries `processDefinitionId` and no key: the
   * definition is resolved first, then its siblings are listed by that key. Migrating
   * across *different* definitions is expressible in the document and is deliberately not
   * offered — it is almost always a mistake, and the engine will not reconcile the
   * activity ids for you.
   */
  const targets = useAsync(
    async (signal) => {
      if (!instance.processDefinitionId) return [];
      const current = await repositoryApi.getProcessDefinition(instance.processDefinitionId, signal);
      if (!current.key) return [];
      const page = await repositoryApi.listProcessDefinitions(
        { key: current.key, size: 100, latest: false },
        signal,
      );
      return page.data
        .filter((definition) => definition.id !== instance.processDefinitionId)
        .sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
    },
    [repositoryApi, instance.processDefinitionId],
  );

  const targetActivities = useAsync(
    async (signal) => (targetId ? await repositoryApi.listActivityIdsFor(targetId, signal) : []),
    [repositoryApi, targetId],
  );

  const document = useMemo<MigrationDocument>(() => {
    const activityMappings: ActivityMigrationMapping[] = Object.entries(mappings)
      .filter(([, to]) => to !== AUTO)
      .map(([fromActivityId, toActivityId]) => ({ fromActivityId, toActivityId }));
    return {
      toProcessDefinitionId: targetId,
      ...(activityMappings.length > 0 ? { activityMappings } : {}),
    };
  }, [targetId, mappings]);

  /** Any edit invalidates a previous verdict — a stale "valid" is the dangerous state. */
  const setMapping = useCallback((from: string, to: string) => {
    setMappings((current) => ({ ...current, [from]: to }));
    setValidation(null);
  }, []);

  const validate = useCallback(async () => {
    setValidating(true);
    try {
      const result = await instanceApi.validateMigration(instance.id, document);
      const messages = result.validationMessages ?? [];
      setValidation({
        messages,
        // `migrationValid` is authoritative where the engine sends it; an empty message
        // list is the fallback, not the other way round.
        valid: result.migrationValid ?? messages.length === 0,
      });
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      // A validation call that fails is not a valid migration — say so in the panel
      // rather than only as a toast the user may have dismissed.
      setValidation({ messages: [apiError?.message ?? t("action.failed")], valid: false });
    } finally {
      setValidating(false);
    }
  }, [instanceApi, instance.id, document, t]);

  const migrate = useCallback(async () => {
    setMigrating(true);
    try {
      await instanceApi.migrate(instance.id, document);
      push({ tone: "success", message: t("migration.done") });
      onMigrated();
      onClose();
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? t("migration.failed"),
        reference: apiError?.correlationId,
      });
    } finally {
      setMigrating(false);
    }
  }, [instanceApi, instance.id, document, push, t, onMigrated, onClose]);

  const canMigrate = Boolean(targetId) && validation?.valid === true && !migrating;

  return (
    <Modal
      open
      size="lg"
      title={t("migration.title")}
      description={t("migration.description", {
        name: instance.name || instance.processDefinitionName || instance.id,
      })}
      // Unsaved mapping work; a stray backdrop click must not discard it.
      dismissOnBackdrop={false}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={migrating}>
            {t("dialog.cancel")}
          </Button>
          <Button
            variant="secondary"
            onClick={() => void validate()}
            loading={validating}
            disabled={!targetId || migrating}
          >
            <Icon name="check" size={16} />
            {t("migration.validate")}
          </Button>
          <Button variant="danger" onClick={() => void migrate()} loading={migrating} disabled={!canMigrate}>
            {t("migration.migrate")}
          </Button>
        </>
      }
    >
      <AsyncBoundary
        loading={targets.loading}
        error={targets.error}
        data={targets.data}
        skeletonRows={3}
      >
        {(definitions) =>
          definitions.length === 0 ? (
            <p className="tf-muted">{t("migration.noTargets")}</p>
          ) : (
            <>
              <SelectInput
                label={t("migration.target")}
                hint={t("migration.target.hint")}
                value={targetId}
                onChange={(event) => {
                  setTargetId(event.target.value);
                  // A mapping is only meaningful against one target.
                  setMappings({});
                  setValidation(null);
                }}
              >
                <option value="">{t("migration.target.choose")}</option>
                {definitions.map((definition: ProcessDefinitionResponse) => (
                  <option key={definition.id} value={definition.id}>
                    {t("migration.target.option", {
                      name: definition.name || definition.key || definition.id,
                      version: definition.version ?? 1,
                    })}
                  </option>
                ))}
              </SelectInput>

              {targetId ? (
                <section className="tf-migration">
                  <h3 className="tf-migration__title">{t("migration.mappings")}</h3>
                  <p className="tf-muted">{t("migration.mappings.hint")}</p>

                  {openActivities.length === 0 ? (
                    <p className="tf-muted">{t("migration.mappings.none")}</p>
                  ) : targetActivities.loading ? (
                    <Skeleton rows={3} label={t("migration.mappings")} />
                  ) : (
                    <ul className="tf-migration__rows">
                      {openActivities.map((activity) => (
                        <li className="tf-migration__row" key={activity.activityId}>
                          <span className="tf-migration__from">
                            <span className="tf-migration__name">
                              {activity.activityName || activity.activityId}
                            </span>
                            <span className="tf-migration__meta tf-mono">{activity.activityId}</span>
                          </span>
                          <Icon name="chevron-right" size={16} className="tf-muted" />
                          <SelectInput
                            label={t("migration.mapTo", {
                              activity: activity.activityName || activity.activityId || "",
                            })}
                            hideLabel
                            value={mappings[activity.activityId ?? ""] ?? AUTO}
                            onChange={(event) => setMapping(activity.activityId ?? "", event.target.value)}
                          >
                            <option value={AUTO}>{t("migration.mapTo.auto")}</option>
                            {(targetActivities.data ?? []).map((target) => (
                              <option key={target.id} value={target.id}>
                                {target.name ? `${target.name} (${target.id})` : target.id}
                              </option>
                            ))}
                          </SelectInput>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ) : null}

              {validation ? (
                <section
                  className={`tf-migration__validation${validation.valid ? "" : " tf-migration__validation--failed"}`}
                  role="status"
                >
                  <Badge tone={validation.valid ? "success" : "danger"}>
                    {validation.valid ? t("migration.valid") : t("migration.invalid")}
                  </Badge>
                  {validation.messages.length > 0 ? (
                    <ul className="tf-migration__messages">
                      {validation.messages.map((message, index) => (
                        <li key={index}>{message}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="tf-muted">{t("migration.valid.hint")}</p>
                  )}
                </section>
              ) : (
                <p className="tf-muted tf-migration__prompt">{t("migration.validateFirst")}</p>
              )}
            </>
          )
        }
      </AsyncBoundary>
    </Modal>
  );
}
