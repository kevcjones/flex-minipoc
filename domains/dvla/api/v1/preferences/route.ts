import { defineRoute } from "@flex/sdk/routes";

import { Preferences } from "../schema/preferences";

/**
 * Read from Dynamo. Reads back the preference the vehicle route wrote on its hot
 * path (dvla.hasVehicle), which proves that sync write landed. Execution tier: a
 * pass-through cannot read the internal UDP store, so this needs compute.
 */
export default defineRoute({
  kind: "execution",
  auth: "udp-linked:dvla",
  output: Preferences,
});
