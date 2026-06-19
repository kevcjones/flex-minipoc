import { defineRoute } from "@flex/sdk/routes";

import { User } from "../schema/user";

/**
 * Pass-through. The gateway forwards to the upstream with the record id chosen
 * by the authorizer substituted into the URL path ({id}). No handler lambda.
 * Typed to consumers purely from `output`.
 */
export default defineRoute({
  kind: "passthrough",
  auth: "udp-linked:dvla",
  output: User,
  cache: { perUser: true, ttl: 300 },
  target: "GET https://myfakeapi.com/api/users/{id}",
});
