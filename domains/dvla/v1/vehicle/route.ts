import { defineRoute } from "@flex/sdk/routes";

import { Vehicle } from "../../schema/vehicle";

/**
 * Execution. A handler pulls the vehicle for the authorizer's record id,
 * unwraps the upstream envelope, validates it against the contract inline
 * (drift), and an inline post-hook records the preference "this user has a
 * vehicle" in UDP. UDP holds the yes/no fact, never the vehicle details.
 */
export default defineRoute({
  kind: "execution",
  auth: "udp-linked:dvla",
  output: Vehicle,
  post: [{ udpWrite: { key: "dvla.hasVehicle", value: true } }],
  drift: "inline",
});
