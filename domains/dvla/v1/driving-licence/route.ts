import { defineRoute } from "@flex/sdk/routes";

import { DrivingLicence } from "../../schema/driving-licence";

/**
 * Execution. A handler pulls the licence, validates it against the contract
 * inline (drift), and an inline post-hook records the preference "this user has
 * a driving licence" in UDP. UDP holds the yes/no fact, never the licence
 * details.
 */
export default defineRoute({
  kind: "execution",
  auth: "udp-linked:dvla",
  output: DrivingLicence,
  post: [{ udpWrite: { key: "dvla.hasDrivingLicence", value: true } }],
  drift: "inline",
});
