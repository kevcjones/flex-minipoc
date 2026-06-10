# Principles behind this proof of concept

This is an exploration, not a critique. The Flex platform made sensible choices
for where it was, and several ideas here only became easy because earlier work
taught us what mattered. This POC is a what-if: a small, deployed sandbox to
test whether a handful of principles could make the CDK side simpler and the
contributor experience nicer. Treat it as a conversation starter.

Each principle below states what the POC optimises for and where you can see it
in the code.

## 1. One front door, one origin

The platform presents a single public entry point and a single CloudFront
origin. The public domains sit behind it and are reached by path; the edge stays
stable as the number of things behind it grows. Core capabilities are not
exposed here, they sit on a separate internal surface (see the simplifications),
so the front door fans out only to what is meant to be public.

In this POC: CloudFront points at one public API Gateway custom domain, which
routes by base path to the domain gateways. Core capabilities live on a second
custom domain that CloudFront does not front. The public front door is
unaffected by what sits behind it.

## 2. Independent units

Every domain and every core capability is its own deployable unit, with its own
gateway, deployment, and blast radius. Each one attaches itself to a shared
surface (public for domains, internal for core), so its lifecycle is
self-contained.

In this POC: each domain is its own stack that self-registers a base path. Work
on one unit stays scoped to that unit.

## 3. Convention over configuration

The filesystem is the contract. The path to a file is the path of the route, so
there is no separate list to keep in sync with the code.

In this POC: `domains/<domain>/<segments>/handler.ts` becomes
`GET /<domain>/<segments>`. Adding a route is adding a folder.

Where it stops: the folder convention expresses routing, and only routing. The
richer configuration the real platform uses earns its place for the controls a
folder cannot carry, such as per-route access to secrets, keys and resources,
least-privilege grants, and per-function tuning. This POC deliberately stays at
routing. Folders are not a claim that configuration is unnecessary, only that
routing does not need it; the advanced per-domain controls would come back as
configuration, much as Flex has today.

## 4. Ownership is structural

Top-level folders are ownership boundaries, and the directory layout mirrors who
is responsible for what. Code lives with the team that owns it.

In this POC: `platform/`, `core/`, and `domains/` are distinct planes, each
mapped to a team in `CODEOWNERS`, with stacks co-located with their concern.

## 5. Build on the platform, not in the cloud

Contributors write plain business logic. They receive a clean input and return
plain data. The platform provides the cloud through the SDK, so a contributor
does not need to know what it runs on.

In this POC: domain handlers are `createHandler(() => data)`. The only module
that knows the gateway request and response shape is `@flex/sdk/http`.

## 6. A thin, fragmented, owner-versioned SDK

The SDK is composed of fragments. Each capability owns and co-locates its own
client fragment, versioned on its own terms. Consumers depend on the fragments
they use, and a single convention composes them.

In this POC: a path wildcard maps `@flex/sdk/*` to `core/*/sdk`, so `udp`,
`telemetry`, `request`, and `http` are importable as `@flex/sdk/<name>` with no
central index to maintain. Each fragment lives next to the capability it fronts.

## 7. Symmetric lifecycle

Onboarding and offboarding are both first-class and both a single command.
Removing something is a designed path, not an afterthought.

In this POC: adding a domain is a folder plus a deploy; removing one is deleting
the folder plus a sync that prunes the unit that is no longer defined.

## 8. Work with the platform tools

Lean on the framework's native deployment and change detection. Let the tooling
decide what actually changed and act on exactly that.

In this POC: each unit deploys on its own, and content-addressed bundles mean a
change to a capability or the SDK propagates to precisely the units that use it,
and nothing else.

## 9. Grounded and proven

Explore against the real surface, verify on real infrastructure, and be honest
about what is simplified.

In this POC: it is deployed to a real account and domain and exercised end to
end. The simplifications are called out plainly (see below) so nothing here
pretends to be production.

## What is deliberately simplified

So this is read in the right spirit. The real platform does a great deal that
this POC does not attempt, especially around networking and security:

- No VPC. Functions run in default Lambda networking, not inside a VPC.
- Surface separation only. Core capabilities sit on a separate internal custom
  domain that CloudFront does not front, so they are not reachable through the
  public front door. But there is no network-layer separation: no subnets
  (public egress, private egress, isolated), no security groups, and the
  internal domain is still publicly resolvable by hostname. True isolation is
  the private gateway inside a VPC.
- Egress is allow-listed, but only in code. The request gateway forwards
  outbound calls only to allow-listed hosts and blocks SSRF targets, but it runs
  with default Lambda internet egress. A real platform enforces egress at the
  network layer (a firewall with fixed egress IPs) so application code cannot
  bypass it.
- Generic egress, not curated. The request gateway is a pass-through; the
  calling domain shapes the partner response. A real platform also runs
  per-destination anti-corruption gateways that hold credentials and shape
  responses.
- No trust model on the gateways. They are reachable directly by anyone who
  resolves the host; the origin-verify header that ties traffic to CloudFront is
  omitted. A REST API gateway cannot be an Origin Access Control target, so the
  real fix is a shared secret, which this POC simply leaves out.
- Core capabilities are unauthenticated. A real platform fronts them with
  IAM / SigV4 on a private gateway.
- No per-route access control. The folder convention has nowhere to declare
  which secrets, keys or resources a route may touch. Real Flex declares this in
  configuration and grants least privilege per route; the POC grants nothing
  fine-grained, which is a real reason its richer configuration is the better
  fit beyond a proof of concept.
- No WAF or edge authorizer on the front door.
- DNS is managed by hand in Cloudflare rather than by the platform.

These are POC choices to keep the surface small, not recommendations. The gaps
are exactly where the real platform's complexity earns its place.

## The point

If any of these principles are useful, they are worth discussing on their own
merits. If some do not fit Flex, that is a useful outcome too. The aim is a
better shared picture, not a finished answer.
