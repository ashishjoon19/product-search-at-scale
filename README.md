# Product Search at Scale

Foundry is a product catalog used to study search performance as a catalog grows. This Part 2 release adds the PostgreSQL API and schema behind the storefront. Search Lab will show measured results after the generator and benchmark runner are published in a later part.

## Start the app

Requires Node.js 20+, pnpm, and Docker Compose.

```sh
cp .env.example .env
docker compose up -d postgres meilisearch
pnpm install
pnpm db:migrate
pnpm dev
```

Open the Vite URL shown in the terminal. The API runs at `http://127.0.0.1:3001`; `GET /api/health` checks its database connection. The catalog starts empty at this stage. Add a few products from Catalog Manager, or use the existing local demo fallback when the API is unavailable.

## Included in this part

- PostgreSQL product schema with searchable text and generated full-text vector.
- Baseline and indexed PostgreSQL search, filters, database facet counts, total matches, and cursor pagination.
- Product create/update/deactivate API, with a transactional outbox for asynchronous Meilisearch indexing.
- Optional Meilisearch service and worker.
- API request timing in `logs/api-access.jsonl`.

The scale data generator and benchmark commands are a later project part. No latency figures are claimed until those runs have been made and recorded.
