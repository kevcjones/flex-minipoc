import { udp } from "../udp/sdk";
import type { EffectContext } from "./types";

/**
 * udpWrite: persist a small preference to UDP, scoped to the user. A yes/no fact
 * (e.g. "has a vehicle: true"), never the response body. Runs inline after the
 * handler returns.
 */
export interface UdpWrite {
  key: string;
  value: unknown;
}

/** Scope a preference key to the user so one user never reads another's. */
function scopedKey(userId: string | undefined, key: string): string {
  return `${userId ?? "anonymous"}:${key}`;
}

export function run(cfg: UdpWrite, ctx: EffectContext): Promise<void> {
  return udp.put(scopedKey(ctx.input.auth.userId, cfg.key), cfg.value);
}
