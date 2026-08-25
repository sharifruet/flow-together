/**
 * Event Registry runtime (REQUIREMENTS.md §7.2).
 *
 * What this can and cannot show, established against a running engine:
 *
 * - **Deployed event and channel definitions, with their source** — yes. The `/model`
 *   endpoint returns the JSON exactly as deployed, so an operator can confirm what is
 *   actually live rather than what someone believes was deployed.
 * - **A log of received events** — *no such thing exists.* Despite its name,
 *   `EventInstanceCollectionResource` is POST-only ("Send an event instance"); the
 *   engine keeps no queryable record of inbound events. Rather than fake a feed, this
 *   screen offers the honest inverse: send an event and watch what it starts.
 */

import { useMemo, useState } from "react";
import {
  ApiError,
  AsyncBoundary,
  Button,
  DataTable,
  EmptyState,
  TextInput,
  useAsync,
  useI18n,
  useToast,
  type ChannelDefinitionResponse,
  type Column,
  type EventDefinitionResponse,
  type EventRegistryApi,
} from "@togetherflow/common";

type EventTab = "events" | "channels" | "send";

export interface EventRegistryProps {
  eventApi: EventRegistryApi;
}

export function EventRegistry({ eventApi }: EventRegistryProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<EventTab>("events");

  return (
    <section className="tf-panel" aria-label={t("events.label")}>
      <header className="tf-panel__header">
        <div>
          <h1 className="tf-panel__title">{t("events.title")}</h1>
          <p className="tf-panel__meta">
            What the engine will react to, and a way to prove it does.
          </p>
        </div>
      </header>

      <div className="tf-chips" role="tablist" aria-label={t("events.sectionLabel")}>
        {(
          [
            ["events", t("events.tab.events")],
            ["channels", t("events.tab.channels")],
            ["send", t("events.tab.send")],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={["tf-chip", tab === value ? "tf-chip--active" : ""]
              .filter(Boolean)
              .join(" ")}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "events" ? (
        <EventDefinitions eventApi={eventApi} />
      ) : tab === "channels" ? (
        <ChannelDefinitions eventApi={eventApi} />
      ) : (
        <SendEvent eventApi={eventApi} />
      )}
    </section>
  );
}

function EventDefinitions({ eventApi }: { eventApi: EventRegistryApi }) {
  const { t } = useI18n();
  const [inspect, setInspect] = useState<EventDefinitionResponse | null>(null);

  const { data, error, loading, refetch } = useAsync(
    (signal) => eventApi.listEventDefinitions({ latest: true }, signal),
    [eventApi],
  );

  const columns = useMemo<Column<EventDefinitionResponse>[]>(
    () => [
      {
        key: "name",
        header: t("events.column.event"),
        render: (definition) => (
          <div className="tf-task-cell">
            <span className="tf-task-cell__name">{definition.name ?? definition.key}</span>
            <span className="tf-task-cell__description">
              {definition.key} · v{definition.version}
            </span>
          </div>
        ),
      },
      {
        key: "actions",
        header: "",
        width: "120px",
        render: (definition) => (
          <Button variant="ghost" onClick={() => setInspect(definition)}>
            {t("events.viewSource")}
          </Button>
        ),
      },
    ],
    [t],
  );

  return (
    <>
      <AsyncBoundary
        loading={loading}
        error={error}
        data={data}
        onRetry={refetch}
        isEmpty={(page) => page.data.length === 0}
        empty={
          <EmptyState
            title={t("events.empty.events.title")}
            description={t("events.empty.events.description")}
          />
        }
      >
        {(page) => (
          <DataTable
            caption={t("events.caption.events")}
            columns={columns}
            rows={page.data}
            rowKey={(definition) => definition.id}
          />
        )}
      </AsyncBoundary>

      {inspect ? (
        <SourceDialog
          title={inspect.name ?? inspect.key}
          load={(signal) => eventApi.getEventModel(inspect.id, signal)}
          onClose={() => setInspect(null)}
        />
      ) : null}
    </>
  );
}

function ChannelDefinitions({ eventApi }: { eventApi: EventRegistryApi }) {
  const { t } = useI18n();
  const [inspect, setInspect] = useState<ChannelDefinitionResponse | null>(null);

  const { data, error, loading, refetch } = useAsync(
    (signal) => eventApi.listChannelDefinitions({ latest: true }, signal),
    [eventApi],
  );

  const columns = useMemo<Column<ChannelDefinitionResponse>[]>(
    () => [
      {
        key: "name",
        header: t("events.column.channel"),
        render: (definition) => (
          <div className="tf-task-cell">
            <span className="tf-task-cell__name">{definition.name ?? definition.key}</span>
            <span className="tf-task-cell__description">
              {definition.key} · v{definition.version}
            </span>
          </div>
        ),
      },
      {
        key: "type",
        header: t("events.column.type"),
        width: "140px",
        render: (definition) =>
          definition.type ? (
            <span className="tf-badge tf-badge--running">{definition.type}</span>
          ) : (
            <span className="tf-muted">—</span>
          ),
      },
      {
        key: "actions",
        header: "",
        width: "120px",
        render: (definition) => (
          <Button variant="ghost" onClick={() => setInspect(definition)}>
            {t("events.viewSource")}
          </Button>
        ),
      },
    ],
    [t],
  );

  return (
    <>
      <AsyncBoundary
        loading={loading}
        error={error}
        data={data}
        onRetry={refetch}
        isEmpty={(page) => page.data.length === 0}
        empty={
          <EmptyState
            title={t("events.empty.channels.title")}
            description={t("events.empty.channels.description")}
          />
        }
      >
        {(page) => (
          <DataTable
            caption={t("events.caption.channels")}
            columns={columns}
            rows={page.data}
            rowKey={(definition) => definition.id}
          />
        )}
      </AsyncBoundary>

      {inspect ? (
        <SourceDialog
          title={inspect.name ?? inspect.key}
          load={(signal) => eventApi.getChannelModel(inspect.id, signal)}
          onClose={() => setInspect(null)}
        />
      ) : null}
    </>
  );
}

function SourceDialog({
  title,
  load,
  onClose,
}: {
  title: string;
  load: (signal?: AbortSignal) => Promise<unknown>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const model = useAsync((signal) => load(signal), []);

  return (
    <div className="tf-dialog-backdrop" onMouseDown={onClose}>
      <div
        className="tf-dialog tf-dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-label={t("events.source.label", { title })}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="tf-dialog__title">{title}</h2>
        <p className="tf-dialog__description">{t("events.source.description")}</p>
        <AsyncBoundary
          loading={model.loading}
          error={model.error}
          data={model.data}
          onRetry={model.refetch}
        >
          {(value) => <pre className="tf-source">{JSON.stringify(value, null, 2)}</pre>}
        </AsyncBoundary>
        <div className="tf-dialog__actions">
          <Button variant="secondary" onClick={onClose}>
            {t("action.close")}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Send an event ───────────────────────────────────────────────────────── */

function SendEvent({ eventApi }: { eventApi: EventRegistryApi }) {
  const { t } = useI18n();
  const { push } = useToast();
  const [eventKey, setEventKey] = useState("");
  const [channelKey, setChannelKey] = useState("");
  const [payload, setPayload] = useState("{\n  \n}");
  const [busy, setBusy] = useState(false);

  const payloadError = useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(payload);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return t("events.send.notObject");
      }
      return undefined;
    } catch {
      return t("events.send.notJson");
    }
  }, [payload, t]);

  const send = async () => {
    setBusy(true);
    try {
      await eventApi.sendEvent({
        eventDefinitionKey: eventKey.trim(),
        channelDefinitionKey: channelKey.trim(),
        eventPayload: JSON.parse(payload) as Record<string, unknown>,
      });
      push({ tone: "success", message: t("events.send.sent", { key: eventKey.trim() }) });
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? t("events.send.failed"),
        reference: apiError?.correlationId,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tf-signal">
      <p className="tf-note">
        Sends an event into the registry as though it had arrived on the channel — the way
        to confirm a deployed event actually starts what it should. The engine keeps no
        log of received events, so this is the only way to exercise one from here.
      </p>

      <TextInput
        label={t("events.send.eventKey")}
        value={eventKey}
        disabled={busy}
        hint={t("events.send.eventKey.hint")}
        onChange={(event) => setEventKey(event.target.value)}
      />
      <TextInput
        label={t("events.send.channelKey")}
        value={channelKey}
        disabled={busy}
        hint={t("events.send.channelKey.hint")}
        onChange={(event) => setChannelKey(event.target.value)}
      />

      <label className="tf-field">
        <span className="tf-field__label">{t("events.send.payload")}</span>
        <textarea
          className="tf-input tf-textarea tf-source-input"
          rows={8}
          value={payload}
          disabled={busy}
          onChange={(event) => setPayload(event.target.value)}
        />
        {payloadError ? (
          <span className="tf-field__error" role="alert">
            {payloadError}
          </span>
        ) : null}
      </label>

      <Button
        loading={busy}
        disabled={!eventKey.trim() || !channelKey.trim() || Boolean(payloadError)}
        onClick={() => void send()}
      >
        {t("events.send.action")}
      </Button>
    </div>
  );
}
