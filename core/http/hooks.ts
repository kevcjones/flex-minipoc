/**
 * Post-hook runtime.
 *
 * The route declares post-hooks as config; the builder serialises them into the
 * lambda env (FLEX_POST_HOOKS); createHandler runs them here after the handler
 * returns. This keeps the hook owned by config, not baked into the handler, and
 * runs it in-process (no extra hop).
 *
 * POC simplification: hooks run inline, so a write is on the response path. The
 * production form dispatches side-effect hooks async (emit to a queue, a
 * consumer writes), which keeps them off the user's latency path.
 */
import { udp } from "../udp/sdk";
import type { HandlerInput } from "./sdk";

export interface HookContext {
  data: unknown;
  input: HandlerInput;
}

type Hook = (cfg: unknown, ctx: HookContext) => Promise<void>;

/** Scope a preference key to the user so one user never reads another's. */
function scopedKey(userId: string | undefined, key: string): string {
  return `${userId ?? "anonymous"}:${key}`;
}

const registry: Record<string, Hook> = {
  // Persist a preference, never the response body. The value is configured on
  // the route (e.g. true for "has a driving licence"), so the licence details
  // themselves never reach UDP.
  udpWrite: async (cfg, ctx) => {
    const { key, value } = cfg as { key: string; value: unknown };
    await udp.put(scopedKey(ctx.input.auth.userId, key), value);
  },
};

export async function runPostHooks(
  raw: string | undefined,
  ctx: HookContext,
): Promise<void> {
  if (!raw) return;
  const hooks = JSON.parse(raw) as Array<Record<string, unknown>>;
  for (const hook of hooks) {
    for (const [name, cfg] of Object.entries(hook)) {
      const run = registry[name];
      if (run) await run(cfg, ctx);
    }
  }
}
