import { defineRoute } from "@flex/sdk/routes";

import { VehicleSeen } from "../../schema/vehicle-seen";

/**
 * Read from Dynamo. Reads back what the /vehicle route's emitEvent effect
 * published off the hot path and the consumer wrote to UDP. Proves the async,
 * response-derived event landed.
 */
export default defineRoute({
  kind: "execution",
  auth: "udp-linked:dvla",
  output: VehicleSeen,
});
