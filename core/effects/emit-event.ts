import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";

import type { EffectContext } from "./types";

/**
 * emitEvent: publish a named domain event off the hot path. Unlike udpWrite,
 * this names no destination; it announces a fact to the router (EventBridge) and
 * any consumer reacts. The detail carries the handler's response (ctx.data), so
 * this is how an execution route emits something derived from what it fetched,
 * not just from the request.
 *
 * Timing: off the hot path. The PutEvents call itself is awaited (a few ms) so
 * the event is durably accepted before the response returns; the actual work
 * (the consumer's write) happens asynchronously, off the caller's latency path.
 * Awaiting a cheap emit is the reliable pattern: a lambda cannot do work after
 * it returns.
 */
export interface EmitEvent {
  /** EventBridge event source, e.g. "flex.dvla.vehicle". */
  source: string;
  /** EventBridge detail-type, e.g. "vehicle.seen". */
  detailType: string;
  /** UDP slot the consumer writes the payload under, scoped to the user. */
  key: string;
}

const client = new EventBridgeClient({});

export async function run(cfg: EmitEvent, ctx: EffectContext): Promise<void> {
  const busName = process.env.FLEX_EVENT_BUS_NAME;
  if (!busName) return;

  const payload =
    ctx.data && typeof ctx.data === "object" ? ctx.data : { value: ctx.data };

  await client.send(
    new PutEventsCommand({
      Entries: [
        {
          EventBusName: busName,
          Source: cfg.source,
          DetailType: cfg.detailType,
          // userId scopes the consumer's write; key names the slot; the rest is
          // the response payload the consumer persists.
          Detail: JSON.stringify({
            userId: ctx.input.auth.userId,
            key: cfg.key,
            ...payload,
          }),
        },
      ],
    }),
  );
}
