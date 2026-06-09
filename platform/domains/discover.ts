import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

export interface DiscoveredRoute {
  method: string;
  // API path relative to the domain, e.g. "v1/hello". Empty string = domain root.
  apiPath: string;
  // Absolute path to the handler file to bundle.
  entry: string;
}

export interface DiscoveredDomain {
  name: string;
  routes: DiscoveredRoute[];
}

// This file lives at platform/domains/, so the contributor domains/ folder is
// two levels up.
const DOMAINS_DIR = join(__dirname, "..", "..", "domains");

/**
 * Filesystem is the source of truth.
 *
 *   domains/<domain>/<...segments>/handler.ts
 *
 * becomes a route on <domain> at the path formed by <...segments>. So
 * domains/foo/v1/hello/handler.ts is GET /v1/hello on domain foo, reachable
 * publicly at /foo/v1/hello.
 *
 * Adding a route is adding a folder with a handler.ts. Adding a domain is
 * adding a top-level folder. No central list to edit.
 */
export function discoverDomains(): DiscoveredDomain[] {
  if (!existsSync(DOMAINS_DIR)) return [];

  return readdirSync(DOMAINS_DIR)
    .filter((entry) => statSync(join(DOMAINS_DIR, entry)).isDirectory())
    .map((name) => ({
      name,
      routes: discoverRoutes(join(DOMAINS_DIR, name), []),
    }))
    .filter((domain) => domain.routes.length > 0);
}

function discoverRoutes(dir: string, segments: string[]): DiscoveredRoute[] {
  const routes: DiscoveredRoute[] = [];

  const handler = join(dir, "handler.ts");
  if (existsSync(handler)) {
    routes.push({ method: "GET", apiPath: segments.join("/"), entry: handler });
  }

  for (const child of readdirSync(dir)) {
    const childPath = join(dir, child);
    if (statSync(childPath).isDirectory()) {
      routes.push(...discoverRoutes(childPath, [...segments, child]));
    }
  }

  return routes;
}
