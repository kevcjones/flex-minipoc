/**
 * Front-door SDK (@flex/sdk/front-door): the machinery a channel view uses to
 * compose L1 resources.
 *
 * Generic and domain-agnostic. The typed route registry (route -> contract) is
 * supplied by generated glue (front-door/index.ts) via makeView, so this module
 * never imports a domain. A view is just an execution handler whose upstream is
 * the FLEX front door itself.
 *
 * The client is drift-safe: ctx.get returns { ok: true, data } or { ok: false }
 * (with a drift warning logged on a contract violation), so a view can never
 * crash on a bad upstream and chooses how to degrade.
 */
import type { z, ZodTypeAny } from "zod";

import { createHandler, reply } from "../http/sdk";

export { reply };

export type Registry = Record<string, { output: ZodTypeAny }>;
type Infer<R extends Registry, K extends keyof R> = z.infer<R[K]["output"]>;

export type Result<T> = { ok: true; data: T } | { ok: false; status: number };

export interface ViewContext<R extends Registry> {
  identity: { userId?: string };
  get<K extends keyof R>(key: K): Promise<Result<Infer<R, K>>>;
}

/** Bind the typed registry, yielding a createView the channel views import. */
export function makeView<R extends Registry>(routes: R) {
  return (fn: (ctx: ViewContext<R>) => Promise<unknown> | unknown) =>
    createHandler(async (input) => {
      const base = (process.env.FLEX_FRONT_DOOR_URL ?? "").replace(/\/$/, "");
      const userId = input.auth.userId;

      const ctx: ViewContext<R> = {
        identity: { userId },
        async get<K extends keyof R>(key: K): Promise<Result<Infer<R, K>>> {
          const [method, path] = String(key).split(" ");
          const res = await fetch(`${base}${path}`, {
            method,
            headers: userId ? { "x-user-id": userId } : {},
          });
          if (!res.ok) return { ok: false, status: res.status };

          const raw = await res.json();
          const parsed = routes[key].output.safeParse(raw);
          if (!parsed.success) {
            console.warn(`DRIFT ${String(key)}`, JSON.stringify(parsed.error.issues));
            return { ok: false, status: 502 };
          }
          return { ok: true, data: parsed.data as Infer<R, K> };
        },
      };

      return fn(ctx);
    });
}
