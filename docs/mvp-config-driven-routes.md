# MVP extension: config-driven routes (pass-through + execution)

An extension to the POC that proves the declarative route model on real AWS. A
route is *declared* (contract, auth, cache, kind); the builder wires either a
pass-through or an execution route from that declaration; channels get a
build-time typed router; the platform can detect contract drift.

Demonstrated with a fake DVLA domain:

- `GET /dvla/v1/user` is a **pass-through**: the gateway forwards to the upstream
  with a per-user token injected by the authorizer. No handler lambda.
- `GET /dvla/v1/driving-licence` is an **execution** route: a lambda pulls the
  licence, validates it against the contract, returns it, and an inline
  post-hook writes it to UDP as a preference.

## Decisions (signed off)

- **UDP write:** a configurable post-hook, executed inline after the handler.
  The hook config shape is real; async dispatch is the documented production
  step, not built here.
- **Channel demo:** a minimal typed consumer plus a typecheck script. Proves the
  typed router and compile-on-break. Not deployed.
- **Drift:** the execution route validates the upstream response inline and warns
  on mismatch; pass-through drift is shown by the consumer validating on receive.
- **Mock auth:** a stub authorizer resolves a seeded DVLA linking id from UDP by
  user id and injects it server-side. The channel never sees it.

## The route declaration

`domains/<domain>/<...segments>/route.ts` default-exports a `defineRoute({...})`.
The folder is still the route; the file now carries a declaration instead of (or
alongside) a bare handler.

```ts
// pass-through: config only, no handler
export default defineRoute({
  kind: "passthrough",
  auth: "udp-linked:dvla",
  output: User,                       // contract: typed router + drift source
  cache: { perUser: true, ttl: 300 },
  target: "GET {mockDvla}/user",      // {mockDvla} resolved by the builder
});
```

```ts
// execution: same surface, plus the handler and an async-shaped side-effect
export default defineRoute({
  kind: "execution",
  auth: "udp-linked:dvla",
  output: DrivingLicence,
  handler,
  post: [{ udpWrite: { key: "dvla.drivingLicence" } }],
  drift: "inline",
});
```

## How the builder reads it

`discover.ts` finds `route.ts` files. The `DomainStack` imports each at synth
(ts-node) and branches on `kind`:

- **passthrough:** an API Gateway HTTP integration to `target`, the shared
  authorizer attached, and the authorizer context (`linkingId`) mapped into an
  integration request header. Optional method-level cache.
- **execution:** a `NodejsFunction` from the sibling `handler.ts`, a Lambda
  integration, the same authorizer, and `post` serialised into the lambda env so
  `createHandler` runs the hooks after the handler returns.

## Auth (POC simplification)

No real One Login OIDC. The `udp-linked:dvla` authorizer takes the user id from a
stub `x-user-id` header, looks up a seeded linking id in UDP, and returns it as
authorizer context. Pass-through routes map it into an upstream header;
execution handlers read it from `input.auth`.

## Folder shape

```
external/mock-dvla/                 stub upstream (stands in for an external system)
  stack.ts, handlers/
platform/routes/
  define.ts                         defineRoute + types + auth-strategy names
  authorizer.ts                     the stub authorizer lambda
domains/dvla/
  schema/user.ts, driving-licence.ts
  v1/user/route.ts                  passthrough
  v1/driving-licence/route.ts       execution
  v1/driving-licence/handler.ts
consumer/                           minimal typed consumer + typecheck proof (not deployed)
```

## Verification (definition of done, on real AWS)

1. `GET /dvla/v1/user` returns mock user JSON, with the linking id injected
   server-side though the caller sent none.
2. `GET /dvla/v1/driving-licence` returns licence JSON; a follow-up UDP read
   shows the licence stored as a preference.
3. Flip the mock to a contract-violating shape: a drift warning surfaces, the
   user is still served (tolerant of additive change).
4. Remove a field from a schema: the consumer typecheck fails.
5. Add/remove the `dvla` folder: the builder adds/removes the routes, CloudFront
   untouched.

## Non-goals

Real OIDC/One Login; real DVLA; VPC or network isolation; a full codegen
pipeline (Zod inference, with `zod-openapi` emit deferred); CloudFront changes;
auth on core UDP; production async post-hook dispatch.
