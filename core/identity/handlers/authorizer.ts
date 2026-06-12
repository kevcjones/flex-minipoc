/**
 * The udp-linked:dvla auth strategy, as a REQUEST authorizer lambda.
 *
 * Resolves the upstream record id to fetch for this caller and returns it as
 * authorizer context (linkingId). Pass-through routes substitute it into the
 * upstream URL path; execution handlers read it from input.auth. The channel
 * never chooses it.
 *
 * Resolution: a numeric x-user-id is used directly (so you can pick a record, or
 * an out-of-range id to force drift); otherwise we look up a linked id in UDP;
 * otherwise a default record. POC simplification: x-user-id is trusted as-is, no
 * real One Login OIDC.
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

export async function handler(event: AuthorizerEvent) {
  const userId = header(event.headers, "x-user-id") ?? "demo-user";
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
