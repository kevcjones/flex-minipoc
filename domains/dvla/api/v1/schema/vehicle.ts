import { z } from "zod";

/**
 * The Vehicle contract. The upstream (myfakeapi) wraps the record in a `Car`
 * envelope; the execution route unwraps it and validates the inner object, so
 * the contract is the unwrapped shape. Source of truth for the typed consumer
 * and for inline drift detection.
 */
export const Vehicle = z.object({
  id: z.number(),
  car: z.string(),
  car_model: z.string(),
  car_color: z.string(),
  car_model_year: z.number(),
  car_vin: z.string(),
  price: z.string(),
  availability: z.boolean(),
});

export type Vehicle = z.infer<typeof Vehicle>;
