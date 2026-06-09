/**
 * Telemetry ingest. Write-only: accept an event and log it to CloudWatch.
 * No storage infrastructure, which keeps this capability distinct from UDP.
 */
export const handler = async (event: { body?: string | null }) => {
  const payload = event.body ? JSON.parse(event.body) : {};

  console.log("TELEMETRY", JSON.stringify(payload));

  return {
    statusCode: 202,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accepted: true }),
  };
};
