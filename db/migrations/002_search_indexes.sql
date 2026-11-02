CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS products_active_search_vector_idx
  ON products USING gin (search_vector) WHERE active;

CREATE INDEX IF NOT EXISTS products_active_search_text_trgm_idx
  ON products USING gin (search_text gin_trgm_ops) WHERE active;

CREATE INDEX IF NOT EXISTS products_active_category_price_id_idx
  ON products (category, price, id) WHERE active;

CREATE INDEX IF NOT EXISTS products_active_brand_price_id_idx
  ON products (brand, price, id) WHERE active;

CREATE INDEX IF NOT EXISTS products_active_price_id_idx
  ON products (price, id) WHERE active;

CREATE INDEX IF NOT EXISTS products_active_in_stock_price_idx
  ON products (price, id) WHERE active AND stock > 0;
