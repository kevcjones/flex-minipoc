import { defineRoute } from "@flex/sdk/routes";
import { z } from "zod";

/**
 * The minimal FLEX domain: one execution route that returns a message. Shows the
 * smallest real shape (api/ facet, versioned path, a declared route beside its
 * handler) without any upstream, auth, or events. The richer patterns live in
 * the dvla domain.
 */
export default defineRoute({
  kind: "execution",
  auth: "none",
  output: z.object({ message: z.string() }),
});
