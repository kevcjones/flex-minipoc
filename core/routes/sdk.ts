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
import type { ZodTypeAny } from "zod";

import type { AuthStrategy } from "../identity/sdk";
import type { TransformSpec } from "../transform/sdk";

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

interface BaseRoute {
  auth: AuthStrategy;
  output: ZodTypeAny;
  input?: ZodTypeAny;
  cache?: CachePolicy;
}

export interface PassthroughRoute extends BaseRoute {
  kind: "passthrough";
  /** "<METHOD> <uri>", where uri may contain a {placeholder} the builder resolves. */
  target: string;
  /**
   * Tier 2: reshape the upstream response in the gateway (VTL compiled from this
   * spec), no handler lambda. Absent = tier 1, forward the body verbatim.
   */
  transform?: TransformSpec;
}

export interface ExecutionRoute extends BaseRoute {
  kind: "execution";
  /** Hooks run after the handler returns, before the response leaves. */
  post?: PostHook[];
  /** How to verify the upstream/result against output. Default inline. */
  drift?: "inline" | "off";
}

export type RouteConfig = PassthroughRoute | ExecutionRoute;

/** Identity helper: keeps the literal type while validating the shape. */
export function defineRoute<T extends RouteConfig>(config: T): T {
  return config;
}
