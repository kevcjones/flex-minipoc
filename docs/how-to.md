# How to

Recipes for each thing FLEX can do. A route is a folder; adding one is adding a
folder. Deploy with `npm run deploy` (or `npx cdk deploy <Stack>`); `npm run
prune` removes deleted domains from AWS.

## Add a domain

Create `domains/<name>/api/v1/<route>/`. The first route gives you the gateway,
mounted at `/<name>`. `domains/simple/` is the smallest working example.

## Add an API route (tier 1, pass-through)

The gateway forwards to an upstream, no compute. No handler needed.

```ts
// domains/<d>/api/v1/<thing>/route.ts
export default defineRoute({
  kind: "passthrough",
  auth: "udp-linked:dvla",        // or "none"
  output: Thing,                  // a Zod schema in ../schema
  target: "GET https://upstream/api/things/{id}",  // {id} <- authorizer
});
```

## Reshape the response in the gateway (tier 2, transform)

Add `transform` to a pass-through. No Lambda. The field keys are bound to
`output`, so a typo or dropped field fails the build.

```ts
transform: {
  fields: {
    id: "$.User.id",
    name: { coalesce: ["$.User.first_name", "$.User.email"], default: "Anonymous" },
    source: { const: "dvla" },
  },
},
```

## Run code (tier 3, execution)

A Lambda. Add a `handler.ts` beside the `route.ts`.

```ts
// route.ts
export default defineRoute({ kind: "execution", auth: "udp-linked:dvla", output: Thing });

// handler.ts
export const handler = createHandler(async (input) => {
  const res = await fetch(`${UPSTREAM}/${input.auth.linkingId}`);
  return Thing.parse(await res.json());
});
```

## Write on the hot path (effect)

Declare an effect on an execution route; it runs inline after the handler.

```ts
effects: [{ udpWrite: { key: "dvla.hasVehicle", value: true } }],
```

## Read from the store

```ts
// in a handler
const pref = await udp.get<boolean>(`${input.auth.userId}:dvla.hasVehicle`);
```

## Write off the hot path

Two ways.

**No Lambda (`publish` route):** API Gateway publishes the request to EventBridge
via VTL and returns immediately.

```ts
export default defineRoute({
  kind: "publish", auth: "udp-linked:dvla", output: Ack,
  event: { source: E.source, detailType: E.detailType, detail: { fields: { note: "$.note" } } },
});
```

**From a Lambda (`emitEvent` effect):** carries the handler's response (which the
request-only publish route cannot see).

```ts
effects: [emit(VehicleSeen)],   // import the event contract
```

## Define an event (producer-owned)

```ts
// domains/<d>/events/v1/<event>.ts
export const VehicleSeen = defineEvent({
  source: "flex.dvla.vehicle",
  detailType: "vehicle.seen.v1",   // version lives here
  payload: z.object({ id: z.number(), car: z.string() }),
});
```

## React to an event (subscription)

Two files in `domains/<d>/subscriptions/<name>/`: one declares the event, one
reacts.

```ts
// subscribe.ts  (read at synth to build the rule)
export default defineSubscription(VehicleSeen);

// handler.ts  (the reaction; payload is typed, drift-safe)
export const handler = onEvent(VehicleSeen, async (payload, ctx) => {
  await udp.put(`${ctx.userId}:vehicle.last`, payload);
});
```

## Add a channel (L2 view)

A channel composes L1 calls into one response. `channels/<name>/<view>/` is an
execution route whose handler fans out over the back-door.

```ts
// handler.ts
export const handler = createView(async (ctx) => {
  const [user, vehicle] = await Promise.all([
    ctx.get("GET /dvla/v1/user"),
    ctx.get("GET /dvla/v1/vehicle"),
  ]);
  return { title: user.ok ? user.data.User.first_name : "?" };
});
```

Return HTML instead of JSON with `html(...)` from `@flex/sdk/http` (see
`channels/testing`).
