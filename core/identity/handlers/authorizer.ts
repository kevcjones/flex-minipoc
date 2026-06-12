/**
 * The udp-linked:dvla auth strategy, as a REQUEST authorizer lambda.
 *
 * Takes the user id from a stub x-user-id header (stands in for a verified
 * token), looks up that user's DVLA linking id in UDP, and returns it as
 * authorizer context. Pass-through routes map linkingId into an upstream header;
 * execution handlers read it from input.auth. The channel never sees it.
 *
 * POC simplification: x-user-id is trusted as-is (no real One Login OIDC), and a
 * missing user falls back to a demo user so the walkthrough stays frictionless.
 * Real Flex would reject an unverified caller.
 */
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

async function resolveLinkingId(userId: string): Promise<string> {
  const base = (process.env.FLEX_UDP_URL ?? "").replace(/\/$/, "");
  const key = encodeURIComponent(`linking:${userId}`);
  try {
    const res = await fetch(`${base}/v1/data/${key}`);
    if (res.ok) {
      const value = await res.json();
      if (typeof value === "string") return value;
    }
  } catch {
    // fall through to the stub
  }
  return `stub-link-${userId}`;
}

export async function handler(event: AuthorizerEvent) {
  const userId = header(event.headers, "x-user-id") ?? "demo-user";
  const linkingId = await resolveLinkingId(userId);

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
