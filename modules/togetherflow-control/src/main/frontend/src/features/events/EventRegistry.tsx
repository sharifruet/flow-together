/**
 * Event Registry runtime (REQUIREMENTS.md §7.2).
 *
 * What this can and cannot show, established against a running engine:
 *
 * - **Deployed event and channel definitions, with their source** — yes. The `/model`
 *   endpoint returns the JSON exactly as deployed, so an operator can confirm what is
 *   actually live rather than what someone believes was deployed.
 * - **A log of received events** — not from the engine. Despite its name,
 *   `EventInstanceCollectionResource` is POST-only ("Send an event instance"), and the
 *   registry persists repository state only, so there is no inbound record to query.
 *   The `Received` tab therefore reads `togetherflow-event-recorder` (ADR 0015) instead,
 *   and appears **only** where that optional module is deployed — an absent feed and an
 *   empty feed mean different things, and showing a permanently empty table would
 *   conflate them. Without it the screen still offers the honest inverse: send an event
 *   and watch what it starts.
 */

import { useMemo, useState } from "react";
import {
  Badge,
  ApiError,
  AsyncBoundary,
  Button,
  DataTable,
  EmptyState,
  Modal,
  NoResultsState,
  Pagination,
  TextInput,
  formatDateTime,
  useAsync,
  useI18n,
  useToast,
  type ChannelDefinitionResponse,
  type Column,
  type EventDefinitionResponse,
  type EventRecordStatus,
  type EventRecorderApi,
  type EventRegistryApi,
  type RecordedEventResponse,
} from "@togetherflow/common";

type EventTab = "events" | "channels" | "received" | "send";

export interface EventRegistryProps {
  eventApi: EventRegistryApi;
  /** Present only where the optional inbound recorder is deployed (§7.2, ADR 0015). */
  recorderApi?: EventRecorderApi;
}

