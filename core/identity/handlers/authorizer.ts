/**
 * The udp-linked:dvla auth strategy, as a REQUEST authorizer lambda.
 *
 * Resolves the caller's identity, then the upstream record id to fetch for them,
 * and returns both as authorizer context (userId, linkingId). Pass-through routes
 * substitute linkingId into the upstream URL path; execution handlers read it from
 * input.auth. The channel never chooses it.
 *
 * Two identity paths:
 *  - Real: a bearer JWT from the IdP (STS, which extends One Login). When OIDC is
 *    configured (FLEX_OIDC_ISSUER + FLEX_OIDC_JWKS_URL) and a token is present, it
 *    is verified (signature/issuer/audience/expiry) and its subject is the userId.
 *    An invalid token is rejected (401).
 *  - Demo: with no bearer token, x-user-id is trusted as-is. A numeric value is a
 *    record id (pick one, or an out-of-range id to force drift). Remove this
 *    fallback in production so a token is always required.
 *
 * The userId then maps to the upstream record id via UDP (linking:<userId>).
 */
import { oidcConfig, verifyToken } from "../oidc";

interface AuthorizerEvent {
  type: string;
  methodArn: string;
  headers?: Record<string, string | undefined> | null;
}

function header(
  headers: Record<string, string | undefined> | null | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return value;
  }
  return undefined;
}

async function resolveId(userId: string): Promise<string> {
  if (/^\d+$/.test(userId)) return userId;

  const base = (process.env.FLEX_UDP_URL ?? "").replace(/\/$/, "");
  const key = encodeURIComponent(`linking:${userId}`);
  try {
    const res = await fetch(`${base}/v1/data/${key}`);
    if (res.ok) {
      const value = await res.json();
      if (typeof value === "string" || typeof value === "number") {
        return String(value);
      }
    }
  } catch {
    // fall through to the default record
  }
  return "7";
}

/** The bearer token, if the Authorization header carries one. */
function bearer(
  headers: Record<string, string | undefined> | null | undefined,
): string | undefined {
  const value = header(headers, "authorization");
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : undefined;
}

/**
 * Resolve the caller's userId. Real path: verify the IdP token (throws if
 * invalid, which the handler turns into a 401). Demo path: trust x-user-id.
 */
async function resolveUserId(event: AuthorizerEvent): Promise<string> {
  const token = bearer(event.headers);
  const cfg = oidcConfig();
  if (token && cfg) {
    const claims = await verifyToken(token, cfg);
    if (!claims.sub) throw new Error("token has no subject");
    return claims.sub;
  }
  return header(event.headers, "x-user-id") ?? "demo-user";
}

export async function handler(event: AuthorizerEvent) {
  let userId: string;
  try {
    userId = await resolveUserId(event);
  } catch {
    // An invalid token is unauthenticated: API Gateway returns 401.
    throw new Error("Unauthorized");
  }

  const linkingId = await resolveId(userId);

  return {
    principalId: userId,
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: "Allow",
          Resource: event.methodArn,
        },
      ],
    },
    context: { userId, linkingId },
  };
}
