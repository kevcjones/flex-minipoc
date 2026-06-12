import { createHandler } from "@flex/sdk/http";

import { DrivingLicence } from "../../schema/driving-licence";

/**
 * Pulls the licence from the (mock) upstream using the linking id the authorizer
 * resolved, validates it against the contract, and returns it. The post-hook
 * declared in route.ts writes the result to UDP after this returns.
 *
 * Drift is graded: an additive change still parses (extra keys are stripped); a
 * breaking change (missing or wrong-typed field) is warned and the raw upstream
 * is served rather than failing the request.
 */
export const handler = createHandler(async (input) => {
  const base = (process.env.FLEX_MOCK_DVLA_URL ?? "").replace(/\/$/, "");
  const res = await fetch(`${base}/driving-licence`, {
    headers: { "x-dvla-linking-id": input.auth.linkingId ?? "" },
  });

  if (!res.ok) {
    return { status: 502, data: { error: `upstream ${res.status}` } };
  }

  const raw = await res.json();
  const parsed = DrivingLicence.safeParse(raw);
  if (!parsed.success) {
    console.warn("DRIFT dvla/driving-licence", JSON.stringify(parsed.error.issues));
    return raw;
  }

  return parsed.data;
});
