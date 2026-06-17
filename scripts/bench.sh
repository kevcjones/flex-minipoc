#!/usr/bin/env bash
# Latency benchmark for a front-door endpoint.
#
# Usage: scripts/bench.sh <url> <x-user-id> [count]
#
# Warms the path, then issues <count> sequential requests and reports
# min / p50 / p95 / mean / max of time_total (seconds). Sequential on purpose:
# we are measuring per-request latency, not throughput.
set -euo pipefail

url="${1:?url required}"
uid="${2:?x-user-id required}"
n="${3:-30}"

for _ in 1 2 3; do curl -s -o /dev/null -H "x-user-id: $uid" "$url"; done

times=$(for _ in $(seq 1 "$n"); do
  curl -s -o /dev/null -w '%{time_total}\n' -H "x-user-id: $uid" "$url"
done)

echo "$times" | sort -n | awk '
  { a[NR]=$1; sum+=$1 }
  END {
    n=NR
    i50=int((n+1)*0.50); if (i50<1) i50=1; if (i50>n) i50=n
    i95=int((n+1)*0.95); if (i95<1) i95=1; if (i95>n) i95=n
    printf "n=%d  min=%.3f  p50=%.3f  p95=%.3f  mean=%.3f  max=%.3f\n",
      n, a[1], a[i50], a[i95], sum/n, a[n]
  }'
