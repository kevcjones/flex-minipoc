/**
 * The route declaration model.
 *
 * A route folder under domains/ carries a route.ts that default-exports
 * defineRoute({...}). The builder (platform/domains/stack.ts) imports each at
 * synth and wires a gateway from the declaration. The folder is still the route;
 * the file now describes it.
 *
 * Two kinds:
 *  - passthrough: the gateway forwards to an upstream, no handler lambda.
 *  - execution:   a sibling handler.ts runs, with optional post-hooks.
 *
 * The output schema is a Zod contract. It is the single source for the typed
 * consumer (build time) and for drift detection (runtime). It plays no part in
 * how the gateway is wired, so a pass-through is fully typed to consumers with
 * no compute behind it.
 */
import type { ZodTypeAny } from "zod";

/** Named auth strategies the platform provides. Domains configure, not code. */
export type AuthStrategy = "none" | "udp-linked:dvla";

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
  udpWrite: { key: string };
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
