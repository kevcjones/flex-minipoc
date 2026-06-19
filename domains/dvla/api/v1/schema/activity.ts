import { z } from "zod";

/**
 * The activity read-back contract. Reads what the off-hot-path consumer wrote to
 * UDP, proving the async write completed. `recorded` is false until the consumer
 * has processed the event.
 */
export const ActivityLog = z.object({
  recorded: z.boolean(),
  note: z.string().optional(),
});

export type ActivityLog = z.infer<typeof ActivityLog>;
