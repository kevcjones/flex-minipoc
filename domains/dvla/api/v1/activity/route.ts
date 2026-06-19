import { defineRoute } from "@flex/sdk/routes";

import { ActivityRecorded } from "../../../events/v1/activity-recorded";
import { Ack } from "../schema/ack";

/**
 * Write off the hot path, no Lambda. API Gateway publishes the request to the
 * router (EventBridge) via a VTL request template and returns 202 immediately;
 * a consumer writes it to UDP asynchronously, so it never sits on the caller's
 * latency path. The detail map projects the request body into the event (the
 * platform stamps the userId). Read it back at GET dvla/v1/activity-log.
 *
 * Wired as POST by the builder (publish routes are writes).
 */
export default defineRoute({
  kind: "publish",
  auth: "udp-linked:dvla",
  output: Ack,
  event: {
    // Identity from the producer-owned contract; detail maps the request body.
    source: ActivityRecorded.source,
    detailType: ActivityRecorded.detailType,
    detail: {
      fields: {
        note: "$.note",
      },
    },
  },
});
