import { createHandler } from "@flex/sdk/http";
import { udp } from "@flex/sdk/udp";

/**
 * Reads back the vehicle the /vehicle emitEvent effect published off the hot
 * path. Until the consumer has processed the event, the key is absent and
 * `seen` is false.
 */
export const handler = createHandler(async (input) => {
  const userId = input.auth.userId ?? "anonymous";
  const last = await udp.get<{
    car?: string;
    car_model?: string;
    car_model_year?: number;
    seenAt?: string;
  }>(`${userId}:vehicle.last`);
  return {
    seen: last !== undefined,
    car: last?.car,
    model: last?.car_model,
    year: last?.car_model_year,
    seenAt: last?.seenAt,
  };
});
