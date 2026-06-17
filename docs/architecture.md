# Architecture

One front door over many independently deployed gateways. The folder structure
is the architecture: each top-level folder is an ownership boundary, and the
filesystem is the routing table.

## Planes

- **platform/** the edge and the build system: the front door and the gateway
  builder that turns a folder of routes into a deployed gateway.
- **core/** platform capabilities and SDK fragments, each `@flex/sdk/<name>`:
  udp, telemetry, request (egress), plus the framework modules http
  (`createHandler`), routes (`defineRoute`), identity (the authorizer) and
  front-door (the typed client channels compose with).
- **domains/** L1: contributor business logic, no AWS. A resource per folder.
- **channels/** L2: composition views, no AWS. A screen-shaped response per folder.

## Routes

The folder is the route. `domains/<d>/<...>/route.ts` declares it:

- **pass-through:** the gateway forwards to an upstream, no handler lambda. The
  authorizer's resolved id is injected into the upstream path.
- **execution:** a sibling `handler.ts` runs, with optional post-hooks (small
  config-declared side effects, like recording a preference).

## L1 and L2

- **L1 (domains)** is a resource: one upstream, behind auth, returning a typed
  contract. Apps can call it directly.
- **L2 (channels)** is a view: it composes several L1 calls into one
  channel-shaped response, server-side. A channel exists only to compose; a
  single resource is just an L1 call.

A channel is a domain whose upstream is FLEX itself, so it reuses the same
builder and folder convention.

## Contracts

Every route declares a Zod output schema. That one declaration is both the
build-time typed client (removing a field breaks consumers at compile) and the
runtime drift check (an off-contract upstream is logged, and the request
degrades rather than crashes).
