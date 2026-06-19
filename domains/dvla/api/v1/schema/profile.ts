import { z } from "zod";

/**
 * The Profile contract. The tier-2 transform reshapes the upstream `User`
 * envelope into this flat, renamed, safe shape in the gateway. Note what is not
 * here: `password`. The user/ route forwards it verbatim (its doc flags that as
 * a reason to use execution); the transform tier drops it with no compute by
 * simply not selecting it.
 */
export const Profile = z.object({
  id: z.number(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  // jobTitle shows `default` (fallback when the upstream omits it).
  jobTitle: z.string(),
  // displayName shows `coalesce` (first non-empty of several paths).
  displayName: z.string(),
  // source shows `const` (a literal stamped on every response, no upstream).
  source: z.string(),
});

export type Profile = z.infer<typeof Profile>;
