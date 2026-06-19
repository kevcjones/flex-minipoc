import { defineRoute } from "@flex/sdk/routes";

import { ActivityLog } from "../../schema/activity";

/**
 * Read from Dynamo. Reads back the activity the POST dvla/v1/activity route
 * published off the hot path and the consumer wrote to UDP. Proves the async
 * write completed.
 */
export default defineRoute({
  kind: "execution",
  auth: "udp-linked:dvla",
  output: ActivityLog,
});
