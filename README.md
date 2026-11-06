# Product Search at Scale

Foundry is a product catalog and search engineering lab. PostgreSQL stores the canonical product records. The same catalog and query workload can be measured with three search paths: a deliberately simple PostgreSQL `LIKE` baseline, indexed PostgreSQL using full-text and trigram indexes, and Meilisearch populated from PostgreSQL.

The aim is to produce honest, repeatable measurements as the visible dataset grows from 1,000 to 10 million products. Measured summaries are documented with their run conditions and limitations; no performance win is claimed without a valid comparison.

The Colab run produced initial measurements, including a 10M-row stress observation. The 10M run is not a clean before-index baseline, and the indexed 10M comparison did not complete. See the [benchmark report](docs/benchmark-report-2026-11.md) for exact conditions and limits; no performance win is claimed.

## What is implemented

- React and TypeScript storefront with search across product name, brand, category, about text, specifications, autocomplete, product details, filters and a catalog manager.
- TypeScript HTTP API with product listing, detail, create, update, deactivate, search, health, database statistics and benchmark history routes.
- PostgreSQL migrations, baseline and indexed search paths, parameterized SQL, keyset pagination for PostgreSQL search, and a transactional outbox.
- Optional Meilisearch adapter and retryable index worker. Product edits and their outbox event commit in one PostgreSQL transaction.
- Seedable streaming product generator. It writes in bounded batches through PostgreSQL COPY and keeps a checkpoint; it never holds the full dataset in memory.
- Repeatable concurrent benchmark. It writes every request latency plus p50/p95/p99, mean, throughput, errors, run settings and machine/database information.

## Run the app locally

Requires Node.js 20+, pnpm 9+, and Docker Compose. On macOS, install Docker Desktop. Copy the example environment and start the database/search services:

```sh
cp .env.example .env
docker compose up -d postgres meilisearch
pnpm install
pnpm db:migrate
pnpm db:seed -- --rows=1000
pnpm dev
```

Open the Vite URL printed in the terminal. The API is at `http://127.0.0.1:3001`; `GET /api/health` reports database and search configuration. If PostgreSQL is not running, the storefront retains its small local demo catalog and shows that fallback in the header.

Use `pnpm dev:api` to run only the API, `pnpm dev:web` to run only Vite, and `pnpm build` plus `pnpm build:api` to compile the frontend and API.

## Repeatable scale run

Run this staged sequence on a fresh database when you want clean before/after measurements. The sequence starts with the LIKE baseline schema, grows one deterministic catalog in size, records the baseline at each size, adds the search indexes, then repeats with indexed PostgreSQL and Meilisearch.

```sh
# 1. Fresh DB, canonical tables only (no search indexes yet)
pnpm db:migrate -- --through=001_catalog

# 2. Grow to 1,000, then record baseline. Repeat the generator for each checkpoint.
TARGET_ROWS=1000 pnpm db:seed
DATASET_SIZE=1000 SEARCH_MODE=baseline pnpm bench
TARGET_ROWS=100000 pnpm db:seed
DATASET_SIZE=100000 SEARCH_MODE=baseline pnpm bench
TARGET_ROWS=1000000 pnpm db:seed
DATASET_SIZE=1000000 SEARCH_MODE=baseline pnpm bench
TARGET_ROWS=10000000 pnpm db:seed
DATASET_SIZE=10000000 SEARCH_MODE=baseline pnpm bench

# 3. Add PostgreSQL full-text/trigram/filter indexes, then measure the same prefixes.
pnpm db:migrate
for n in 1000 100000 1000000 10000000; do DATASET_SIZE=$n SEARCH_MODE=optimized pnpm bench; done

# 4. Optional dedicated search backend comparison
pnpm reindex:meili
for n in 1000 100000 1000000 10000000; do DATASET_SIZE=$n SEARCH_MODE=meilisearch pnpm bench; done
```

Each benchmark run issues the same five query shapes at the same concurrency and constrains records to the first N generated IDs. Defaults are 300 measured requests, 30 warmups, concurrency 10; change `REQUESTS`, `WARMUPS`, and `CONCURRENCY` to compare different loads. Use the same values for every backend. The run metadata records warmup count and `CACHE_STATE` (defaults to warm after warmups). The runner labels cache state but does not clear operating-system or database caches; only label a run `cold` if you actually used a documented, repeatable cache-clearing procedure before it.

The CSV and JSONL outputs go to `benchmarks/results/`; API request timings go to `logs/api-access.jsonl`. Results include each individual measured request and environment details, not just an average. The benchmark metadata table is also stored in PostgreSQL. Local result files are ignored by Git so large data and machine-specific measurements are not accidentally published.

### What each mode means

- `baseline`: substring matching using `LIKE` before the search indexes migration. This is intentionally the unindexed comparison.
- `optimized`: PostgreSQL full-text and trigram search with GIN indexes plus filter indexes. Explain plans can be inspected with `EXPLAIN (ANALYZE, BUFFERS)` using the SQL shape in `api/src/search.ts`.
- `meilisearch`: same query samples sent to the Meilisearch index, with searchable product fields and comparable category/brand/stock/price/id filters.

For a fair *before/after* comparison, run all baseline measurements before migration `002_search_indexes.sql`. The generator is deterministic for the initial load with `DATA_SEED=20261101`; its checkpoint and per-batch throughput are recorded. The run sequence must use the same seed and workload settings. PostgreSQL's planner may still choose sequential scans for tiny prefixes; that is a real outcome to preserve.

## Outputs

- `benchmarks/results/access-time-samples.csv`: individual request elapsed time and HTTP status.
- `benchmarks/results/latency-summary.csv`: one row per measured run with p50/p95/p99, throughput and errors.
- `benchmarks/results/benchmark-runs.jsonl`: run metadata including machine, Node and PostgreSQL versions.
- `benchmarks/results/generation-runs.jsonl` and `generator-checkpoint.json`: loading progress, throughput, seed and resume position.
- `benchmarks/results/meili-index-runs.jsonl`: index build duration and indexed row count.
- `logs/api-access.jsonl`: API route-level elapsed time, method, status and timestamp (query strings are excluded).
- `docs/benchmark-report-2026-11.md`: measured run summaries, errors, and comparison limitations.

## Run on Google Colab

Colab is an optional temporary benchmark environment, not the app host. Its VM can be reclaimed and runtime limits/resources vary; persist the run outputs and generator checkpoint somewhere durable before ending the session. The simplest route is to clone this repository into a Colab VM, install Node and PostgreSQL there, then use the same commands above. Keep the database on the VM's local disk while running; copying 10M records to a mounted remote drive during the benchmark would distort timings. Copy only outputs/checkpoints after the run.

## Limits and interpretation

Generated records are synthetic and suitable for repeatable engineering experiments, not a claim about a specific retailer's inventory or real shopper traffic. Results depend on CPU, memory, storage, PostgreSQL configuration, cache state, data distribution, concurrency and query mix. State the machine and conditions beside every performance claim. Do not promise that a single run predicts production behavior.
