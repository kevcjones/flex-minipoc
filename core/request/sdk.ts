/**
 * Egress SDK fragment (@flex/sdk/request).
 *
 * A domain says "fetch this URL" and gets the response. It does not know the
 * call is relayed through the egress gateway, that an allow-list applies, or
 * that any of this is AWS. The platform injects the gateway URL as
 * FLEX_REQUEST_URL.
 */
function base(): string {
  const url = process.env.FLEX_REQUEST_URL;
  if (!url) {
    throw new Error("FLEX_REQUEST_URL is not set (the platform injects this)");
  }
  return url.replace(/\/$/, "");
}

interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

async function fetchUrl<T = unknown>(
  url: string,
  opts: FetchOptions = {},
): Promise<T> {
  const res = await fetch(`${base()}/v1/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      method: opts.method ?? "GET",
      headers: opts.headers,
      body: opts.body,
    }),
  });

  if (res.status === 403) throw new Error(`request blocked by allow-list: ${url}`);
  if (!res.ok) throw new Error(`request failed: ${res.status}`);

  return (await res.json()) as T;
}

export const request = {
  fetch: fetchUrl,
  get: <T = unknown>(url: string) => fetchUrl<T>(url, { method: "GET" }),
};
