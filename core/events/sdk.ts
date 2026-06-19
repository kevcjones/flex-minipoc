/**
 * Events (@flex/sdk/events).
 *
 * An event is producer-owned: the domain that emits it decides what it is and
 * publishes a typed contract (defineEvent). The emitter emits against it; a
 * consumer imports it and reacts as a tolerant reader (onEvent), taking only the
 * fields it needs and degrading safely if the producer drifts. The version rides
 * in the detailType (e.g. "vehicle.seen.v1"), so v1 and v2 can circulate
 * together and a consumer can import both and branch.
 */
import type { z, ZodTypeAny } from "zod";

import type { EmitEvent } from "../effects/emit-event";

export interface EventContract<P extends ZodTypeAny = ZodTypeAny> {
  /** EventBridge source, e.g. "flex.dvla.vehicle". */
  source: string;
  /** EventBridge detail-type; carries the version, e.g. "vehicle.seen.v1". */
  detailType: string;
  /** The published payload shape. Consumers read a subset of this. */
  payload: P;
}

/** Declare a producer-owned event contract, imported by the emitter and consumers. */
export function defineEvent<P extends ZodTypeAny>(
  event: EventContract<P>,
): EventContract<P> {
  return event;
}

/**
 * The emit effect for a route: publishes the handler's response as this event,
 * off the hot path. Identity (source/detailType, incl version) comes from the
 * contract, so there are no magic strings and the emitter and its consumers
 * cannot drift apart on the name.
 */
export function emit(event: EventContract): { emitEvent: EmitEvent } {
  return { emitEvent: { source: event.source, detailType: event.detailType } };
}

export interface Subscription {
  source: string;
  detailType: string;
}

/** Bind a subscription to an event contract; the builder makes the rule from it. */
export function defineSubscription(event: EventContract): Subscription {
  return { source: event.source, detailType: event.detailType };
}

/**
 * Wrap a consumer reaction: parse the event detail against the contract payload
 * (tolerant reader, logs and skips on drift), and hand the typed payload plus
 * the userId the emitter stamped.
 */
export function onEvent<P extends ZodTypeAny>(
  event: EventContract<P>,
  react: (payload: z.infer<P>, ctx: { userId?: string }) => Promise<void>,
) {
  return async (raw: { detail?: Record<string, unknown> }): Promise<void> => {
    const { userId, ...rest } = (raw.detail ?? {}) as { userId?: string };
    const parsed = event.payload.safeParse(rest);
    if (!parsed.success) {
      console.warn(
        `DRIFT ${event.detailType}`,
        JSON.stringify(parsed.error.issues),
      );
      return;
    }
    await react(parsed.data as z.infer<P>, { userId });
  };
}
