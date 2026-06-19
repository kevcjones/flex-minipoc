/**
 * The route declaration model (@flex/sdk/routes).
 *
 * Contributor-facing framework, the sibling of @flex/sdk/http: createHandler
 * adapts a handler, defineRoute declares a route. A route folder under domains/
 * carries a route.ts that default-exports defineRoute({...}); the builder
 * (platform/domains/stack.ts) imports each at synth and wires a gateway from the
 * declaration.
 *
 * Three tiers:
 *  - passthrough:           the gateway forwards to an upstream, no lambda.
 *  - passthrough+transform: the gateway reshapes the response with VTL, no
 *                           lambda (tier 2). See @flex/sdk/transform.
 *  - execution:             a sibling handler.ts runs, with optional post-hooks.
 *
 * The output schema is a Zod contract. It is the single source for the typed
 * consumer (build time) and for drift detection (runtime). It plays no part in
 * how the gateway is wired, so a pass-through is fully typed to consumers with
 * no compute behind it.
 */
import type { z, ZodTypeAny } from "zod";

import type { AuthStrategy } from "../identity/sdk";
import type { TransformField, TransformSpec } from "../transform/sdk";

export type { AuthStrategy };
export type { TransformSpec };

export interface CachePolicy {
  /** Cache per user (the user id becomes part of the cache key). */
  perUser: boolean;
  /** Time to live in seconds. */
  ttl: number;
}

/**
 * Post-hook config. A list of single-key objects, each naming a registered hook
 * and its config. Serialised into the lambda env and run inline by createHandler
 * after the handler returns. Async dispatch is the production form, not built
 * here.
 */
export interface UdpWriteHook {
  // Writes a small preference value, never the response body. UDP holds
  // preferences (e.g. "has a driving licence: true"), not records of the data.
  udpWrite: { key: string; value: unknown };
}
export type PostHook = UdpWriteHook;

interface BaseRoute<O extends ZodTypeAny> {
  auth: AuthStrategy;
  output: O;
  input?: ZodTypeAny;
  cache?: CachePolicy;
}

/**
 * The transform's output-shape map, bound to the route's `output` contract.
 * Every key must be an output field, so referencing a field that does not exist
 * (a typo, a renamed schema) or dropping a required one is a compile error, not
 * a silent runtime surprise. The contract drives what you can map.
 */
type TransformFor<O extends ZodTypeAny> = {
  fields: { [K in keyof z.infer<O> & string]: TransformField };
};

export interface PassthroughRoute<O extends ZodTypeAny = ZodTypeAny>
  extends BaseRoute<O> {
  kind: "passthrough";
  /** "<METHOD> <uri>", where uri may contain a {placeholder} the builder resolves. */
  target: string;
  /**
   * Tier 2: reshape the upstream response in the gateway (VTL compiled from this
   * spec), no handler lambda. Absent = tier 1, forward the body verbatim.
   */
  transform?: TransformFor<O>;
}

export interface ExecutionRoute<O extends ZodTypeAny = ZodTypeAny>
  extends BaseRoute<O> {
  kind: "execution";
  /** Hooks run after the handler returns, before the response leaves. */
  post?: PostHook[];
  /** How to verify the upstream/result against output. Default inline. */
  drift?: "inline" | "off";
  /** Lambda timeout in seconds. Default 10. Raise for composition views that
   * fan out to several back-door calls. */
  timeout?: number;
}

/**
 * A write off the hot path, no handler lambda. The gateway publishes the request
 * to the router (EventBridge) via a VTL request template and returns an ack
 * immediately; an async consumer does the durable write. `output` is the ack
 * shape the caller gets back, not the written record.
 */
export interface PublishRoute<O extends ZodTypeAny = ZodTypeAny>
  extends BaseRoute<O> {
  kind: "publish";
  event: {
    /** EventBridge event source, e.g. "flex.dvla.activity". */
    source: string;
    /** EventBridge detail-type, e.g. "activity.recorded". */
    detailType: string;
    /** Maps the request into the event detail (same vocabulary as transform). */
    detail: TransformSpec;
  };
}

export type RouteConfig<O extends ZodTypeAny = ZodTypeAny> =
  | PassthroughRoute<O>
  | ExecutionRoute<O>
  | PublishRoute<O>;

/**
 * Identity helper: infers the output schema so the transform (and anything else
 * bound to the contract) is type-checked against it, and validates the shape.
 */
export function defineRoute<O extends ZodTypeAny>(
  config: RouteConfig<O>,
): RouteConfig<O> {
  return config;
}
