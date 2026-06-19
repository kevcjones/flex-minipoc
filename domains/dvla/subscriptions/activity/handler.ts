import { onEvent } from "@flex/sdk/events";
import { udp } from "@flex/sdk/udp";

import { ActivityRecorded } from "../../events/v1/activity-recorded";

/**
 * Reacts to activity.recorded (a tolerant reader of the producer's contract).
 * Persists the note under the user's activity.last slot.
 */
export const handler = onEvent(ActivityRecorded, async (payload, ctx) => {
  await udp.put(`${ctx.userId ?? "anonymous"}:activity.last`, payload);
});
