import { defineRoute } from "@flex/sdk/routes";
import { z } from "zod";

/**
 * The testing channel (L2): a deployed view that runs the DVLA interaction
 * patterns live and renders a single HTML report (a diagram per pattern, the
 * real calls with before/after state, and per-call latency). It composes over
 * the back-door like any channel; here the composed output is a page, not JSON.
 *
 * auth "none" so the report is directly viewable in a browser; the handler
 * injects a demo identity (x-user-id) on its own back-door calls.
 */
export default defineRoute({
  kind: "execution",
  auth: "none",
  output: z.string(),
  // Fans out to several back-door calls plus a short async poll; give it room.
  timeout: 29,
});
