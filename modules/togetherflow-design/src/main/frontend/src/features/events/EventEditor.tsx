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
  useToast,
  type ChannelDirection,
  type EventDraft,
  type EventPayloadEntry,
  type EventRegistryApi,
  type ModelApi,
  type ModelResponse,
} from "@togetherflow/common";

const AUTOSAVE_IDLE_MS = 4000;

export interface EventEditorProps {
  modelApi: ModelApi;
  eventApi: EventRegistryApi;
  model: ModelResponse;
  initialSource: string | null;
  loadError?: string | null;
  onBack: () => void;
  onSaved: () => void;
}

export function EventEditor({
  modelApi,
  eventApi,
  model,
  initialSource,
  loadError,
  onBack,
  onSaved,
}: EventEditorProps) {
  const { push } = useToast();
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
        await modelApi.saveSource(model.id, JSON.stringify(draft, null, 2));
        setDirty(false);
        if (!options.silent) push({ tone: "success", message: "Saved." });
        onSaved();
      } catch (cause) {
        const apiError = cause instanceof ApiError ? cause : undefined;
        push({
          tone: "error",
          message: apiError?.message ?? "Could not save this model.",
          reference: apiError?.correlationId,
        });
      } finally {
        setSaving(false);
      }
    },
    [modelApi, model.id, draft, push, onSaved],
  );

  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => void saveRef.current({ silent: true }), AUTOSAVE_IDLE_MS);
    return () => clearTimeout(timer);
  }, [dirty]);
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
      push({ tone: "success", message: `Deployed ${deployed.join(" and ")}.` });
      onSaved();
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? "Deployment failed.",
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
          <h1 className="tf-panel__title">{model.name || model.id}</h1>
          <p className="tf-panel__meta" aria-live="polite">
            {dirty ? "Unsaved changes" : "Event definition"}
          </p>
        </div>
        <div className="tf-row-actions">
          <Button variant="secondary" loading={saving} onClick={() => void save()}>
            Save
          </Button>
          <Button
            loading={deploying}
            disabled={!event && !channel}
            onClick={() => setConfirmDeploy(true)}
          >
            Deploy
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
          <h2 className="tf-panel__section-title">Event</h2>
          {event ? (
            <>
              <TextInput
                label="Event key"
                value={event.key}
                disabled={busy}
                hint="Referenced by process and case models."
                onChange={(e) => update({ event: { ...event, key: e.target.value } })}
              />
              <TextInput
                label="Event name"
                value={event.name}
                disabled={busy}
                onChange={(e) => update({ event: { ...event, name: e.target.value } })}
              />
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => update({ event: undefined })}
              >
                Remove event
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
              Add an event definition
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
                <p className="tf-muted">No payload fields.</p>
              ) : (
                <ul className="tf-payload">
                  {event.payload.map((entry, index) => (
                    <li className="tf-payload__row" key={index}>
                      <TextInput
                        label="Name"
                        value={entry.name}
                        disabled={busy}
                        onChange={(e) => setPayload(index, { name: e.target.value })}
                      />
                      <SelectInput
                        label="Type"
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
                        Correlation
                      </label>
                      <button
                        type="button"
                        className="tf-chip-item__remove"
                        aria-label={`Remove field ${entry.name || index + 1}`}
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
                Add field
              </Button>
            </>
          ) : null}
        </section>
      </div>

      <section className="tf-panel__section">
        <h2 className="tf-panel__section-title">Channel</h2>
        {channel ? (
          <div className="tf-app-builder">
            <div>
              <TextInput
                label="Channel key"
                value={channel.key}
                disabled={busy}
                onChange={(e) => update({ channel: { ...channel, key: e.target.value } })}
              />
              <TextInput
                label="Channel name"
                value={channel.name}
                disabled={busy}
                onChange={(e) => update({ channel: { ...channel, name: e.target.value } })}
              />
              <SelectInput
                label="Direction"
                value={channel.channelType}
                disabled={busy}
                onChange={(e) =>
                  update({ channel: { ...channel, channelType: e.target.value as ChannelDirection } })
                }
              >
                <option value="inbound">Inbound — receive events</option>
                <option value="outbound">Outbound — send events</option>
              </SelectInput>
            </div>
            <div>
              <SelectInput
                label="Transport"
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
                label="Destination"
                value={channel.destination ?? ""}
                disabled={busy}
                hint="Queue, topic or exchange name."
                onChange={(e) => update({ channel: { ...channel, destination: e.target.value } })}
              />
              {channel.channelType === "inbound" ? (
                <TextInput
                  label="Maps to event key"
                  value={channel.channelEventKeyDetection?.fixedValue ?? ""}
                  disabled={busy}
                  hint="Which event an incoming message becomes."
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
                Remove channel
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
            Add a channel
          </Button>
        )}
      </section>

      <ConfirmDialog
        open={confirmDeploy}
        title="Deploy to the event registry?"
        description={`${[draft.event && "the event definition", draft.channel && "the channel"].filter(Boolean).join(" and ")} will be deployed. An inbound channel starts listening as soon as it is deployed.`}
        confirmLabel="Save and deploy"
        busy={deploying}
        onCancel={() => setConfirmDeploy(false)}
        onConfirm={() => {
          setConfirmDeploy(false);
          void deploy();
        }}
      />

      <ConfirmDialog
        open={confirmLeave}
        title="Leave without saving?"
        description={`"${model.name || model.id}" has unsaved changes. Leaving now discards them.`}
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
