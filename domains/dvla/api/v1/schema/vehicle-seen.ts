import { z } from "zod";

/**
 * The vehicle-seen read-back contract. Reads what the off-hot-path consumer
 * wrote from the /vehicle emitEvent effect, proving the async event landed.
 * `seen` is false until the consumer has processed the event.
 */
export const VehicleSeen = z.object({
  seen: z.boolean(),
  car: z.string().optional(),
  model: z.string().optional(),
  year: z.number().optional(),
  seenAt: z.string().optional(),
});

export type VehicleSeen = z.infer<typeof VehicleSeen>;
