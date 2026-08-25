/**
 * Event Registry REST wrappers (REQUIREMENTS.md §7.4.6).
 *
 * Verified against a running engine:
 *
 * - The event registry is mounted at its own servlet (`/event-registry-api` by default).
 * - `POST /event-registry-repository/deployments` accepts **only** `.event` and
 *   `.channel` files — no zip or bar, unlike the process and app engines.
 * - Event and channel definitions are plain JSON, and round-trip losslessly: the model
 *   endpoint returns exactly what was deployed.
 *
 * There is no draft repository for events, so TogetherFlow stores drafts in the generic
 * model repository (opaque bytes, category `togetherflow:event`) like every other model
 * type — which is what makes Open Question 7's "add a backend module" option unnecessary.
 */

import type { ApiClient } from "./client";
import type { DataResponse } from "./types";

export interface EventDefinitionResponse {
  id: string;
  url?: string;
  key: string;
  version: number;
  name?: string;
  category?: string;
  deploymentId?: string;
  resourceName?: string;
  tenantId?: string;
}

export interface ChannelDefinitionResponse extends EventDefinitionResponse {
  type?: string;
  implementation?: string;
}

export interface EventDeploymentResponse {
  id: string;
  name?: string;
  category?: string;
  deploymentTime?: string | null;
  tenantId?: string;
}

/* ── The JSON shapes the engine reads ────────────────────────────────────── */

export interface EventPayloadEntry {
  name: string;
  type: string;
  /** Marks the field used to correlate an incoming event with a waiting instance. */
  correlationParameter?: boolean;
  /** Read from the transport header rather than the body. */
  header?: boolean;
}

export interface EventFileModel {
  key: string;
  name: string;
  payload: EventPayloadEntry[];
}

export type ChannelDirection = "inbound" | "outbound";

export interface ChannelFileModel {
  key: string;
  name: string;
  description?: string;
  channelType: ChannelDirection;
  /** Transport: jms, kafka, rabbit. */
  type: string;
  destination?: string;
  /** Inbound only: how the payload is read. */
  deserializerType?: string;
  /** Outbound only. */
  serializerType?: string;
  /** Which event key an inbound message maps to. */
  channelEventKeyDetection?: { fixedValue?: string; jsonField?: string; jsonPointerExpression?: string };
}

export const PAYLOAD_TYPES = ["string", "integer", "double", "boolean", "json"] as const;
export const CHANNEL_TRANSPORTS = ["jms", "kafka", "rabbit"] as const;

export class EventRegistryApi {
  constructor(private readonly client: ApiClient) {}

  listEventDefinitions(
    query: { start?: number; size?: number; latest?: boolean } = {},
    signal?: AbortSignal,
  ): Promise<DataResponse<EventDefinitionResponse>> {
    return this.client.request("/event-registry-repository/event-definitions", {
      query: { size: 50, latest: query.latest ?? true, start: query.start },
      signal,
    });
  }

  listChannelDefinitions(
    query: { start?: number; size?: number; latest?: boolean } = {},
    signal?: AbortSignal,
  ): Promise<DataResponse<ChannelDefinitionResponse>> {
    return this.client.request("/event-registry-repository/channel-definitions", {
      query: { size: 50, latest: query.latest ?? true, start: query.start },
      signal,
    });
  }

  /**
   * Deploys a single `.event` or `.channel` file. This endpoint takes one file and
   * does **not** accept an archive, so a model carrying both an event and a channel
   * has to be deployed as two calls.
   */
  deploy(kind: "event" | "channel", key: string, json: string): Promise<EventDeploymentResponse> {
    const fileName = `${(key || kind).replace(/[^\w.-]+/g, "-")}.${kind}`;
    const form = new FormData();
    form.append(fileName, new Blob([json], { type: "application/json" }), fileName);
    return this.client.request("/event-registry-repository/deployments", {
      method: "POST",
      query: { tenantId: this.client.tenantId },
      body: form,
    });
  }
}

/** What a `togetherflow:event` draft stores: an event, a channel, or both. */
export interface EventDraft {
  event?: EventFileModel;
  channel?: ChannelFileModel;
}

export function emptyEventDraft(key: string, name: string): EventDraft {
  return {
    event: {
      key,
      name,
      payload: [{ name: "id", type: "string", correlationParameter: true }],
    },
  };
}

export function parseEventDraft(source: string | null, fallbackKey: string, fallbackName: string): EventDraft {
  if (source) {
    try {
      const parsed = JSON.parse(source) as EventDraft;
      if (parsed && (parsed.event || parsed.channel)) return parsed;
    } catch {
      // A malformed draft should not block editing.
    }
  }
  return emptyEventDraft(fallbackKey, fallbackName);
}

export function emptyChannel(key: string, name: string): ChannelFileModel {
  return {
    key: `${key}Channel`,
    name: `${name} channel`,
    channelType: "inbound",
    type: "jms",
    destination: "",
    deserializerType: "json",
    channelEventKeyDetection: { fixedValue: key },
  };
}
