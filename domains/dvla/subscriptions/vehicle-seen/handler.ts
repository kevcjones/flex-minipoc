import { onEvent } from "@flex/sdk/events";
import { udp } from "@flex/sdk/udp";

import { VehicleSeen } from "../../events/v1/vehicle-seen";

/**
 * Reacts to vehicle.seen (a tolerant reader of the producer's contract).
 * Persists the vehicle under the user's vehicle.last slot. `payload` is typed
 * from the contract; a producer drift is logged and skipped, not crashed.
 */
export const handler = onEvent(VehicleSeen, async (payload, ctx) => {
  // Stamp when we last saw it, so the read-back changes every run (proof the
  // async write re-ran, not a stale value).
  await udp.put(`${ctx.userId ?? "anonymous"}:vehicle.last`, {
    ...payload,
    seenAt: new Date().toISOString(),
  });
});
