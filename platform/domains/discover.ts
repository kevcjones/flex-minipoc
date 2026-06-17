import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

export interface DiscoveredRoute {
  method: string;
  // API path relative to the domain, e.g. "v1/hello". Empty string = domain root.
  apiPath: string;
  // The route folder.
  dir: string;
  // route.ts declaration (config-driven routes). Absent for legacy handlers.
  routeConfig?: string;
  // handler.ts to bundle (execution + legacy routes). Absent for pure pass-through.
  handler?: string;
}

export interface DiscoveredDomain {
  name: string;
  routes: DiscoveredRoute[];
}

// This file lives at platform/domains/, so the contributor planes (domains/,
// channels/) are two levels up.
const PLANES_ROOT = join(__dirname, "..", "..");

/**
 * Filesystem is the source of truth.
 *
 *   domains/<domain>/<...segments>/route.ts      a declared route (config-driven)
 *   domains/<domain>/<...segments>/handler.ts    a handler (execution or legacy)
 *
 * becomes a route on <domain> at the path formed by <...segments>. A folder with
 * a route.ts is wired from its declaration; a folder with only a handler.ts is a
 * legacy execution route. Adding a route is adding a folder. No central list.
 */
/** Discover a plane of route folders (domains/ or channels/). */
export function discoverPlane(planeDir: string): DiscoveredDomain[] {
  if (!existsSync(planeDir)) return [];

  return readdirSync(planeDir)
    .filter((entry) => statSync(join(planeDir, entry)).isDirectory())
    .map((name) => ({
      name,
      routes: discoverRoutes(join(planeDir, name), []),
    }))
    .filter((unit) => unit.routes.length > 0);
}

export function discoverDomains(): DiscoveredDomain[] {
  return discoverPlane(join(PLANES_ROOT, "domains"));
}

export function discoverChannels(): DiscoveredDomain[] {
  return discoverPlane(join(PLANES_ROOT, "channels"));
}

function discoverRoutes(dir: string, segments: string[]): DiscoveredRoute[] {
  const routes: DiscoveredRoute[] = [];

  const routeConfig = join(dir, "route.ts");
  const handler = join(dir, "handler.ts");
  const hasRoute = existsSync(routeConfig);
  const hasHandler = existsSync(handler);

  if (hasRoute || hasHandler) {
    routes.push({
      method: "GET",
      apiPath: segments.join("/"),
      dir,
      routeConfig: hasRoute ? routeConfig : undefined,
      handler: hasHandler ? handler : undefined,
    });
  }

  for (const child of readdirSync(dir)) {
    const childPath = join(dir, child);
    // schema/ holds contracts, not routes; never walk it for routes.
    if (child === "schema") continue;
    if (statSync(childPath).isDirectory()) {
      routes.push(...discoverRoutes(childPath, [...segments, child]));
    }
  }

  return routes;
}
