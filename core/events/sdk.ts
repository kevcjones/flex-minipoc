/**
 * Event subscriptions (@flex/sdk/events).
 *
 * The async counterpart to defineRoute. A domain declares what it reacts to in
 * domains/<domain>/subscriptions/<name>/subscribe.ts, beside a sibling
 * handler.ts. The builder discovers it and wires an EventBridge rule + lambda
 * target on the domain bus. Reactions are domain-owned and colocated with the
 * routes that produce the events: things that change together live together.
 */
export interface Subscription {
  /** EventBridge source to match, e.g. "flex.dvla.vehicle". */
  source: string;
  /** EventBridge detail-type to match, e.g. "vehicle.seen". */
  detailType: string;
}

/** Identity helper: declares an event subscription, default-exported by subscribe.ts. */
export function defineSubscription(s: Subscription): Subscription {
  return s;
}
