import { createHandler } from "@flex/sdk/http";
import { udp } from "@flex/sdk/udp";

/**
 * Reads the user's stored preference from UDP (Dynamo) and returns it. The
 * vehicle route writes `dvla.hasVehicle` on its hot path under the same
 * user-scoped key; this reads it back, demonstrating a read from the store.
 */
export const handler = createHandler(async (input) => {
  const userId = input.auth.userId ?? "anonymous";
  const hasVehicle = await udp.get<boolean>(`${userId}:dvla.hasVehicle`);
  return { hasVehicle: hasVehicle === true };
});
