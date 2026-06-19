/**
 * The typed front door (@flex/front-door).
 *
 * The registry of L1 routes and their contracts, with createView bound to it.
 * Channel views import createView from here and get fully typed, drift-safe
 * access to the resources they compose. In a full build this map is generated
 * from the route declarations; here it is written by hand, matching how the
 * old consumer/ stub worked.
 */
import { makeView, type Registry } from "@flex/sdk/front-door";

import { User } from "../domains/dvla/api/v1/schema/user";
import { Vehicle } from "../domains/dvla/api/v1/schema/vehicle";

export const routes = {
  "GET /dvla/v1/user": { output: User },
  "GET /dvla/v1/vehicle": { output: Vehicle },
} satisfies Registry;

export const createView = makeView(routes);
export { reply } from "@flex/sdk/front-door";
