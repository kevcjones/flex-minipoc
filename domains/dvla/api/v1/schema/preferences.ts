import { z } from "zod";

/**
 * The Preferences contract. A small non-PII projection of what FLEX has stored
 * for the user, read back from UDP (Dynamo). Never the upstream record, just the
 * derived yes/no facts.
 */
export const Preferences = z.object({
  hasVehicle: z.boolean(),
});

export type Preferences = z.infer<typeof Preferences>;
