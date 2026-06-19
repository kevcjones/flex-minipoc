import { udp } from "../../udp/sdk";

/**
 * The off-hot-path consumer. EventBridge delivers events from the publish route
 * (POST dvla/v1/activity) and the emitEvent effect (e.g. GET dvla/v1/vehicle);
 * this writes the payload to UDP under the user's key, asynchronously, so the
 * durable write never touched the caller's response path.
 *
 * Convention: the detail carries `userId` (scope) and `key` (the UDP slot); the
 * rest is the payload. Keying by `key` lets one consumer serve every publisher
 * without clobbering (activity.last vs vehicle.last, etc).
 */
export const handler = async (event: {
  detail?: { userId?: string; key?: string; [field: string]: unknown };
}) => {
  const { userId, key, ...payload } = event.detail ?? {};
  await udp.put(`${userId ?? "anonymous"}:${key ?? "activity.last"}`, payload);
};
