/**
 * Mock DVLA /driving-licence. Stands in for the real external system.
 *
 * Requires x-dvla-linking-id (401 without). ?break=1 returns a
 * contract-violating shape (categories as a string, missing fields) to
 * demonstrate inline drift in the execution route.
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
  const licence = broken
    ? { licenceNumber: "LIC-9", categories: "B" }
    : {
        licenceNumber: "LIC-9",
        categories: ["B", "BE"],
        validFrom: "2018-01-01",
        validTo: "2028-01-01",
        status: "valid",
      };

  return json(200, licence);
}
