import type { z } from "zod";

import { User } from "../domains/dvla/schema/user";
import { Vehicle } from "../domains/dvla/schema/vehicle";

/**
 * The typed surface handed to channel teams. Keys are routes; each carries its
 * output contract. In a full build this map is generated from the route.ts
 * declarations; here it is written by hand to keep the POC small. The types flow
 * by inference, so removing a field from a schema is a compile error wherever a
 * consumer reads it.
 */
export const routes = {
  "GET /dvla/v1/user": { output: User },
  "GET /dvla/v1/vehicle": { output: Vehicle },
} as const;

export type Routes = typeof routes;
export type Output<K extends keyof Routes> = z.infer<Routes[K]["output"]>;
