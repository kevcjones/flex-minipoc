import { z } from "zod";

/**
 * The ack returned by an off-hot-path write. The caller gets this back
 * immediately (202); the durable write happens asynchronously after.
 */
export const Ack = z.object({
  accepted: z.boolean(),
});

export type Ack = z.infer<typeof Ack>;
