CREATE TABLE IF NOT EXISTS products (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  brand text NOT NULL,
  category text NOT NULL,
  description text NOT NULL DEFAULT '',
  specs jsonb NOT NULL DEFAULT '[]'::jsonb,
  price numeric(12, 2) NOT NULL CHECK (price >= 0),
  rating numeric(2, 1) NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
  reviews integer NOT NULL DEFAULT 0 CHECK (reviews >= 0),
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  search_text text GENERATED ALWAYS AS (
    lower(sku || ' ' || name || ' ' || brand || ' ' || category || ' ' || description || ' ' || specs::text)
  ) STORED,
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(brand, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(category, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(description, '') || ' ' || coalesce(specs::text, '')), 'D')
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS outbox_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id bigint NOT NULL,
  product_version integer NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('product.upserted', 'product.deactivated')),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  locked_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text
);

CREATE INDEX IF NOT EXISTS outbox_pending_idx ON outbox_events (id) WHERE processed_at IS NULL;

CREATE TABLE IF NOT EXISTS search_sync_status (
  product_id bigint PRIMARY KEY,
  indexed_version integer NOT NULL DEFAULT 0,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'current', 'failed')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_error text
);

CREATE TABLE IF NOT EXISTS benchmark_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id text NOT NULL,
  dataset_size bigint NOT NULL,
  backend text NOT NULL,
  mode text NOT NULL,
  query_type text NOT NULL,
  query_text text NOT NULL,
  request_count integer NOT NULL,
  error_count integer NOT NULL DEFAULT 0,
  p50_ms double precision NOT NULL,
  p95_ms double precision NOT NULL,
  p99_ms double precision NOT NULL,
  mean_ms double precision NOT NULL,
  throughput_rps double precision NOT NULL,
  duration_ms double precision NOT NULL,
  concurrency integer NOT NULL,
  seed bigint NOT NULL,
  machine jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS benchmark_runs_recent_idx ON benchmark_runs (recorded_at DESC, dataset_size, backend);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
