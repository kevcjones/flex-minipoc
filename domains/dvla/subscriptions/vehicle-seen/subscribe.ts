import { defineSubscription } from "@flex/sdk/events";

import { VehicleSeen } from "../../events/v1/vehicle-seen";

/** React to vehicle.seen v1 (imports the producer-owned contract). */
export default defineSubscription(VehicleSeen);
