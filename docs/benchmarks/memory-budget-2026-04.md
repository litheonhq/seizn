# Memory Budget Benchmark - April 2026

Synthetic workload: 100 entities, 200 memories per entity, 5,000 Zipfian recall queries. Hot tier budget is 64KB per entity.

| Mode | Total bytes stored | Hot bytes scanned | Avg tokens loaded / recall | p95 recall latency |
| --- | ---: | ---: | ---: | ---: |
| Budget OFF | 21,786,720 | 21,786,720 | 54416 | 62.7ms |
| Budget ON | 21,786,720 | 6,494,269 | 16240 | 25.8ms |

Result: hot/warm tiering reduced average tokens loaded per recall by **70.2%** and p95 recall latency by **58.9%** in this deterministic workload.
