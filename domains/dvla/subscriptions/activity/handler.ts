import { udp } from "@flex/sdk/udp";

/**
 * Reacts to activity.recorded (published off the hot path by POST
 * /dvla/v1/activity). Persists the note under the user's activity.last slot.
 */
export const handler = async (event: {
  detail?: { userId?: string; note?: string };
}) => {
  const { userId, ...rest } = event.detail ?? {};
  await udp.put(`${userId ?? "anonymous"}:activity.last`, rest);
};
