# Spec: the channels plane (the composition layer, L2)

`consumer/` was a build-time stand-in: a typed client plus one `driving-page`
script, not deployed. The real thing is a deployed `channels/` plane, a
reflection of the channels we run an execution platform for (mobile, web, chat).
Each channel owns its composed, channel-shaped views on FLEX's substrate. This is
the BFF tier from the tenant decision, made concrete.

## What a channel is for (and is not)

A channel is L2. The domain APIs are L1: apps can call those directly, and for a
single resource they should. A channel view earns its existence only by doing
something a single direct call cannot, composing or augmenting across multiple
calls into one channel-shaped response.

The rule: if a view is a straight fetch or reshape of one resource, it is not a
channel, the app uses the domain API directly. A channel exists when there is
fan-in (user plus vehicle plus a preference) to assemble. This is what keeps the
plane from filling up with pointless passthroughs.

## The key insight: a channel is a domain whose upstream is FLEX

A channel view is structurally an execution route whose upstream is not a third
party but the FLEX front door itself. So it reuses almost everything already
built:

- Folder-as-routing, same as domains: `channels/<channel>/<...segments>/view.ts`
  becomes `GET /<channel>/<...segments>`. Today's `consumer/driving-page.ts`
  becomes `channels/mobile/dvla/driving-page/view.ts`, served at
  `GET /mobile/dvla/driving-page`.
- Each channel is an ownership boundary (CODEOWNERS), like a domain.
- The same gateway builder deploys it: a lambda behind the channel's gateway,
  mounted on the front door at the channel's base path (`/mobile`), fronted by
  CloudFront.
- A view is AWS-free (returns plain data, `createHandler` adapts) and composes by
  calling the typed front-door client.

The only genuinely new pieces are the typed client SDK, identity propagation, the
egress fence, and a drift-safe contract.

## Topology and identity

```
app -> CloudFront -> channel gateway (public) -> [internal back-door] -> domain resources -> upstream
```

- The channel authorizer resolves the user once, and the view propagates that
  identity to its resource calls. No N re-resolutions of identity down the tree.
- The view reaches domain resources through the internal back-door (the gateway
  host directly, server-side, no CloudFront round-trip per resource), with the
  user's identity attached. Resources re-authorize on it.
- Fan-out is parallel in one lambda (await Promise.all), not a chain and not a
  durable workflow; for a sub-second page the idle-wait cost is negligible.

## Egress boundary (the tenant fence)

Channel lambdas may reach the FLEX resource surface plus explicitly allowed extra
sources, never departments or arbitrary internet. POC: an allow-list; real Flex:
network egress. This is what keeps a channel a tenant composing FLEX resources,
not something with raw egress. A channel that needs a brand new outbound source
is an explicit, reviewed grant.

## Drift-safe contract

A view must never crash on drift (the `consumer/` script did, because it trusted
an out-of-range empty response). The typed front-door client returns a safe
result: parsed data on success, or a typed miss on a contract violation, with the
drift warning emitted either way. The view declares how it degrades (drop the
section, use a fallback, return a partial page). Detection and graceful
degradation are both first-class.

## What graduates from `consumer/`

- `router.ts` and `client.ts` become the platform-owned typed front-door SDK
  (`@flex/sdk/front-door`), generated or inferred from the route declarations and
  build-time safe (removing a field from a contract breaks the channel build).
- `driving-page.ts` becomes `channels/mobile/dvla/driving-page/view.ts`, deployed.
- `consumer/` is removed once both have moved.

## A view, sketched

```ts
import { createView } from "@flex/sdk/front-door";

// Composes two L1 resources into one mobile-shaped payload. Identity is resolved
// once by the channel gateway and arrives on ctx; the client carries it down.
export default createView(async (ctx) => {
  const [user, vehicle] = await Promise.all([
    ctx.get("GET /dvla/v1/user"),
    ctx.get("GET /dvla/v1/vehicle"),
  ]);

  if (!user.ok) return { status: 502, data: { error: "user unavailable" } };

  return {
    title: `${user.data.User.first_name} ${user.data.User.last_name}`,
    vehicle: vehicle.ok
      ? `${vehicle.data.car} ${vehicle.data.car_model}`
      : null, // degrade: show the page without the vehicle
  };
});
```

`ctx.get` returns `{ ok: true, data }` or `{ ok: false }` (the drift-safe
contract), so the view cannot crash on a bad upstream and chooses how to degrade.

## What a POC build would demonstrate

A `channels/mobile/` plane with the driving-page view deployed and reachable at
`/mobile/dvla/driving-page`: it composes `/dvla/v1/user` and `/dvla/v1/vehicle`
server-side via the typed client, identity resolved once and propagated, egress
fenced to FLEX, degrades on drift, and returns a mobile-shaped payload. The
existing `consumer/` migrates into the typed SDK plus this view.

## Decisions (signed off)

- **FLEX hosts the channels.** `channels/` is a deployed plane; the channel team
  authors views, FLEX runs them server-side. One round trip from the device,
  release-independent of the app.
- **Composition only (L2).** A channel view exists to compose or augment across
  multiple calls. Single-resource needs use the domain API (L1) directly.
- **Internal back-door.** Views reach domain resources server-side via the
  gateway host with the user's identity, not back through CloudFront.
- **Drift-safe client.** The client returns a safe miss, never throws into an
  unguarded view; the view declares its fallback.

## Non-goals and simplifications

Real OIDC identity propagation (POC reuses the `x-user-id` stub and the
udp-linked authorizer); network-level egress (POC uses an allow-list); the SDK
generation pipeline (POC infers types, as `consumer/` does today); per-channel
versioning and multi-channel rollout (deferred); a channel reaching anything
other than FLEX resources.
