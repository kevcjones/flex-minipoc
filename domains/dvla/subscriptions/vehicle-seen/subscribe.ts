import { defineSubscription } from "@flex/sdk/events";

/** React to the vehicle.seen event emitted off the hot path by GET /dvla/v1/vehicle. */
export default defineSubscription({
  source: "flex.dvla.vehicle",
  detailType: "vehicle.seen",
});
