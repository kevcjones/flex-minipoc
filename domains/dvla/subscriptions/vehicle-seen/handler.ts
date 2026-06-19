import { udp } from "@flex/sdk/udp";

/**
 * Reacts to vehicle.seen (emitted off the hot path by GET /dvla/v1/vehicle).
 * Persists the fetched vehicle under the user's vehicle.last slot. This domain
 * owns both the reaction and where it stores the result; the emitter only
 * announced the event.
 */
export const handler = async (event: {
  detail?: { userId?: string; [field: string]: unknown };
}) => {
  const { userId, ...car } = event.detail ?? {};
  await udp.put(`${userId ?? "anonymous"}:vehicle.last`, car);
};
