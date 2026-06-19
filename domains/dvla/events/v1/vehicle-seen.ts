import { defineEvent } from "@flex/sdk/events";
import { z } from "zod";

/**
 * The vehicle.seen event (v1), produced by GET /dvla/v1/vehicle. DVLA owns this
 * contract: it decides what the event carries. Consumers import it and read the
 * subset they need. The version lives in the detailType, so a v2 can run beside
 * it without touching v1 producers or consumers.
 */
export const VehicleSeen = defineEvent({
  source: "flex.dvla.vehicle",
  detailType: "vehicle.seen.v1",
  payload: z.object({
    id: z.number(),
    car: z.string(),
    car_model: z.string(),
    car_model_year: z.number(),
  }),
});
