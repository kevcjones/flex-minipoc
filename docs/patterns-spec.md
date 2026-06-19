# Platform patterns spec

A decision record for evolving the config-driven route platform toward
AWS-native patterns. Each section is a decision (what, why, and the DevX and
security delta), not a migration mandate. The lens is keep, trade, or defer,
recorded against the strengths the current design already has.

## What we protect

The current model is good at three things, and no change here should sacrifice
them:

- **Uniform DevX.** One folder shape, one SDK (`@flex/sdk/*`), one Zod contract
  as the single source for the typed client and for drift. One language from
  handler to gateway wiring. Adding a folder adds a route.
- **Isolation.** A gateway per domain, so blast radius is bounded.
- **No-PII projection.** FLEX holds a pairwise linking id plus derived
  preferences, never the upstream record. It is a live projection, not a store.

## API Gateway: keep REST

HTTP API (v2) is cheaper and slightly faster, with native JWT authorizers and
auto-deploy. Switching would cost the features that are exactly the platform
capabilities we want:

| Capability | REST API | HTTP API |
| --- | --- | --- |
| VTL request/response mapping (transform with no Lambda) | yes | no |
| Request/response validation against JSON Schema | yes | no |
| API keys and usage plans (per-consumer throttling) | yes | no |
| Built-in response caching | yes | no |
| Direct WAF integration | yes | no |
| Native JWT authorizer | no | yes |
| Lower cost and latency | no | yes |

Cost is not the driver, and the transform substrate (VTL) is. **Decision: stay
on REST API.** HTTP API is rejected because it trades away the transform tier
below for a saving we do not need.

## Route model: three tiers

The pass-through versus execution split extends cleanly to three tiers, drawn on
the same line it already uses (no-compute versus compute):

1. **passthrough** forwards to the upstream as-is. No compute.
2. **passthrough + transform** reshapes the response at the gateway. No Lambda,
   no cold start. See the transform proposal below.
3. **execution** runs a sibling `handler.ts`, for logic, composition, or async
   effects.

### Transform tier (design proposal, unproven)

VTL runs in the gateway and avoids a Lambda cold start, but raw Velocity is
unloved and rarely reached for. The proposal: a declarative transform authored
in `route.ts` (the same folder config), compiled to VTL at synth. Contributors
get the speed without writing Velocity, and the uniform DevX is preserved.

The DSL realistically covers shape mapping: pick, omit, rename, flatten,
default, coalesce. It does not cover cross-field logic, external lookups, or
multi-source composition. Those fall back to tier 3. That hard line is the same
no-compute versus compute line the platform already draws.

#### Prior art

The "write TypeScript, get VTL" idea has been tried. The findings shape how we
build it, not whether:

- **Functionless** (sam-goodwin/functionless) compiled TypeScript source to VTL
  for AppSync and to ASL for Step Functions by parsing the function AST. It
  proved the concept but narrowed away from the VTL use case and is effectively
  unmaintained. The lesson: a general TypeScript-to-VTL compiler is what killed
  it.
- **AppSync JavaScript resolvers** are AWS's own maintained answer to disliked
  VTL: you write a JS subset, no Velocity. But it exists only in AppSync, which
  we rejected, so the supported escape from VTL is the door we closed.
- For **REST API Gateway mapping templates** there is no mature TypeScript DSL.
  The closest tool, `api-gateway-mapping-template` (ToQoz), is a VTL executor
  for testing, not a generator. So this is mostly greenfield for us.

#### Decision: a config interpreter, not a compiler

There are two readings of "a DSL in TypeScript", with very different risk:

- **Compile TypeScript source to VTL** (Functionless style, parse the AST). Hard,
  brittle, abandoned. We do not do this.
- **A typed config object we interpret into VTL** (data, not code). We need only
  the fixed shape-mapping vocabulary above, so this is a template generator from
  a declarative spec, the same nature as `route.ts`. Small (on the order of
  100 to 200 lines), and the tier-3 fallback keeps it small.

Functionless's failure is the argument for the config-interpreter form: we do
not need general TypeScript-to-VTL, only config-to-template for a small fixed
vocabulary.

Status: proposal. The spike builds the config interpreter for the vocabulary
above and unit-tests its emitted VTL locally with the ToQoz runner. It decides
whether gateway-level transforms are common enough to justify owning the
generator, or whether reshapes should just use a tier-3 Lambda and accept the
cold start.

## Identity contract

FLEX does not broker auth. An external identity provider (STS, a client-side
OIDC flow with PKCE, replacing Cognito) issues the token. FLEX integrates with
it. This section is the contract, not the implementation.

- **Inbound.** The front end runs the PKCE flow against the IdP and presents a
  bearer token.
- **At the edge.** FLEX validates the token (issuer, audience, expiry,
  signature against the IdP) and maps the subject to the existing pairwise
  linking id.
- **Downstream.** FLEX propagates the resolved identity to upstreams as it does
  today.
- **Not FLEX's job.** Minting, refreshing, the login UX, and PKCE are all the
  client and the IdP. FLEX never issues or stores the credential.

Native JWT validation is the one thing HTTP API would give for free, but it is
a small addition to the existing Lambda authorizer and not worth losing the
transform tier over.

## Async effect pipeline

The post-hook is the lowest-latency, lowest-complexity side-effect win: it keeps
work off the response path. Generalize the declarative hook list into an async
effect pipeline. The authoring surface stays a single declarative line in
`route.ts`; only what it dispatches to changes. The async machinery is
platform-owned and invisible to contributors.

Registered effects:

- `udpWrite` records a derived preference (a small non-PII value).
- `emit` raises a domain event for async business logic to consume.
- future: notify, derive, enrich.

Effects dispatch off the response path, so latency is unaffected and effects are
retryable. The "store the change, then write an update to something" case is the
`emit` to consumer pattern, and it generalizes to any side effect that does not
need to block the response.

## Cross-cutting protection

Protecting FLEX from a broken or off-contract upstream is a core proposition and
stays at the boundary:

- **Zod anti-corruption.** Keep the per-route output schema as the single source
  for the typed client and runtime drift. An off-contract upstream degrades to a
  safe miss rather than crashing.
- **Timeouts and circuit breaker.** Bound every upstream call and trip on
  repeated failure, so a broken third party degrades rather than cascades.
- **Contract-test CI gate.** Snapshot the upstream contract and fail the
  pipeline on a breaking change, catching it before prod rather than at runtime.

## Decisions

| Item | Status |
| --- | --- |
| Keep REST API | adopt |
| Three-tier route model | adopt |
| Transform tier (VTL from DSL) | proposal, spike first |
| Identity contract (validate external token, map to linking id) | adopt |
| Async effect pipeline (generalize post-hooks) | adopt, start with udpWrite and emit |
| Timeouts and circuit breaker | adopt |
| Contract-test CI gate | adopt |
| HTTP API | rejected, cost-only, loses the transform tier |
| AppSync for channels | rejected, paradigm shift, breaks the uniform model and the no-PII split |
| VPC and NAT static egress | defer, only if an upstream requires source-IP allowlisting |
