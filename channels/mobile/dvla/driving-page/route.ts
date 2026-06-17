import { defineRoute } from "@flex/sdk/routes";
import { z } from "zod";

/**
 * A channel view. Structurally an execution route whose upstream is the FLEX
 * front door: it composes L1 resources into one mobile-shaped payload. Output is
 * the channel's own contract (what the app receives).
 */
const DrivingPage = z.object({
  title: z.string(),
  vehicle: z.string().nullable(),
  vin: z.string().nullable(),
});

export default defineRoute({
  kind: "execution",
  auth: "udp-linked:dvla",
  output: DrivingPage,
});
