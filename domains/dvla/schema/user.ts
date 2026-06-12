import { z } from "zod";

/**
 * The User contract. Source of truth for the typed consumer and for drift
 * detection. Channel-neutral: facts about the user, no presentation.
 */
export const User = z.object({
  id: z.string(),
  name: z.string(),
  dateOfBirth: z.string(),
  address: z.string(),
});

export type User = z.infer<typeof User>;
