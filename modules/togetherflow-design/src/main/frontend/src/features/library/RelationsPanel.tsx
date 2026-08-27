/**
 * The "Uses" / "Used by" panel (W2.3, UI_POLISH_BACKLOG.md I4).
 *
 * Named `RelationsPanel` rather than `ModelRelations` so the file does not differ from
 * `modelRelations.ts` by casing alone — that pair breaks on a case-insensitive
 * filesystem, which is most developer machines.
 *
 * Enterprise shows both directions per model and warns before a delete that would break a
 * reference. This is that, with one difference stated on the panel rather than hidden:
 * ours is **derived by reading stored sources**, because the engine records no
 * relationships — model source is opaque bytes to it. So it can miss a reference behind an
 * expression, and it says so.
 */

import {
  AsyncBoundary,
  Badge,
  Button,
  Icon,
  Modal,
  useAsync,
  useI18n,
  modelKindOf,
  type ModelApi,
  type ModelResponse,
} from "@togetherflow/common";
import { buildRelationIndex, type RelationIndex } from "./modelRelations";

export interface RelationsPanelProps {
  modelApi: ModelApi;
  model: ModelResponse;
  /** Every model in the library — both directions need the whole set. */
  models: ModelResponse[];
  onOpen: (model: ModelResponse) => void;
  /**
   * Hands the built index back, so the library's delete confirmation can warn about a
   * model that something references without rebuilding it (I4).
   */
  onIndexed?: (index: RelationIndex) => void;
  onClose: () => void;
}

export function RelationsPanel({
  modelApi,
  model,
  models,
  onOpen,
  onIndexed,
  onClose,
}: RelationsPanelProps) {
  const { t } = useI18n();

  const index = useAsync(
    async (signal) => {
      /*
       * Every model's source is needed for the "used by" direction — a reference lives in
       * the *referrer*, so answering "who uses this" means reading everyone. Fetched in
       * parallel and tolerant of failures: one unreadable source should cost that model's
       * edges, not the panel.
       */
      const entries = await Promise.all(
        models.map(async (candidate) => ({
          model: candidate,
          source: await modelApi.getSource(candidate.id, signal).catch(() => null),
        })),
      );
      const built = buildRelationIndex(entries);
      onIndexed?.(built);
      return built;
    },
    [modelApi, models, onIndexed],
  );

  return (
    <Modal
      open
      size="md"
      title={t("relations.title", { name: model.name || model.key || model.id })}
      description={t("relations.description")}
      onClose={onClose}
      actions={
        <Button variant="secondary" onClick={onClose}>
          {t("action.close")}
        </Button>
      }
    >
      <AsyncBoundary loading={index.loading} error={index.error} data={index.data} skeletonRows={4}>
        {(built) => {
          const uses = built.uses.get(model.id) ?? [];
          const usedBy = built.usedBy.get(model.id) ?? [];
          const unresolved = built.unresolved.get(model.id) ?? [];

          return (
            <>
              <section className="tf-relations">
                <h3 className="tf-panel__section-title">{t("relations.uses")}</h3>
                {uses.length === 0 ? (
                  <p className="tf-muted">{t("relations.uses.none")}</p>
                ) : (
                  <RelationList models={uses} onOpen={onOpen} />
                )}
                {unresolved.length > 0 ? (
                  <ul className="tf-relations__unresolved">
                    {unresolved.map((reference, i) => (
                      <li key={i}>
                        <Icon name="warning" size={14} />
                        {t("relations.unresolved", { key: reference.key, via: reference.via })}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>

              <section className="tf-relations">
                <h3 className="tf-panel__section-title">{t("relations.usedBy")}</h3>
                {usedBy.length === 0 ? (
                  <p className="tf-muted">{t("relations.usedBy.none")}</p>
                ) : (
                  <RelationList models={usedBy} onOpen={onOpen} />
                )}
              </section>

              <p className="tf-muted tf-relations__caveat">{t("relations.caveat")}</p>
            </>
          );
        }}
      </AsyncBoundary>
    </Modal>
  );
}

function RelationList({
  models,
  onOpen,
}: {
  models: ModelResponse[];
  onOpen: (model: ModelResponse) => void;
}) {
  return (
    <ul className="tf-relations__list">
      {models.map((related) => (
        <li key={related.id}>
          <button type="button" className="tf-relations__item" onClick={() => onOpen(related)}>
            <span>{related.name || related.key || related.id}</span>
            <Badge tone="info" subtle>
              {modelKindOf(related).toUpperCase()}
            </Badge>
          </button>
        </li>
      ))}
    </ul>
  );
}
