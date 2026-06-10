/**
 * The egress forwarder. It relays an outbound HTTPS request on behalf of a
 * domain, but only to permitted destinations.
 *
 * Controls (the whole point of routing egress through here):
 *  - HTTPS only.
 *  - Default-deny allow-list (exact host or subdomain of an allowed host).
 *  - Hard block of internal / metadata / private targets, so this cannot be
 *    turned into a server-side request forgery tool against our own estate.
 *
 * It is a generic pass-through: it returns the partner's response as-is. The
 * calling domain shapes it. A curated integration would shape it here instead.
 */
const ALLOWLIST: string[] = JSON.parse(process.env.ALLOWLIST ?? "[]");

function json(statusCode: number, data: unknown) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}

function isInternalHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1" || h === "169.254.169.254") {
    return true;
  }
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return false;
}

function isAllowed(host: string): boolean {
  if (isInternalHost(host)) return false;
  return ALLOWLIST.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
}

export const handler = async (event: { body?: string | null }) => {
  const req = event.body ? JSON.parse(event.body) : {};
  const { url, method = "GET", headers = {}, body } = req;

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return json(400, { error: "invalid url" });
  }

  if (target.protocol !== "https:") {
    return json(400, { error: "https only" });
  }
  if (!isAllowed(target.hostname)) {
    return json(403, { error: "destination not permitted", host: target.hostname });
  }

  // Do not follow redirects. An allow-listed host that 302s elsewhere would be
  // an exfiltration channel straight past the allow-list, so a 3xx is returned
  // as-is rather than chased.
  const upstream = await fetch(target.toString(), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });

  const text = await upstream.text();
  return {
    statusCode: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
    },
    body: text,
  };
};
