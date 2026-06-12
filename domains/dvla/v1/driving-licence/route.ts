import { defineRoute } from "../../../../platform/routes/define";
import { DrivingLicence } from "../../schema/driving-licence";

/**
 * Execution. A handler pulls the licence, validates it against the contract
 * inline (drift), and an inline post-hook writes it to UDP as a preference.
 */
export default defineRoute({
  kind: "execution",
  auth: "udp-linked:dvla",
  output: DrivingLicence,
  post: [{ udpWrite: { key: "dvla.drivingLicence" } }],
  drift: "inline",
});
