# MVP extension: config-driven routes (pass-through + execution)

An extension to the POC that proves the declarative route model on real AWS. A
route is *declared* (contract, auth, cache, kind); the builder wires either a
pass-through or an execution route from that declaration; channels get a
build-time typed router; the platform can detect contract drift.

The upstream is a real public fake API, `myfakeapi.com` (about 1000 users and
1000 cars), so there is no fake infrastructure to deploy or maintain. The
authorizer chooses which record to pull.

Demonstrated with a DVLA-flavoured domain:

- `GET /dvla/v1/user` is a **pass-through**: the gateway forwards to
  `myfakeapi.com/api/users/{id}`, with the record id chosen by the authorizer
  substituted into the URL path. No handler lambda. It forwards the upstream
  verbatim, envelope (`{User:{...}}`) and all.
- `GET /dvla/v1/vehicle` is an **execution** route: a lambda pulls
  `myfakeapi.com/api/cars/{id}`, unwraps the `Car` envelope, validates it against
  the contract inline (drift), returns the clean vehicle, and an inline post-hook
  records a yes/no preference (has a vehicle) in UDP, never the vehicle details.

## Decisions (signed off)

- **UDP write:** a configurable post-hook, executed inline after the handler.
  It writes a preference value, never the response body. Async dispatch is the
  documented production step, not built here.
- **Channel demo:** a minimal typed consumer plus a typecheck script. Proves the
  typed router and compile-on-break. Not deployed.
- **Drift:** the execution route validates the upstream response inline and warns
  on mismatch; pass-through drift is shown by the consumer validating on receive.
  An out-of-range record id makes the upstream return an off-contract shape, so
  drift is demonstrable without any mock toggle.
- **Auth:** a stub authorizer resolves the upstream record id (a numeric
  `x-user-id` is used directly; otherwise a UDP lookup; otherwise a default) and
  returns it server-side. The channel never chooses it.

## The route declaration

`domains/<domain>/<...segments>/route.ts` default-exports a `defineRoute({...})`.
The folder is still the route; the file now carries a declaration instead of (or
alongside) a bare handler.

```ts
// pass-through: config only, no handler. {id} is filled by the gateway from the
// authorizer's resolved record id.
export default defineRoute({
  kind: "passthrough",
  auth: "udp-linked:dvla",
  output: User,                       // contract: typed router + drift source
  cache: { perUser: true, ttl: 300 },
  target: "GET https://myfakeapi.com/api/users/{id}",
});
```

```ts
// execution: same surface, plus a sibling handler.ts and a post-hook side-effect
export default defineRoute({
  kind: "execution",
  auth: "udp-linked:dvla",
  output: Vehicle,
  post: [{ udpWrite: { key: "dvla.hasVehicle", value: true } }],
  drift: "inline",
});
```

## How the builder reads it

`discover.ts` finds `route.ts` files. The `DomainStack` imports each at synth
(ts-node) and branches on `kind`:

- **passthrough:** an API Gateway HTTP integration to `target`, the shared
  authorizer attached, and the authorizer context (`linkingId`) mapped into the
  upstream URL path parameter (`integration.request.path.id`) where the target
  contains `{id}`. Optional method-level cache. No handler lambda.
- **execution:** a `NodejsFunction` from the sibling `handler.ts`, a Lambda
  integration, the same authorizer, and `post` serialised into the lambda env so
  `createHandler` runs the hooks after the handler returns.

## Auth (POC simplification)

No real One Login OIDC. The `udp-linked:dvla` authorizer takes the user id from a
stub `x-user-id` header and resolves the upstream record id: a numeric id is used
directly (so you can pick a record, or an out-of-range id to force drift),
otherwise it looks up a linked id in UDP, otherwise it uses a default record.
Pass-through routes substitute it into the upstream URL path; execution handlers
read it from `input.auth`.

## Folder shape

```
core/routes/sdk.ts                  defineRoute + types (@flex/sdk/routes)
core/identity/
  sdk.ts                            auth strategy names (@flex/sdk/identity)
  handlers/authorizer.ts            the stub authorizer lambda
domains/dvla/
  schema/user.ts, vehicle.ts
  v1/user/route.ts                  passthrough
  v1/vehicle/route.ts               execution
  v1/vehicle/handler.ts
consumer/                           minimal typed consumer + typecheck proof (not deployed)
```

## Verification (definition of done, on real AWS)

1. `GET /dvla/v1/user` returns a real upstream user, with the record id injected
   into the upstream path server-side though the caller chose none.
2. `GET /dvla/v1/vehicle` returns the vehicle; a follow-up UDP read shows the
   yes/no has-vehicle preference stored, not the vehicle details.
3. `x-user-id: 2000` (out of range): the upstream returns an off-contract shape,
   a drift warning surfaces, and the request is still served (graded).
4. Remove a field from a schema: the consumer typecheck fails.
5. Add/remove the `dvla` folder: the builder adds/removes the routes, CloudFront
   untouched.

## Non-goals

Real OIDC/One Login; real DVLA; VPC or network isolation; a full codegen
pipeline (Zod inference, with `zod-openapi` emit deferred); CloudFront changes;
auth on core UDP; production async post-hook dispatch; routing the upstream call
through the egress gateway.
