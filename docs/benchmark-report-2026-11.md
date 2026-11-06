# Foundry benchmark report — 2026-11-06

## Summary

The project generated 10,000,000 deterministic synthetic product rows on a Google Colab VM and recorded baseline-mode and indexed PostgreSQL timings at smaller sizes. These runs show that the workload becomes expensive as the table grows, but they do **not** establish a reliable 10M before/after speedup. The 10M baseline-mode sweep was run after search indexes had been applied, and the indexed 10M sweep did not complete.

## Runtime and data generation

- Google Colab VM: 2 vCPU, Intel Xeon CPU @ 2.20 GHz, 12.67 GiB RAM; Node.js 18.19.1 and PostgreSQL 16.15.
- Seed: `20261101`.
- Generated: 10,000,000 rows in about 15m38s, averaging about 10,719 rows/s.
- Table plus six secondary indexes: about 13 GB. Creating the indexes after the bulk load took about 22 minutes, largely due to the trigram GIN index.
- The synthetic catalog is generated benchmark data, not retailer inventory or production traffic.

## Recorded latency runs

| Dataset / mode | Requests (warmups, concurrency) | Errors | p50 | p95 | Interpretation |
| --- | ---: | ---: | ---: | ---: | --- |
| 1K, PostgreSQL LIKE baseline | 30 (5, 3) | 0 | 55.661 ms | 235.734 ms | Completed small sample. |
| 100K, PostgreSQL LIKE baseline | 30 (5, 3) | 0 | 1,581.975 ms | 2,611.349 ms | Completed small sample. |
| 1M, PostgreSQL LIKE baseline | 30 (5, 3) | 5 | 12,935.55 ms | 38,443.768 ms | Error-containing saturation diagnostic; exclude from clean comparison. |
| 1M, indexed PostgreSQL full-text | 10 (2, 1) | Not recorded in retained summary | 3,164.197 ms | 10,683.969 ms | Diagnostic sample only. |
| 1M, PostgreSQL LIKE mode | 10 (2, 1) | Not recorded in retained summary | 3,813.89 ms | 9,352.43 ms | Diagnostic sample only; p95 was lower than the indexed full-text run. |
| 10M, PostgreSQL LIKE mode | 10 (2, 1) | 2 | 61,831.163 ms | 128,715.224 ms | About 18m11s wall time. Indexes were already present, so this is **not** an unindexed baseline. Error-containing stress observation; percentiles cover successful requests only. |
| 10M, indexed PostgreSQL full-text | 10 (2, 1) planned | — | — | — | Stopped after 31m22s without a usable result. |

The small 1M mode comparison is not evidence of a win: it had only 10 requests per mode, and the indexed run's p95 was about 14% higher. The 10M result had only eight successful requests and cannot be used as a stable p95 estimate.

## Run identifiers

- 1K baseline: `f44c689e-71eb-4259-ab03-a517957c47e0`
- 100K baseline: `e368c266-7044-419e-bcd0-8e75c8cc7c83`
- 1M baseline saturation diagnostic: `9803602f-0504-4c65-bb9f-ed4e9d19ef91`
- 1M indexed full-text diagnostic: `ecb31b85-6099-49fd-906d-00c88ec6a305`
- 1M LIKE-mode diagnostic: `8d02f553-9976-4b8e-95be-e2a33bb82b64`
- 10M LIKE-mode stress observation: summary retained in Colab; no run ID was recovered into the local project.

## What is needed for a defensible comparison

Run the same query mix, data, request count, warmups, concurrency, cache conditions, and server configuration before and after indexing. Collect enough requests for percentiles to be meaningful, require zero errors for a clean latency comparison, and preserve raw request samples. Inspect the exact-count, facet, and price-range query plans with `EXPLAIN (ANALYZE, BUFFERS)`; the current search endpoint runs those alongside the page query, so accelerating page retrieval alone may not improve total response time.

The Colab runtime currently holds the large database and raw run artifacts, but its session files have not been exported into this repository. The numbers above are the completed summaries recovered in the project work log. No optimization speedup is claimed.
