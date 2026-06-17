import { z } from "zod";

/**
 * The User contract. The upstream (myfakeapi) wraps the record in a `User`
 * envelope and the pass-through forwards it verbatim, so the contract is the
 * wrapped shape. We declare only the safe subset we care about; the upstream
 * also returns fields like `password` that the pass-through forwards in the raw
 * bytes but that the contract (and the typed consumer) deliberately ignore. If
 * you need to strip them, that is a reason to use an execution route, not a
 * pass-through.
 */
export const User = z.object({
  User: z.object({
    id: z.number(),
    first_name: z.string(),
    last_name: z.string(),
    email: z.string(),
    gender: z.string(),
    birthdate: z.string(),
    job_title: z.string(),
  }),
});

export type User = z.infer<typeof User>;
