import { defineRoute } from "@flex/sdk/routes";

import { Profile } from "../schema/profile";

/**
 * Tier 2: pass-through + transform. Same upstream as user/, but the gateway
 * reshapes the response with VTL (no Lambda): it unwraps the `User` envelope,
 * flattens and renames to a flat profile, and drops `password` by simply not
 * selecting it. This is the exact case the user/ schema doc flagged as "a
 * reason to use an execution route"; the transform tier does it with no compute.
 *
 * The transform keys are bound to the Profile contract: rename a Profile field
 * or mistype a key here and the build fails, before anything deploys.
 *
 * It exercises the whole vocabulary:
 *  - pick/rename/flatten: id, firstName, lastName, email
 *  - omit:                password is never selected
 *  - default:             jobTitle falls back when the upstream omits it
 *  - coalesce:            displayName is the first non-empty of name then email
 *  - const:              source is stamped literally
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
      jobTitle: { from: "$.User.job_title", default: "Unknown" },
      displayName: {
        coalesce: ["$.User.first_name", "$.User.email"],
        default: "Anonymous",
      },
      source: { const: "dvla" },
    },
  },
});
