import { defineSubscription } from "@flex/sdk/events";

/** React to the activity.recorded event published off the hot path by POST /dvla/v1/activity. */
export default defineSubscription({
  source: "flex.dvla.activity",
  detailType: "activity.recorded",
});
