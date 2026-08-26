/**
 * Inbound event log (REQUIREMENTS.md §7.2, ADR 0015).
 *
 * Not an engine endpoint. The event registry engine keeps no record of what arrived on a
 * channel — `EventInstanceCollectionResource` is POST-only, it *sends* — so this reads
 * the optional `togetherflow-event-recorder`, which records inbound events from inside
 * the application hosting the engine and exposes them over its own `GET`.
 *
 * Hand-written rather than generated, like the attachment gateway's client: the spec
 * codegen in §8 covers the engine's own OpenAPI documents, and this endpoint belongs to
 * a TogetherFlow module that has none.
 *
 * Most deployments do not run the recorder. `EventRecorderApi` is only constructed when
 * the deployment configures a base URL, and Control hides the whole view otherwise —
 * an empty feed and an absent feed mean very different things to an operator.
 */

import type { ApiClient } from "./client";
import type { DataResponse } from "./types";

/**
 * What became of one inbound payload.
 *
 * `unresolved` is the interesting one: it means the payload arrived and the registry
 * could not turn it into any event — a key detector that matched no definition, or a
 * filter that dropped it. Without this feed that case is indistinguishable from the
 * event never having been sent at all.
 */
export type EventRecordStatus = "RECEIVED" | "UNRESOLVED" | "FAILED";

export interface RecordedEventResponse {
  id: string;
  /** ISO-8601, as the recorder saw it — not when the producer sent it. */
  receivedAt: string;
  channelKey?: string | null;
  /** Null unless the payload resolved to an event definition. */
  eventKey?: string | null;
  tenantId?: string | null;
  status: EventRecordStatus;
  /** Absent when the deployment records arrivals but not their contents. */
  payload?: string | null;
  /** True when `payload` was cut to the recorder's configured maximum. */
  truncated?: boolean;
  /** Why the pipeline rejected it; set only when `status` is `FAILED`. */
  errorMessage?: string | null;
}

export interface EventRecordQuery {
  channelKey?: string;
  eventKey?: string;
  tenantId?: string;
  status?: EventRecordStatus;
  receivedAfter?: string;
  receivedBefore?: string;
  start?: number;
  size?: number;
}

export class EventRecorderApi {
  constructor(private readonly client: ApiClient) {}

  /**
   * Newest first, server-side paged (§8). The recorder caps `size` at 100 regardless of
   * what is asked for, so a caller cannot turn this into an unbounded load.
   */
  list(
    query: EventRecordQuery = {},
    signal?: AbortSignal,
  ): Promise<DataResponse<RecordedEventResponse>> {
    return this.client.request("/event-recorder/events", {
      query: {
        size: 25,
        ...query,
        // Every list in every app filters by the active tenant (§8 multi-tenancy).
        tenantId: query.tenantId ?? this.client.tenantId,
      },
      signal,
    });
  }
}
