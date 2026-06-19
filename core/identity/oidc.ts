/**
 * OIDC token verification. Standards only: a JWT signed by the IdP, verified
 * against its published JWKS (signature, issuer, audience, expiry). FLEX is a
 * relying party; it never mints or signs tokens. Point it at STS (which extends
 * One Login) by setting the env below; until then the authorizer falls back to a
 * demo header.
 */
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";

export interface OidcConfig {
  issuer: string;
  jwksUrl: string;
  audience?: string;
}

/** OIDC config from env, or undefined when not configured (demo fallback). */
export function oidcConfig(): OidcConfig | undefined {
  const issuer = process.env.FLEX_OIDC_ISSUER;
  const jwksUrl = process.env.FLEX_OIDC_JWKS_URL;
  if (!issuer || !jwksUrl) return undefined;
  return { issuer, jwksUrl, audience: process.env.FLEX_OIDC_AUDIENCE };
}

// The remote JWKS is cached across invocations (keys are fetched once and rotated
// by jose), so verification adds no per-request network call in the warm path.
let cachedKeys: JWTVerifyGetKey | undefined;
let cachedUrl: string | undefined;
function remoteKeys(jwksUrl: string): JWTVerifyGetKey {
  if (!cachedKeys || cachedUrl !== jwksUrl) {
    cachedKeys = createRemoteJWKSet(new URL(jwksUrl));
    cachedUrl = jwksUrl;
  }
  return cachedKeys;
}

/**
 * Verify a bearer token against the IdP and return its claims. Throws if the
 * signature, issuer, audience, or expiry do not check out. `getKey` is injectable
 * for tests; in production it is the IdP's remote JWKS.
 */
export async function verifyToken(
  token: string,
  cfg: OidcConfig,
  getKey?: JWTVerifyGetKey,
): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, getKey ?? remoteKeys(cfg.jwksUrl), {
    issuer: cfg.issuer,
    audience: cfg.audience,
  });
  return payload;
}
