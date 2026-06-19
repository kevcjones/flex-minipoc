import { defineRoute } from "@flex/sdk/routes";

import { Profile } from "../../schema/profile";

/**
 * Tier 2: pass-through + transform. Same upstream as user/, but the gateway
 * reshapes the response with VTL (no Lambda): it unwraps the `User` envelope,
 * flattens and renames to a flat profile, and drops `password` by simply not
 * selecting it. This is the exact case the user/ schema doc flagged as "a
 * reason to use an execution route"; the transform tier does it with no compute.
 */
export default defineRoute({
  kind: "passthrough",
  auth: "udp-linked:dvla",
  output: Profile,
  cache: { perUser: true, ttl: 300 },
  target: "GET https://myfakeapi.com/api/users/{id}",
  transform: {
    fields: {
      id: "$.User.id",
      firstName: "$.User.first_name",
      lastName: "$.User.last_name",
      email: "$.User.email",
    },
  },
});
