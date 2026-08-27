/**
 * Event Registry channel/event modeler (REQUIREMENTS.md §7.4.6).
 *
 * Events and channels are configuration, not diagrams, so this is a structured editor
 * rather than a canvas. A draft can carry an event definition, an inbound/outbound
 * channel, or both; deploying sends them as separate `.event` / `.channel` files
 * because the event-registry endpoint takes one file per call and accepts no archive.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  Button,
  CHANNEL_TRANSPORTS,
  ConfirmDialog,
  PAYLOAD_TYPES,
  SelectInput,
  TextInput,
  emptyChannel,
  parseEventDraft,
  useT,
  useToast,
  type ChannelDirection,
  type EventDraft,
  type EventPayloadEntry,
  type EventRegistryApi,
  type ModelApi,
  type ModelResponse,
} from "@togetherflow/common";
import { useConflictPrompt } from "../editors/ConflictPrompt";
import { EditorMenuBar } from "../editors/EditorMenuBar";

const AUTOSAVE_IDLE_MS = 4000;

export interface EventEditorProps {
  modelApi: ModelApi;
  eventApi: EventRegistryApi;
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

export function EventEditor({
  modelApi,
  eventApi,
  model,
  initialSource,
  loadError,
  onBack,
  onReloadSource,
  onSaved,
}: EventEditorProps) {
  const t = useT();
  const { push } = useToast();
  /*
   * The concurrent-edit guard's user half (W1.1). Declared before `save` so the
   * autosave effect and the save callback can both see it.
   */
  const conflict = useConflictPrompt({ onReload: () => onReloadSource?.() });

  const parsed = useMemo(
    () => parseEventDraft(initialSource, model.key ?? "event", model.name ?? "Event"),
    [initialSource, model.key, model.name],
  );
  const [edits, setEdits] = useState<{ modelId: string; draft: EventDraft } | null>(null);
  const draft = edits && edits.modelId === model.id ? edits.draft : parsed;

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [confirmDeploy, setConfirmDeploy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const update = useCallback(
    (changes: Partial<EventDraft>) => {
      setEdits({ modelId: model.id, draft: { ...draft, ...changes } });
      setDirty(true);
    },
    [draft, model.id],
  );

  const save = useCallback(
    async (options: { silent?: boolean } = {}) => {
      setSaving(true);
      try {
        const written = await conflict.guard(async (overwrite) => {
          await modelApi.saveSource(model.id, JSON.stringify(draft, null, 2), { overwrite });
          return true;
        });
        if (!written) return;
        setDirty(false);
        if (!options.silent) push({ tone: "success", message: t("editor.saved.toast") });
        onSaved();
      } catch (cause) {
        const apiError = cause instanceof ApiError ? cause : undefined;
        push({
          tone: "error",
          message: apiError?.message ?? t("editor.saveFailed"),
          reference: apiError?.correlationId,
        });
      } finally {
        setSaving(false);
      }
    },
    [modelApi, model.id, draft, push, onSaved, t, conflict],
  );

  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  useEffect(() => {
    if (!dirty || conflict.blocked) return;
    const timer = setTimeout(() => void saveRef.current({ silent: true }), AUTOSAVE_IDLE_MS);
    return () => clearTimeout(timer);
  }, [dirty, conflict.blocked]);
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const deploy = async () => {
    setDeploying(true);
    try {
      await modelApi.saveSource(model.id, JSON.stringify(draft, null, 2));
      setDirty(false);

      // One call per file: the endpoint takes a single .event or .channel, not an archive.
      const deployed: string[] = [];
      if (draft.event) {
        await eventApi.deploy("event", draft.event.key, JSON.stringify(draft.event, null, 2));
        deployed.push("event");
      }
      if (draft.channel) {
        await eventApi.deploy("channel", draft.channel.key, JSON.stringify(draft.channel, null, 2));
        deployed.push("channel");
      }
      push({ tone: "success", message: t("event.deployed", { what: deployed.join(" and ") }) });
      onSaved();
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? t("editor.deployFailed"),
        reference: apiError?.correlationId,
      });
    } finally {
      setDeploying(false);
    }
  };

  const busy = saving || deploying;
  const event = draft.event;
  const channel = draft.channel;

  const setPayload = (index: number, changes: Partial<EventPayloadEntry>) => {
    if (!event) return;
    update({
      event: {
        ...event,
        payload: event.payload.map((entry, i) => (i === index ? { ...entry, ...changes } : entry)),
      },
    });
  };

  return (
    <section className="tf-panel" aria-label={t("editor.editing", { name: model.name || model.id })}>
      {/* W2.3 (I8): one menu bar, shared by all six editors. */}
      <EditorMenuBar
        title={model.name || model.id}
        status={dirty ? t("editor.unsaved") : t("event.definition")}
        onBack={() => (dirty ? setConfirmLeave(true) : onBack())}
        onSave={() => void save()}
        saving={saving}
        ready={Boolean(event || channel)}
        primary={{
          label: t("action.deploy"),
          run: () => setConfirmDeploy(true),
          busy: deploying,
        }}
      />

      {loadError ? (
        <p className="tf-detail__note tf-detail__note--error" role="alert">
          {loadError}
        </p>
      ) : null}

      <div className="tf-app-builder">
        <section>
          <h2 className="tf-panel__section-title">{t("event.section.event")}</h2>
          {event ? (
            <>
              <TextInput
                label={t("event.key")}
                value={event.key}
                disabled={busy}
                hint={t("event.key.hint")}
                onChange={(e) => update({ event: { ...event, key: e.target.value } })}
              />
              <TextInput
                label={t("event.name")}
                value={event.name}
                disabled={busy}
                onChange={(e) => update({ event: { ...event, name: e.target.value } })}
              />
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => update({ event: undefined })}
              >
                {t("event.removeEvent")}
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                update({
                  event: {
                    key: model.key ?? "event",
                    name: model.name ?? "Event",
                    payload: [],
                  },
                })
              }
            >
              {t("event.addEvent")}
            </Button>
          )}
        </section>

        <section>
          {event ? (
            <>
              <h2 className="tf-panel__section-title">Payload ({event.payload.length})</h2>
              <p className="tf-panel__meta">
                Fields carried by the event. Mark one as the correlation parameter so the
                engine can match an incoming event to a waiting instance.
              </p>
              {event.payload.length === 0 ? (
                <p className="tf-muted">{t("event.payload.none")}</p>
              ) : (
                <ul className="tf-payload">
                  {event.payload.map((entry, index) => (
                    <li className="tf-payload__row" key={index}>
                      <TextInput
                        label={t("event.payload.name")}
                        value={entry.name}
                        disabled={busy}
                        onChange={(e) => setPayload(index, { name: e.target.value })}
                      />
                      <SelectInput
                        label={t("event.payload.type")}
                        value={entry.type}
                        disabled={busy}
                        onChange={(e) => setPayload(index, { type: e.target.value })}
                      >
                        {PAYLOAD_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </SelectInput>
                      <label className="tf-checkbox">
                        <input
                          type="checkbox"
                          checked={entry.correlationParameter === true}
                          disabled={busy}
                          onChange={(e) =>
                            setPayload(index, { correlationParameter: e.target.checked || undefined })
                          }
                        />
                        {t("event.correlation")}
                      </label>
                      <button
                        type="button"
                        className="tf-chip-item__remove"
                        aria-label={t("event.payload.remove", { name: entry.name || index + 1 })}
                        disabled={busy}
                        onClick={() =>
                          update({
                            event: {
                              ...event,
                              payload: event.payload.filter((_, i) => i !== index),
                            },
                          })
                        }
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  update({
                    event: { ...event, payload: [...event.payload, { name: "", type: "string" }] },
                  })
                }
              >
                {t("event.addField")}
              </Button>
            </>
          ) : null}
        </section>
      </div>

      <section className="tf-panel__section">
        <h2 className="tf-panel__section-title">{t("event.section.channel")}</h2>
        {channel ? (
          <div className="tf-app-builder">
            <div>
              <TextInput
                label={t("event.channel.key")}
                value={channel.key}
                disabled={busy}
                onChange={(e) => update({ channel: { ...channel, key: e.target.value } })}
              />
              <TextInput
                label={t("event.channel.name")}
                value={channel.name}
                disabled={busy}
                onChange={(e) => update({ channel: { ...channel, name: e.target.value } })}
              />
              <SelectInput
                label={t("event.channel.direction")}
                value={channel.channelType}
                disabled={busy}
                onChange={(e) =>
                  update({ channel: { ...channel, channelType: e.target.value as ChannelDirection } })
                }
              >
                <option value="inbound">{t("event.channel.inbound")}</option>
                <option value="outbound">{t("event.channel.outbound")}</option>
              </SelectInput>
            </div>
            <div>
              <SelectInput
                label={t("event.channel.transport")}
                value={channel.type}
                disabled={busy}
                onChange={(e) => update({ channel: { ...channel, type: e.target.value } })}
              >
                {CHANNEL_TRANSPORTS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </SelectInput>
              <TextInput
                label={t("event.channel.destination")}
                value={channel.destination ?? ""}
                disabled={busy}
                hint={t("event.channel.destination.hint")}
                onChange={(e) => update({ channel: { ...channel, destination: e.target.value } })}
              />
              {channel.channelType === "inbound" ? (
                <TextInput
                  label={t("event.channel.mapsTo")}
                  value={channel.channelEventKeyDetection?.fixedValue ?? ""}
                  disabled={busy}
                  hint={t("event.channel.mapsTo.hint")}
                  onChange={(e) =>
                    update({
                      channel: {
                        ...channel,
                        channelEventKeyDetection: { fixedValue: e.target.value },
                      },
                    })
                  }
                />
              ) : null}
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => update({ channel: undefined })}
              >
                {t("event.removeChannel")}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              update({ channel: emptyChannel(event?.key ?? model.key ?? "event", model.name ?? "Event") })
            }
          >
            {t("event.addChannel")}
          </Button>
        )}
      </section>

      <ConfirmDialog
        open={confirmDeploy}
        title={t("event.deploy.title")}
        description={t("event.deploy.description", {
          what: [
            draft.event && t("event.deploy.eventDefinition"),
            draft.channel && t("event.deploy.channel"),
          ]
            .filter(Boolean)
            .join(" and "),
        })}
        confirmLabel={t("event.deploy.confirm")}
        busy={deploying}
        onCancel={() => setConfirmDeploy(false)}
        onConfirm={() => {
          setConfirmDeploy(false);
          void deploy();
        }}
      />

      <ConfirmDialog
        open={confirmLeave}
        title={t("editor.leave.title")}
        description={t("editor.leave.description", { name: model.name || model.id })}
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
