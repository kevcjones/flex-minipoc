import { udp } from "../../udp/sdk";

/**
 * The off-hot-path consumer. EventBridge delivers the event published by a
 * publish route (e.g. POST dvla/v1/activity); this writes the detail to UDP
 * under the user's key, asynchronously, so the durable write never touched the
 * caller's response path. The userId was stamped into the detail by the gateway
 * VTL template.
 */
export const handler = async (event: {
  detail?: { userId?: string; [key: string]: unknown };
}) => {
  const { userId, ...rest } = event.detail ?? {};
  await udp.put(`${userId ?? "anonymous"}:activity.last`, rest);
};
