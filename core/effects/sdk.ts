/**
 * Effects (@flex/sdk/effects): side effects a route declares to run after its
 * handler returns, e.g. `effects: [{ udpWrite: { key, value } }]`.
 *
 * Why this is data plus a runtime, not a function on the route: the route is
 * read at synth but effects run inside the lambda, so the config crosses that
 * boundary as JSON in the lambda env (FLEX_EFFECTS). You cannot serialise a
 * closure, so an effect is declarative data here, interpreted at runtime there.
 *
 * Where an effect lives: one module per effect (its config type and its
 * behaviour together), so a name in `effects: [...]` maps to exactly one file
 * (udpWrite -> ./udp-write). `EffectConfigs` below is the single source: both
 * the declarable `Effect` union and the runtime `registry` are derived from it,
 * so adding an effect is one entry and each implementation is fully typed.
 */
import type { EffectContext } from "./types";
import * as udpWrite from "./udp-write";

export type { EffectContext };
export type { UdpWrite } from "./udp-write";

/** The single source: effect name -> its config type. */
interface EffectConfigs {
  udpWrite: udpWrite.UdpWrite;
}

/** A declarable effect: a single-key object pairing one effect with its config. */
export type Effect = {
  [K in keyof EffectConfigs]: { [P in K]: EffectConfigs[P] };
}[keyof EffectConfigs];

type Runner<K extends keyof EffectConfigs> = (
  cfg: EffectConfigs[K],
  ctx: EffectContext,
) => Promise<void>;

/** name -> runtime. Typed against EffectConfigs, so each entry takes its config. */
const registry: { [K in keyof EffectConfigs]: Runner<K> } = {
  udpWrite: udpWrite.run,
};

/**
 * Run the effects serialised into the lambda env after the handler returns. The
 * only cast is at the JSON boundary (parse loses the key/config correlation);
 * each effect implementation in the registry is fully typed.
 */
export async function runEffects(
  raw: string | undefined,
  ctx: EffectContext,
): Promise<void> {
  if (!raw) return;
  const effects = JSON.parse(raw) as Effect[];
  for (const effect of effects) {
    for (const [name, cfg] of Object.entries(effect)) {
      const run = registry[name as keyof EffectConfigs];
      if (run) await run(cfg as never, ctx);
    }
  }
}
