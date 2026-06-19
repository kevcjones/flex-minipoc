import { createHandler } from "@flex/sdk/http";
import { udp } from "@flex/sdk/udp";

/**
 * Reads back the activity the off-hot-path consumer wrote to UDP under the
 * user's key. Until the consumer has processed the published event, the key is
 * absent and `recorded` is false.
 */
export const handler = createHandler(async (input) => {
  const userId = input.auth.userId ?? "anonymous";
  const last = await udp.get<{ note?: string }>(`${userId}:activity.last`);
  return { recorded: last !== undefined, note: last?.note };
});
