import { createHandler } from "@flex/sdk/http";
import { telemetry } from "@flex/sdk/telemetry";
import { udp } from "@flex/sdk/udp";

/**
 * Plain domain logic: no AWS shapes, no statusCode/body. It uses two Flex core
 * capabilities through the SDK and returns plain data; @flex/sdk/http adapts it
 * to the gateway.
 */
export const handler = createHandler(async () => {
  const key = "foo-visits";

  const current = (await udp.get<{ count: number }>(key))?.count ?? 0;
  const count = current + 1;
  await udp.put(key, { count });

  await telemetry.emit({ domain: "foo", event: "visit", count });

  return {
    domain: "foo",
    message: `visit #${count}: stored via UDP SDK, logged via telemetry SDK`,
    count,
  };
});
