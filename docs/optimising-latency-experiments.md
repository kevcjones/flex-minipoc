# Optimising Latency Experiments

A set of experiments on the L2 channel composition path
(`GET /mobile/dvla/driving-page`), each applied on top of the last, with a
benchmark before and after so the marginal saving of each fix is visible.

## Methodology

- **Target:** `GET /mobile/dvla/driving-page`, the channel view that fans out to
  `/dvla/v1/user` and `/dvla/v1/vehicle`.
- **Host:** the gateway host directly (not CloudFront), so we measure origin
  compute, not edge caching.
- **Identity:** `x-user-id: bench-user`, seeded in UDP (`linking:bench-user=42`),
  so every authorizer performs a real UDP identity lookup, the work the first two
  fixes target.
- **Harness:** `scripts/bench.sh` warms the path, then issues 30 sequential
  requests and reports min / p50 / p95 / mean / max of `time_total` (seconds).
- **Cumulative:** each experiment is applied on top of the previous, so the last
  row is the fully optimised stack and each delta is that fix's marginal gain.

**Caveats.** The upstream is the public `myfakeapi.com`; its variable latency is
in every number and is the main source of noise (watch p50 more than max).
Requests are sequential and all for the same user, so the caching fix shows an
upper bound (maximum request locality); real mixed traffic would see less.

## Summary

| Step | p50 (s) | p95 (s) | mean (s) | marginal Δ p50 |
| --- | --- | --- | --- | --- |
| Baseline | 0.609 | 0.898 | 0.657 | - |
| + Resolve once, propagate | 0.559 | 0.663 | 0.566 | -0.050 (-8%) |
| + Authorizer caching (edge) | 0.587 | 0.677 | 0.609 | ~0 (within noise) |
| + Async post-hook | not built | n/a | n/a | expected ~0 |
| + HTTP keep-alive | 0.587 | 0.677 | 0.609 | ~0 (runtime already pools) |

Run-to-run noise on p50 is ~±0.03s (the two external calls dominate), so read
0.559 and 0.587 as the same value, not a regression.

Retained in the branch: experiment 1 only. Experiment 2 was measured then
reverted (noise, and it makes x-user-id required); 3 and 4 added no code. The
value of the rest is the documented negative result, not code in the tree.

## Baseline

The current setup: the raw user id is propagated, so every tier re-resolves
identity. Per page: ~5 lambda invocations, 3 authorizer runs each doing a UDP
lookup, ~4 UDP round-trips, 2 external calls.

```
n=30  min=0.543  p50=0.609  p95=0.898  mean=0.657  max=1.070
```

## Experiment 1: resolve identity once, propagate it

**Change.** The channel resolves the id at its own authorizer and propagates the
resolved id downstream (instead of the raw user), so the L1 authorizers short
circuit their UDP lookup. Removes 2 of the 3 identity resolutions.

```
n=30  min=0.503  p50=0.559  p95=0.663  mean=0.566  max=0.674
```

Marginal p50 -0.050s (-8%). The larger effect is on the tail (p95 0.898 -> 0.663,
max 1.070 -> 0.674): removing the two variable UDP lookups tightened the
distribution more than it moved the median.

## Experiment 2: authorizer result caching (edge)

**Change.** Enable API Gateway authorizer result caching keyed on the identity
source, so repeat requests from the same user skip the authorizer lambda and its
UDP lookup. Most effective at the edge (downstream is already cheap after
experiment 1).

```
n=30  p50=0.587  p95=0.677  mean=0.609   (3 runs; p50 0.580-0.593)
```

Marginal: within noise, no measurable p50 change vs experiment 1. After
propagation the authorizers are already cheap (downstream skip the UDP lookup; a
warm authorizer invoke is tens of ms), and the page is now dominated by the two
external myfakeapi calls, so removing the authorizer invocation does not move a
warm, single-user, sequential benchmark. Caching still earns its place under
load (one fewer lambda invocation per request, cutting concurrency, cost and
cold-start tail), and this confirms the earlier point that caching overlaps with
propagation: once identity is propagated, caching it adds little here.

**Decision: reverted.** A noise-level gain that also makes x-user-id required is
not worth the behaviour change, so it is not retained in the branch; it stays
here as a measured negative result.

## Experiment 3: async post-hook

**Change.** Take the has-vehicle UDP write off the response path (dispatch it
rather than awaiting it), so the vehicle leg no longer waits on a write.

**Not built (decision).** On this upstream-bound path the post-hook is one UDP
write on the vehicle leg, which already runs in parallel with the user leg, so
taking it off only helps when the vehicle leg is the bottleneck, expected to be
within noise here. Doing it reliably also needs durable async dispatch (an SQS
queue plus a consumer lambda), because a Lambda fire-and-forget can drop the
write. The production pattern is: the post-hook emits an event (fast) and a
consumer performs the write off the response path. Deferred to keep the POC lean
given the expected gain.

## Experiment 4: HTTP keep-alive

**Change.** Reuse connections for the internal back-door calls (a keep-alive
agent), removing a TLS handshake per resource call on the fan-out.

**No code change needed.** Node's global `fetch` (undici) already pools and
keep-alives connections, with an idle timeout (~4s) well above this benchmark's
sub-second request spacing, so connections are already reused within and across
the measured requests. An explicit keep-alive agent yields no measurable change
here. It would matter for traffic spaced beyond the idle timeout (connections
would otherwise be re-established) or via HTTP/2 multiplexing of the two
concurrent back-door calls over one connection.

```
n=30  p50=0.587  p95=0.677  mean=0.609   (= experiment 2 state; runtime pools)
```

## Considered, not run

- **Provisioned concurrency / cold-start mitigation.** Would cut first-request
  and scale-out latency, but it is an always-on cost and the warm benchmark here
  would not show it, so it is deferred.

## Conclusions

- **Resolve-once + propagate is the only fix that moved the benchmark**, and its
  biggest effect was on the tail (p95 0.898 -> 0.663, max 1.07 -> 0.67):
  removing the two redundant downstream UDP lookups cut variance more than it cut
  the median. It is also a correctness win (identity resolved in one place).
- **After that the path is upstream-bound.** The two myfakeapi calls dominate, so
  authorizer caching (exp 2) and connection keep-alive (exp 4) do not move a
  warm, single-user, sequential benchmark. They are load- and traffic-shape
  optimisations: caching saves a lambda invocation per request (concurrency,
  cost, cold-start tail under load); keep-alive helps sparser traffic. Neither is
  a lever for this benchmark.
- **The real next lever is the upstream itself:** response caching for cacheable
  resources, fewer or faster upstream calls, or HTTP/2 to multiplex the fan-out.
  That is where the time now lives.
- **Net:** identity-once is the must-do (correctness and tail). The rest earn
  their place under production load, not on a warm composition benchmark, so the
  honest recommendation is to ship experiment 1 and revisit the others against
  realistic concurrent traffic rather than this harness.
