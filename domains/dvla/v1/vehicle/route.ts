import { emit } from "@flex/sdk/events";
import { defineRoute } from "@flex/sdk/routes";

import { VehicleSeen } from "../../events/v1/vehicle-seen";
import { Vehicle } from "../../schema/vehicle";

/**
 * Execution. A handler pulls the vehicle for the authorizer's record id,
 * unwraps the upstream envelope, and validates it against the contract inline
 * (drift). Two effects run after it returns, showing both timings from one
 * handler:
 *  - udpWrite (inline): record the yes/no preference "has a vehicle" in UDP.
 *  - emitEvent (off the hot path): publish the fetched vehicle as a domain
 *    event; a consumer persists it under vehicle.last. This carries the
 *    response (ctx.data), which the request-only publish route cannot see.
 */
export default defineRoute({
  kind: "execution",
  auth: "udp-linked:dvla",
  output: Vehicle,
  effects: [
    { udpWrite: { key: "dvla.hasVehicle", value: true } },
    emit(VehicleSeen),
  ],
  drift: "inline",
});
