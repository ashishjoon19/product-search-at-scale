# Product Search at Scale

A product catalog application built to explore a practical engineering question: how do search speed, result quality, and index freshness change as a catalog grows?

PostgreSQL is the source of truth for product records. Its full-text and trigram search will be the required baseline. A dedicated search engine will be added only after the baseline is measured, then compared against the same generated catalog and workload.

## Current milestone

The first milestone is the approved shopper and engineering UI: catalog home, autocomplete, filtered results, product detail, catalog management, and Search Lab. Product data is currently local demo data. Saving a product changes the in-browser catalog only; persistence, API, search indexing, and benchmark execution are later milestones. Search Lab intentionally displays no benchmark numbers until actual runs exist.

## Planned engineering milestones

1. Product CRUD API and PostgreSQL schema, plus repeatable generated catalog data.
2. PostgreSQL search baseline: exact SKU, full-text search, typo-like queries using `pg_trgm`, filters, and pagination.
3. Query inspection and measured indexes, preserving the same relevance fixtures and workload.
4. Dedicated search backend behind a shared adapter, selected from measured needs.
5. Reliable write-to-search synchronization using a transactional outbox and retryable worker.
6. Repeatable load runs and a report of p50/p95/p99 latency, throughput, errors, relevance, and index freshness.

## Local setup

Requires Node.js 20 or newer and npm.

```sh
npm install
npm run dev
```

The current milestone is a front-end prototype and does not yet require PostgreSQL or a search service.

## Important measurement rule

Do not copy illustrative numbers from project pitches into the app, README, or resume. Publish only measurements produced by the same documented workload on the compared backends, with machine and version details.
