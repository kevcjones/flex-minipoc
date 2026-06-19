import { defineRoute } from "@flex/sdk/routes";
import { z } from "zod";

/**
 * The testing channel (L2): serves a static report page. The Lambda returns the
 * HTML instantly; the browser then runs the DVLA interaction patterns against
 * the gateway and fills each panel in live as calls return (API Gateway buffers
 * responses, so progress is driven client-side, not streamed).
 *
 * auth "none" so the report is directly viewable in a browser.
 */
export default defineRoute({
  kind: "execution",
  auth: "none",
  output: z.string(),
});
