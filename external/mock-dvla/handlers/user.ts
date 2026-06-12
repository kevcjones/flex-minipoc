/**
 * Mock DVLA /user. Stands in for the real external system.
 *
 * Requires x-dvla-linking-id (401 without), so the pass-through proves the
 * gateway injected the per-user token. ?break=1 returns a contract-violating
 * shape to demonstrate drift.
 */
interface Event {
  headers?: Record<string, string | undefined> | null;
  queryStringParameters?: Record<string, string | undefined> | null;
}

function header(
  headers: Record<string, string | undefined> | null | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name) return value;
  }
  return undefined;
}

function json(statusCode: number, data: unknown) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}

export async function handler(event: Event) {
  const linkingId = header(event.headers, "x-dvla-linking-id");
  if (!linkingId) return json(401, { error: "missing x-dvla-linking-id" });

  const broken = event.queryStringParameters?.break === "1";
  const user = broken
    ? { id: "U-1001", name: "Ada Lovelace" }
    : {
        id: "U-1001",
        name: "Ada Lovelace",
        dateOfBirth: "1815-12-10",
        address: "London",
      };

  return json(200, user);
}
