import assert from "node:assert/strict";
import test from "node:test";

import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTVerifyGetKey,
} from "jose";

import { verifyToken, type OidcConfig } from "./oidc";

const CFG: OidcConfig = {
  issuer: "https://sts.example",
  jwksUrl: "https://sts.example/.well-known/jwks.json",
  audience: "flex",
};

/** A test IdP: an ES256 key, its JWKS, and a way to mint tokens. */
async function idp() {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "test-key";
  jwk.alg = "ES256";
  const keys: JWTVerifyGetKey = createLocalJWKSet({ keys: [jwk] });
  const sign = (claims: Record<string, unknown>, overrides: { iss?: string; aud?: string; exp?: string } = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "ES256", kid: "test-key" })
      .setIssuer(overrides.iss ?? CFG.issuer)
      .setAudience(overrides.aud ?? "flex")
      .setExpirationTime(overrides.exp ?? "5m")
      .sign(privateKey);
  return { keys, sign };
}

test("verifies a valid token and returns the subject", async () => {
  const { keys, sign } = await idp();
  const token = await sign({ sub: "user-123" });
  const claims = await verifyToken(token, CFG, keys);
  assert.equal(claims.sub, "user-123");
});

test("rejects a token signed by an untrusted key", async () => {
  const minter = await idp();
  const verifier = await idp(); // different keypair
  const token = await minter.sign({ sub: "user-123" });
  await assert.rejects(() => verifyToken(token, CFG, verifier.keys));
});

test("rejects a token with the wrong issuer", async () => {
  const { keys, sign } = await idp();
  const token = await sign({ sub: "user-123" }, { iss: "https://evil.example" });
  await assert.rejects(() => verifyToken(token, CFG, keys));
});

test("rejects a token with the wrong audience", async () => {
  const { keys, sign } = await idp();
  const token = await sign({ sub: "user-123" }, { aud: "someone-else" });
  await assert.rejects(() => verifyToken(token, CFG, keys));
});

test("rejects an expired token", async () => {
  const { keys, sign } = await idp();
  const token = await sign({ sub: "user-123" }, { exp: "-1m" });
  await assert.rejects(() => verifyToken(token, CFG, keys));
});
