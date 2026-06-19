import { createHandler, reply } from "@flex/sdk/http";

import { Vehicle } from "../schema/vehicle";

/**
 * Pulls the vehicle for the record id the authorizer resolved, unwraps the
 * upstream `Car` envelope, validates it against the contract, and returns the
 * clean vehicle. The post-hook records the has-vehicle preference in UDP (the
 * yes/no fact, never the vehicle details).
 *
 * Drift is graded: a breaking change (or an out-of-range id, where the upstream
 * returns an error object instead of a car) is warned and the raw upstream body
 * is served rather than failing the request.
 */
const CARS = "https://myfakeapi.com/api/cars";

export const handler = createHandler(async (input) => {
  const id = input.auth.linkingId ?? "1";
  const res = await fetch(`${CARS}/${encodeURIComponent(id)}`);

  if (!res.ok) {
    return reply(502, { error: `upstream ${res.status}` });
  }

  const body = (await res.json()) as { Car?: unknown };
  const parsed = Vehicle.safeParse(body.Car);
  if (!parsed.success) {
    console.warn("DRIFT dvla/vehicle", JSON.stringify(parsed.error.issues));
    return body;
  }

  return parsed.data;
});
