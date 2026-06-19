# How to

Recipes for each thing FLEX can do. A route is a folder; adding one is adding a
folder. Deploy with `npm run deploy` (or `npx cdk deploy <Stack>`); `npm run
prune` removes deleted domains from AWS.

## How a folder becomes a public URL

The route's folder path is its URL. There is no central list of routes.

```
domains/<domain>/api/v1/<...>/route.ts   ->   https://<public-host>/<domain>/v1/<...>
```

- The base path is the **domain folder name**.
- `api/` is structural and **stripped**; the version and any nested folders below
  it become the path. So `domains/dvla/api/v1/vehicle/` is `/dvla/v1/vehicle`, and
  `.../api/v1/driver/summary/` is `/dvla/v1/driver/summary`.
- The version (`v1`) is a real path segment; a v2 API is a sibling `api/v2/`.
- The method is `GET`, except a `publish` route, which is `POST`.
- Two hosts serve the same paths: the **public host** (CloudFront) for clients,
  and the **gateway host** (the back-door) that channels call directly. The
  deployed URL is printed as a stack output when you deploy.
- Channels mount flat at `/<channel>` (no `api/` facet):
  `channels/mobile/dvla/driving-page/` is `/mobile/dvla/driving-page`.

## Add a domain

Create `domains/<name>/api/v1/<route>/`. The first route gives you the gateway,
mounted at `/<name>`. `domains/simple/` is the smallest working example.

## Which route do I need?

Start from what you are trying to do:

| You want to | Use | Runs |
| --- | --- | --- |
| Hand an upstream resource to the client unchanged | pass-through | nothing |
| Hand it over, but in a different shape | pass-through + transform | nothing (VTL) |
| Fetch, combine several calls, validate, or branch | execution | a Lambda |
| Do a side effect without slowing the response | off the hot path | async |

## Hand an upstream straight to the client

You have a third-party (or 2nd-party) resource and the client should get it as-is.
The gateway forwards to the upstream; no handler, no compute.

```ts
// domains/<d>/api/v1/<thing>/route.ts
export default defineRoute({
  kind: "passthrough",
  auth: "udp-linked:dvla",        // or "none"
  output: Thing,                  // a Zod schema in ../schema
  target: "GET https://upstream/api/things/{id}",  // {id} <- authorizer
});
```

## Same resource, but a different shape

The upstream returns more (or a different shape) than your client wants, and you
do not want to pay for a Lambda. Add `transform` to a pass-through; the gateway
reshapes the response with VTL. The keys are bound to `output`, so a typo or a
dropped field fails the build.

```ts
transform: {
  fields: {
    id: "$.User.id",
    name: { coalesce: ["$.User.first_name", "$.User.email"], default: "Anonymous" },
    source: { const: "dvla" },
  },
},
```

## Run your own logic

You need to fetch, combine several calls, validate, or branch. Add a `handler.ts`
beside the `route.ts`.

```ts
// route.ts
export default defineRoute({ kind: "execution", auth: "udp-linked:dvla", output: Thing });

// handler.ts
export const handler = createHandler(async (input) => {
  const res = await fetch(`${UPSTREAM}/${input.auth.linkingId}`);
  return Thing.parse(await res.json());
});
```

## Save a fact once you have responded

You want to record something (a preference) after the handler computes the
response. Declare an effect on an execution route; it runs inline after the
handler returns.

```ts
effects: [{ udpWrite: { key: "dvla.hasVehicle", value: true } }],
```

## Read something you saved

```ts
// in a handler
const pref = await udp.get<boolean>(`${input.auth.userId}:dvla.hasVehicle`);
```

## Do work without making the caller wait

A side effect (a durable write, telling other systems) that must not add latency.
Two ways.

**No Lambda (`publish` route)** maps the request into an event and returns at once;
API Gateway publishes to EventBridge via VTL.

```ts
export default defineRoute({
  kind: "publish", auth: "udp-linked:dvla", output: Ack,
  event: { source: E.source, detailType: E.detailType, detail: { fields: { note: "$.note" } } },
});
```

**From a Lambda (`emitEvent` effect)** carries the handler's response, which the
request-only publish route cannot see.

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
