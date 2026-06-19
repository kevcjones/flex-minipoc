import { defineEvent } from "@flex/sdk/events";
import { z } from "zod";

/**
 * The activity.recorded event (v1), produced off the hot path by
 * POST /dvla/v1/activity. DVLA owns the contract; the subscription consumes it.
 */
export const ActivityRecorded = defineEvent({
  source: "flex.dvla.activity",
  detailType: "activity.recorded.v1",
  payload: z.object({
    note: z.string(),
  }),
});
