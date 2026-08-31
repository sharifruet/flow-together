/**
 * Starting a real instance from the modeller (ENTERPRISE_PARITY_PLAN.md W3.3).
 *
 * Flowable Design previews a model against a runtime; this fork had no way to go from
 * "deployed" to "does it actually run" without leaving for another app.
 *
 * **It starts a real instance.** There is no sandbox in this distribution — no scratch
 * engine, no dry-run endpoint — so the honest options were to say so or not to build it.
 * The dialog says so, in the tenant the modeller is already working in, and never starts
 * anything without an explicit click.
 */

import { useState } from "react";
import {
  ApiError,
  Button,
  Modal,
  TextInput,
  useT,
  useToast,
  type ProcessApi,
  type ProcessInstanceResponse,
} from "@togetherflow/common";

export interface RuntimePreviewProps {
  processApi: ProcessApi;
  /** The definition key the deploy just produced. */
  definitionKey: string;
  modelName: string;
  onClose: () => void;
}

export function RuntimePreview({
  processApi,
  definitionKey,
  modelName,
  onClose,
}: RuntimePreviewProps) {
  const t = useT();
  const { push } = useToast();
  const [businessKey, setBusinessKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState<ProcessInstanceResponse | null>(null);

  const start = async () => {
    setBusy(true);
    try {
      const instance = await processApi.start({
        processDefinitionKey: definitionKey,
        businessKey: businessKey.trim() || undefined,
      });
      setStarted(instance);
      push({ tone: "success", message: t("preview.started", { id: instance.id }) });
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? t("preview.failed"),
        reference: apiError?.correlationId,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      size="sm"
      title={t("preview.title")}
      description={t("preview.description", { name: modelName })}
      onClose={onClose}
      actions={
        started ? (
          <Button onClick={onClose}>{t("action.done")}</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              {t("dialog.cancel")}
            </Button>
            <Button onClick={() => void start()} loading={busy}>
              {t("preview.start")}
            </Button>
          </>
        )
      }
    >
      {/*
        Stated before the button, not after: this creates runtime state that someone will
        have to deal with, and a warning under a control has already been ignored.
      */}
      <p className="tf-detail__note" role="note">
        {t("preview.warning")}
      </p>

      {started ? (
        <dl className="tf-detail__facts">
          <div className="tf-detail__fact">
            <dt>{t("preview.instance")}</dt>
            <dd className="tf-mono">{started.id}</dd>
          </div>
          <div className="tf-detail__fact">
            <dt>{t("preview.waitingAt")}</dt>
            {/*
              The engine reports the activity it stopped at; a process that ran to
              completion reports none, which is itself the answer.
            */}
            <dd>{started.activityId || t("preview.completed")}</dd>
          </div>
        </dl>
      ) : (
        <TextInput
          label={t("preview.businessKey")}
          hint={t("preview.businessKey.hint")}
          value={businessKey}
          disabled={busy}
          onChange={(event) => setBusinessKey(event.target.value)}
        />
      )}
    </Modal>
  );
}
