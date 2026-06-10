# Platform execution layer: options and fit

An open design question, raised in review: after the connection is made but
before a domain is invoked, where does the platform run its own logic? And, by
extension, after the domain returns?

This note frames the question, sets out the options with their real limits, and
recommends where each kind of platform behaviour belongs. Nothing here is built
in the POC; it is the thinking, so the choice is deliberate when a need appears.

## Is it even needed?

For some things, yes. Authentication, identity resolution, request validation,
audit, telemetry, correlation IDs, and feature or rollout gating are
cross-cutting: you do not want every domain re-implementing them, and you do
want the platform able to change them centrally.

But the bar should be high. A generic "run arbitrary platform code around every
domain call" layer is easy to over-build and easy to turn into a latency tax or
a chokepoint. The aim is to know where each concern goes, not to build one box
that does everything.

## The reframe that unlocks it

People conflate two separate axes. Keep them apart:

- Where the work runs. Keep it in the execution environment, with no extra
  network hop. That is the latency answer.
- Who owns the work. Move it out of the domain's bundle and into the platform,
  attached by the gateway builder. That is the "platform can change it" answer.

You can have both. You do not need a hop to get platform ownership, and you do
not need to bake the logic into each domain to keep it fast.

## The options, and what limits them

The earlier an option runs, the cheaper it is and the less it can do. The later
it runs, the more it can do and the more it costs.

| Option | Time budget | Network / async | Sees body | Owned by platform without domain rebuild | Best for |
| --- | --- | --- | --- | --- | --- |
| CloudFront Function | under 1 ms | no | no (headers / URI only) | yes (edge config) | header rewrites, origin-verify, reject malformed early |
| Lambda@Edge (viewer) | 5 s | yes | up to 53 KB | yes | edge auth or routing that must run at the edge |
| Lambda@Edge (origin) | 30 s | yes | up to 1.3 MB | yes | edge transforms on cache miss |
| API Gateway authorizer | bounded by the request (about 29 s) | yes | no (token / headers / path) | yes | gate before the domain: auth, identity, coarse access (cacheable up to 1 h) |
| In-bundle wrapper (createHandler) | up to the request cap, about 29 s | yes | yes, everything | no (lives in the domain bundle) | per-request middleware that needs the payload |
| Layer-delivered wrapper | same as the lambda, in-process | yes | yes, everything | yes (bump the layer, config-only redeploy) | the same middleware, but owned and versioned by the platform |
| Lambda Extension | around the invoke | yes | not the payload (lifecycle events) | yes | post-domain side-effects: telemetry, audit, secrets prefetch |
| Dedicated Lambda hop | its own lambda budget | yes | yes | yes | avoid unless a separate trust boundary is required |

A bounding fact sits over all of it: a synchronous API Gateway REST request is
about 29 seconds end to end (the integration timeout, raisable above 29 s via a
service quota since 2024), and CloudFront's origin timeout is similar. So an edge
function, an authorizer, and the domain lambda all share roughly one 29 second
budget, however the work is split.

## Where each kind of hook belongs

- Must gate before the lambda even runs (auth, identity, coarse access):
  the authorizer. It rejects without invoking the domain and caches the result,
  so it is the cheapest possible pre-hook for the deny case.
- Pre-execution work that needs the request body (validation, enrichment):
  the handler wrapper. Keep the logic in `createHandler`, but deliver it as a
  platform-owned layer so the platform can change it without every domain
  rebuilding.
- Post-execution side-effects (audit, telemetry, metric flush): a Lambda
  Extension, which runs around the invoke without touching the handler code.
  Verify whether its post-work delays the synchronous response before assuming
  it is free on the response path.
- Sub-millisecond header or structural work, or origin-verify: a CloudFront
  Function.

Lambda@Edge only earns its operational cost (us-east-1 deploys, replication lag,
awkward rollback) when the logic genuinely must run at the edge. Otherwise the
authorizer does the same job more simply.

## The configuration interface

The clean form of "hooks" is configuration the builder reads, not a runtime hop:

```
preHooks:  [authContext, validate]
postHooks: [audit, telemetry]
```

The gateway builder materialises that onto the route lambdas, as the layer
wrapper and / or the extension, when it stamps out the domain stack. Config
drives the build, not a per-request indirection. The domain never sees it; the
platform changes the manifest or the layer version and redeploys the builder's
output. This is the hook experience with no extra hop.

## Scope: the boundary, not the internals

The builder is the control point, and it only wraps what it creates: the route
entry lambdas. A domain's internal lambda-to-lambda calls are its own functions,
not route entries, so they do not inherit the wrapper. That is the behaviour you
want: platform middleware runs once at the external boundary, not on every
internal call. If a hook genuinely needs to run on internal calls too, that is
an explicit decision rather than an accident.

## On the hop you might be tempted by

A request-path lambda in front of the domain is the one option that costs the
latency you are trying to avoid: an extra cold start, an extra invoke, double
billing, more concurrency, and it quietly recreates the apex-router chokepoint
the per-domain-gateway shape removed. The authorizer plus a layer wrapper plus an
extension give the same "platform runs first and last" semantics inside the one
execution environment. Reserve an actual hop for the rare case that needs a
separate trust boundary or a transform that truly cannot run in-process.

## Recommendation

Grow into this, do not build it up front:

1. Start with the simple stack: `createHandler` (pinned and versioned like the
   SDK) for payload middleware, the authorizer for gating, and one extension for
   telemetry.
2. When the platform needs to change middleware without every domain rebuilding,
   move the wrapper from the bundle into a platform-owned layer attached by the
   builder. Domains do not notice.
3. Add the hooks manifest only when there is more than one or two hooks to
   manage, so the configuration earns its keep.

The property that matters is already true: the builder owns the lambdas, so any
of this can be added later without domains changing. The door is open; walk
through it when a concrete need arrives, not before.

## Sources

- [CloudFront Functions restrictions](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-function-restrictions.html)
- [Lambda@Edge restrictions](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-at-edge-function-restrictions.html)
- [API Gateway quotas](https://docs.aws.amazon.com/apigateway/latest/developerguide/limits.html)
- [Lambda Extensions API](https://docs.aws.amazon.com/lambda/latest/dg/lambda-extensions.html)
