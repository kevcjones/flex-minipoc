/**
 * UDP SDK fragment (think @flex/sdk-udp).
 *
 * Owned by the UDP team and co-located with the UDP service in this folder.
 * Versioned independently of other fragments. Consumers import it as
 * @flex/sdk/udp, via a tsconfig path wildcard that maps each fragment subpath
 * to its core folder.
 */
function base(): string {
  const url = process.env.FLEX_UDP_URL;
  if (!url) {
    throw new Error("FLEX_UDP_URL is not set (the platform injects this)");
  }
  return url.replace(/\/$/, "");
}

function dataUrl(key: string): string {
  return `${base()}/v1/data/${encodeURIComponent(key)}`;
}

async function put(key: string, value: unknown): Promise<void> {
  const res = await fetch(dataUrl(key), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`udp.put failed: ${res.status}`);
}

async function get<T = unknown>(key: string): Promise<T | undefined> {
  const res = await fetch(dataUrl(key));
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`udp.get failed: ${res.status}`);
  return (await res.json()) as T;
}

async function remove(key: string): Promise<void> {
  const res = await fetch(dataUrl(key), { method: "DELETE" });
  if (!res.ok) throw new Error(`udp.remove failed: ${res.status}`);
}

export const udp = { put, get, remove };
