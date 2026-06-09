/**
 * Telemetry SDK fragment (think @flex/sdk-telemetry).
 *
 * Owned by the Telemetry team, co-located with the telemetry service here, and
 * versioned independently. Consumers import it as @flex/sdk/telemetry, via a
 * tsconfig path wildcard that maps each fragment subpath to its core folder.
 * Write-only.
 */
function base(): string {
  const url = process.env.FLEX_TELEMETRY_URL;
  if (!url) {
    throw new Error("FLEX_TELEMETRY_URL is not set (the platform injects this)");
  }
  return url.replace(/\/$/, "");
}

async function emit(event: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${base()}/v1/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
  if (!res.ok) throw new Error(`telemetry.emit failed: ${res.status}`);
}

export const telemetry = { emit };
