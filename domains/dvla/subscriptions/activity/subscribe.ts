import { defineSubscription } from "@flex/sdk/events";

import { ActivityRecorded } from "../../events/v1/activity-recorded";

/** React to activity.recorded v1 (imports the producer-owned contract). */
export default defineSubscription(ActivityRecorded);