export function EventRegistry({ eventApi, recorderApi }: EventRegistryProps) {
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
            // Offered only when something is actually recording (ADR 0015).
            ...(recorderApi ? ([["received", t("events.tab.received")]] as const) : []),
            ["send", t("events.tab.send")],
          ] as [EventTab, string][]
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
      ) : tab === "received" && recorderApi ? (
        <ReceivedEvents recorderApi={recorderApi} eventApi={eventApi} />
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
            <Badge tone="info">{definition.type}</Badge>
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

const PAGE_SIZE = 25;

const RECORD_STATUSES: EventRecordStatus[] = ["RECEIVED", "UNRESOLVED", "FAILED"];

/**
 * What actually arrived on a channel (§7.2), read from `togetherflow-event-recorder`.
 *
 * The status column is the reason this screen is worth having. "Nothing happened" has
 * two causes an operator cannot otherwise tell apart — the event never arrived, or it
 * arrived and resolved to nothing — and `UNRESOLVED` is the row that separates them.
 */
function ReceivedEvents({
  recorderApi,
  eventApi,
}: {
  recorderApi: EventRecorderApi;
  eventApi: EventRegistryApi;
}) {
  const { t, locale } = useI18n();
  const [channelKey, setChannelKey] = useState("");
  const [status, setStatus] = useState<EventRecordStatus | "">("");
  const [start, setStart] = useState(0);
  const [inspect, setInspect] = useState<RecordedEventResponse | null>(null);

  /*
   * The channel filter is populated from the deployed channel definitions rather than
   * from distinct values in the log: a channel that has received nothing yet is exactly
   * the one an operator wants to select, and it would be missing from a DISTINCT.
   */
  const channels = useAsync(
    (signal) => eventApi.listChannelDefinitions({ latest: true }, signal),
    [eventApi],
  );

  const { data, error, loading, refetch } = useAsync(
    (signal) =>
      recorderApi.list(
        {
          start,
          size: PAGE_SIZE,
          ...(channelKey ? { channelKey } : {}),
          ...(status ? { status } : {}),
        },
        signal,
      ),
    [recorderApi, channelKey, status, start],
  );

  const filtered = channelKey !== "" || status !== "";
  const clearFilters = () => {
    setChannelKey("");
    setStatus("");
    setStart(0);
  };

  const columns = useMemo<Column<RecordedEventResponse>[]>(
    () => [
      {
        key: "received",
        header: t("events.received.column.when"),
        width: "190px",
        render: (row) => formatDateTime(row.receivedAt, locale),
      },
      {
        key: "event",
        header: t("events.received.column.event"),
        render: (row) => (
          <div className="tf-task-cell">
            <span className="tf-task-cell__name">
              {row.eventKey ?? t("events.received.noEventKey")}
            </span>
            <span className="tf-task-cell__description">
              {row.channelKey ?? t("events.received.noChannel")}
            </span>
          </div>
        ),
      },
      {
        key: "status",
        header: t("events.received.column.status"),
        width: "150px",
        render: (row) => (
          <Badge
            tone={
              row.status === "RECEIVED" ? "info" : row.status === "UNRESOLVED" ? "warning" : "danger"
            }
          >
            {t(`events.received.status.${row.status}`)}
          </Badge>
        ),
      },
      {
        key: "actions",
        header: "",
        width: "120px",
        render: (row) => (
          <Button variant="ghost" onClick={() => setInspect(row)}>
            {t("events.received.inspect")}
          </Button>
        ),
      },
    ],
    [locale, t],
  );

  return (
    <>
      <p className="tf-note">{t("events.received.note")}</p>

      <div className="tf-filter-bar">
        <label className="tf-filter-bar__field">
          <span className="tf-filter-bar__label">{t("events.received.filter.channel")}</span>
          <select
            className="tf-input"
            value={channelKey}
            onChange={(event) => {
              setChannelKey(event.target.value);
              setStart(0);
            }}
          >
            <option value="">{t("events.received.filter.allChannels")}</option>
            {(channels.data?.data ?? []).map((channel) => (
              <option key={channel.id} value={channel.key}>
                {channel.name ?? channel.key}
              </option>
            ))}
          </select>
        </label>

        <label className="tf-filter-bar__field">
          <span className="tf-filter-bar__label">{t("events.received.filter.status")}</span>
          <select
            className="tf-input"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as EventRecordStatus | "");
              setStart(0);
            }}
          >
            <option value="">{t("events.received.filter.anyStatus")}</option>
            {RECORD_STATUSES.map((value) => (
              <option key={value} value={value}>
                {t(`events.received.status.${value}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <AsyncBoundary
        loading={loading}
        error={error}
        data={data}
        onRetry={refetch}
        isEmpty={(page) => page.data.length === 0}
        empty={
          // §14.1 wants these distinguished: a filter that matched nothing is a
          // different problem from a recorder that has seen nothing at all.
          filtered ? (
            <NoResultsState onClear={clearFilters} />
          ) : (
            <EmptyState
              title={t("events.received.empty.title")}
              description={t("events.received.empty.description")}
            />
          )
        }
      >
        {(page) => (
          <>
            <DataTable
              caption={t("events.received.caption")}
              columns={columns}
              rows={page.data}
              rowKey={(row) => row.id}
            />
            <Pagination
              start={page.start}
              size={page.size || PAGE_SIZE}
              total={page.total}
              onChange={setStart}
            />
          </>
        )}
      </AsyncBoundary>

      {inspect ? <RecordedEventDialog event={inspect} onClose={() => setInspect(null)} /> : null}
    </>
  );
}

function RecordedEventDialog({
  event,
  onClose,
}: {
  event: RecordedEventResponse;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();

  return (
    <Modal
      open
      size="lg"
      title={event.eventKey ?? t("events.received.noEventKey")}
      description={t("events.received.dialog.meta", {
        channel: event.channelKey ?? t("events.received.noChannel"),
        when: formatDateTime(event.receivedAt, locale),
      })}
      onClose={onClose}
      actions={
        <Button variant="secondary" onClick={onClose}>
          {t("action.close")}
        </Button>
      }
    >

        {event.status === "FAILED" && event.errorMessage ? (
          <p className="tf-danger-text" role="alert">
            {event.errorMessage}
          </p>
        ) : null}

        {event.status === "UNRESOLVED" ? (
          <p className="tf-note">{t("events.received.dialog.unresolved")}</p>
        ) : null}

        {/*
          A recorder configured with `store-payload: false` keeps the arrival but not
          the contents (§13.7). Saying so beats rendering an empty <pre> that reads as
          an empty payload.
        */}
        {event.payload == null ? (
          <p className="tf-muted">{t("events.received.dialog.payloadNotStored")}</p>
        ) : (
          <>
            <pre className="tf-source">{event.payload}</pre>
            {event.truncated ? (
              <p className="tf-muted">{t("events.received.dialog.truncated")}</p>
            ) : null}
          </>
        )}

    </Modal>
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
    <Modal
      open
      size="lg"
      title={title}
      description={t("events.source.description")}
      onClose={onClose}
      actions={
        <Button variant="secondary" onClick={onClose}>
          {t("action.close")}
        </Button>
      }
    >
        <AsyncBoundary
          loading={model.loading}
          error={model.error}
          data={model.data}
          onRetry={model.refetch}
        >
          {(value) => <pre className="tf-source">{JSON.stringify(value, null, 2)}</pre>}
        </AsyncBoundary>
    </Modal>
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
