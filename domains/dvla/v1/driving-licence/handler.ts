import { createHandler, reply } from "@flex/sdk/http";

import { DrivingLicence } from "../../schema/driving-licence";

/**
 * Pulls the licence from the (mock) upstream using the linking id the authorizer
 * resolved, validates it against the contract, and returns it. The post-hook
 * declared in route.ts records the has-licence preference in UDP after this
 * returns (the yes/no fact, never the licence details).
 *
 * Drift is graded: an additive change still parses (extra keys are stripped); a
 * breaking change (missing or wrong-typed field) is warned and the raw upstream
 * is served rather than failing the request.
 */
export const handler = createHandler(async (input) => {
  const base = (process.env.FLEX_MOCK_DVLA_URL ?? "").replace(/\/$/, "");
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(input.query)) if (v != null) search.set(k, v);
  const qs = search.toString();
  const res = await fetch(`${base}/driving-licence${qs ? `?${qs}` : ""}`, {
    headers: { "x-dvla-linking-id": input.auth.linkingId ?? "" },
  });

  if (!res.ok) {
    return reply(502, { error: `upstream ${res.status}` });
  }

  const raw = await res.json();
  const parsed = DrivingLicence.safeParse(raw);
  if (!parsed.success) {
    console.warn("DRIFT dvla/driving-licence", JSON.stringify(parsed.error.issues));
    return raw;
  }

  return parsed.data;
});
