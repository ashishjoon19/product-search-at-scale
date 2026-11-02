import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pool, closePool } from './db.js';
import { searchProducts } from './search.js';
import { startIndexerWorker } from './worker.js';
import { toProduct, type ProductRow } from './types.js';

const port = Number(process.env.API_PORT ?? 3001);
const accessLogPath = resolve(process.env.API_ACCESS_LOG ?? 'logs/api-access.jsonl');
mkdirSync(dirname(accessLogPath), { recursive: true });
const accessLog = createWriteStream(accessLogPath, { flags: 'a' });

type ProductInput = {
  sku?: unknown;
  name?: unknown;
  brand?: unknown;
  category?: unknown;
  description?: unknown;
  specs?: unknown;
  price?: unknown;
  rating?: unknown;
  reviews?: unknown;
  stock?: unknown;
  active?: unknown;
};

function badRequest(message: string): never { throw Object.assign(new Error(message), { statusCode: 400 }); }

function json(res: ServerResponse, status: number, body: unknown): void {
  const content = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(content), 'Cache-Control': 'no-store' });
  res.end(content);
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 256 * 1024) badRequest('Request body is too large (maximum 256 KB)');
    chunks.push(buffer);
  }
  if (size === 0) return {};
  const value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) badRequest('Request body must be a JSON object');
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) badRequest(`${label} is required and must be at most ${maxLength} characters`);
  return value.trim();
}
function numberInRange(value: unknown, label: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) badRequest(`${label} must be between ${min} and ${max}`);
  return parsed;
}
function validateProduct(body: ProductInput): Required<Pick<ProductInput, 'sku' | 'name' | 'brand' | 'category' | 'description' | 'specs' | 'price' | 'rating' | 'reviews' | 'stock' | 'active'>> {
  const specs = body.specs === undefined ? [] : body.specs;
  if (!Array.isArray(specs) || specs.length > 24 || specs.some((spec) => typeof spec !== 'string' || spec.length > 120)) badRequest('Specifications must be an array of up to 24 strings, each at most 120 characters');
  return {
    sku: requiredText(body.sku, 'SKU', 80),
    name: requiredText(body.name, 'Name', 180),
    brand: requiredText(body.brand, 'Brand', 80),
    category: requiredText(body.category, 'Category', 80),
    description: typeof body.description === 'string' ? body.description.slice(0, 2_000) : '',
    specs,
    price: numberInRange(body.price, 'Price', 0, 100_000_000),
    rating: body.rating === undefined ? 0 : numberInRange(body.rating, 'Rating', 0, 5),
    reviews: body.reviews === undefined ? 0 : numberInRange(body.reviews, 'Reviews', 0, 100_000_000),
    stock: body.stock === undefined ? 0 : numberInRange(body.stock, 'Stock', 0, 100_000_000),
    active: body.active === undefined ? true : body.active === true,
  };
}

async function recordMutation(client: import('pg').PoolClient, product: ProductRow, eventType: 'product.upserted' | 'product.deactivated'): Promise<void> {
    await client.query(`INSERT INTO outbox_events (product_id, product_version, event_type, payload)
      VALUES ($1, $2, $3, to_jsonb((SELECT p FROM products p WHERE p.id = $1)))`, [product.id, product.version, eventType]);
    await client.query(`INSERT INTO search_sync_status (product_id, indexed_version, state, updated_at, last_error)
      VALUES ($1, 0, 'pending', now(), NULL)
      ON CONFLICT (product_id) DO UPDATE SET state = 'pending', updated_at = now(), last_error = NULL`, [product.id]);
}

async function mutateProduct<T>(operation: (client: import('pg').PoolClient) => Promise<{ product: ProductRow; result: T }>, eventType: 'product.upserted' | 'product.deactivated'): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { product, result } = await operation(client);
    await recordMutation(client, product, eventType);
    await client.query('COMMIT');
    return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

async function searchMeili(input: { q: string; category?: string; brand?: string; inStock: boolean; minPrice?: number; maxPrice?: number; maxId?: number; limit: number; cursor?: string }) {
  const base = process.env.MEILI_URL;
  if (!base) throw Object.assign(new Error('Meilisearch is not configured. Start the compose stack and set MEILI_URL.'), { statusCode: 503 });
  const filters: string[] = ['active = true'];
  const literal = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  if (input.category) filters.push(`category = ${literal(input.category)}`);
  if (input.brand) filters.push(`brand = ${literal(input.brand)}`);
  if (input.inStock) filters.push('stock > 0');
  if (input.minPrice !== undefined) filters.push(`price >= ${input.minPrice}`);
  if (input.maxPrice !== undefined) filters.push(`price <= ${input.maxPrice}`);
  if (input.maxId !== undefined) filters.push(`id <= ${input.maxId}`);
  const endpoint = `${base.replace(/\/$/, '')}/indexes/${encodeURIComponent(process.env.MEILI_INDEX ?? 'products')}/search`;
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.MEILI_API_KEY ? { Authorization: `Bearer ${process.env.MEILI_API_KEY}` } : {}) }, body: JSON.stringify({ q: input.q, limit: input.limit, filter: filters, facets: ['category', 'brand'], attributesToHighlight: [], showRankingScore: false }) });
  if (!response.ok) throw Object.assign(new Error(`Meilisearch request failed (${response.status}): ${(await response.text()).slice(0, 300)}`), { statusCode: 502 });
  const result = await response.json() as { hits: ProductRow[]; estimatedTotalHits?: number; processingTimeMs?: number; facetDistribution?: Record<string, Record<string, number>> };
  const facets = result.facetDistribution ?? {};
  const range = await pool.query<{ min: string | null; max: string | null }>('SELECT min(price)::text AS min, max(price)::text AS max FROM products WHERE active = true');
  return { items: result.hits.map(toProduct), total: result.estimatedTotalHits ?? result.hits.length, nextCursor: null, dbMs: result.processingTimeMs ?? 0, mode: 'meilisearch', facets: { categories: Object.entries(facets.category ?? {}).map(([name, count]) => ({ name, count })), brands: Object.entries(facets.brand ?? {}).map(([name, count]) => ({ name, count })) }, priceRange: { min: Number(range.rows[0]?.min ?? 0), max: Number(range.rows[0]?.max ?? 0) } };
}

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const requestStart = performance.now();
  const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const path = requestUrl.pathname;
  let status = 200;
  try {
    if (req.method === 'GET' && path === '/api/health') {
      await pool.query('SELECT 1');
      json(res, 200, { status: 'ok', database: 'connected', searchMode: process.env.SEARCH_MODE ?? 'baseline', meilisearch: process.env.MEILI_URL ? 'configured' : 'not configured' });
    } else if (req.method === 'GET' && path === '/api/products') {
      const limit = Math.min(50, Math.max(1, Number(requestUrl.searchParams.get('limit') ?? 12)));
      const after = requestUrl.searchParams.get('after');
      const result = await pool.query<ProductRow>(`SELECT * FROM products WHERE active = true ${after && /^\d+$/.test(after) ? 'AND id > $1::bigint' : ''} ORDER BY id LIMIT $${after && /^\d+$/.test(after) ? 2 : 1}`, after && /^\d+$/.test(after) ? [after, limit + 1] : [limit + 1]);
      const hasMore = result.rows.length > limit;
      const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
      const last = rows.at(-1);
      json(res, 200, { items: rows.map(toProduct), nextCursor: hasMore && last ? last.id : null });
    } else if (req.method === 'GET' && path === '/api/search') {
      const q = requestUrl.searchParams.get('q') ?? '';
      if (q.length > 120) throw Object.assign(new Error('Search query must be 120 characters or fewer'), { statusCode: 400 });
      const limit = Math.min(50, Math.max(1, Number(requestUrl.searchParams.get('limit') ?? 12)));
      const modeParam = requestUrl.searchParams.get('mode') ?? process.env.SEARCH_MODE ?? 'baseline';
      const mode = modeParam === 'optimized' || modeParam === 'meilisearch' ? modeParam : 'baseline';
      const parsePrice = (value: string | null) => value === null || value === '' ? undefined : numberInRange(value, 'Price filter', 0, 100_000_000);
      const dbStart = performance.now();
      const searchInput = {
        q,
        category: requestUrl.searchParams.get('category') || undefined,
        brand: requestUrl.searchParams.get('brand') || undefined,
        inStock: requestUrl.searchParams.get('inStock') === 'true',
        minPrice: parsePrice(requestUrl.searchParams.get('minPrice')),
        maxPrice: parsePrice(requestUrl.searchParams.get('maxPrice')),
        maxId: parsePrice(requestUrl.searchParams.get('maxId')),
        limit,
        cursor: requestUrl.searchParams.get('cursor') ?? undefined,
      };
      const result = mode === 'meilisearch' ? await searchMeili(searchInput) : await searchProducts({ ...searchInput, mode });
      const dbMs = Number((performance.now() - dbStart).toFixed(3));
      json(res, 200, { ...result, dbMs });
    } else if (req.method === 'GET' && path === '/api/admin/stats') {
      const [summary, categories, brands, queue] = await Promise.all([
        pool.query(`SELECT count(*)::bigint AS total, count(*) FILTER (WHERE active)::bigint AS active, min(price) AS min_price, max(price) AS max_price FROM products`),
        pool.query(`SELECT category AS name, count(*)::bigint AS count FROM products WHERE active GROUP BY category ORDER BY category`),
        pool.query(`SELECT brand AS name, count(*)::bigint AS count FROM products WHERE active GROUP BY brand ORDER BY brand`),
        pool.query(`SELECT count(*) FILTER (WHERE processed_at IS NULL)::bigint AS pending, count(*) FILTER (WHERE last_error IS NOT NULL)::bigint AS failed FROM outbox_events`),
      ]);
      json(res, 200, { ...summary.rows[0], categories: categories.rows.map((row) => ({ ...row, count: Number(row.count) })), brands: brands.rows.map((row) => ({ ...row, count: Number(row.count) })), outbox: queue.rows[0] });
    } else if (req.method === 'GET' && path === '/api/benchmarks') {
      const result = await pool.query(`SELECT * FROM benchmark_runs ORDER BY recorded_at DESC LIMIT 100`);
      json(res, 200, { runs: result.rows });
    } else if (req.method === 'GET' && /^\/api\/products\/\d+$/.test(path)) {
      const id = path.split('/').at(-1);
      const result = await pool.query<ProductRow>(`SELECT p.*, s.state AS index_state, s.indexed_version, s.last_error AS index_error FROM products p LEFT JOIN search_sync_status s ON s.product_id = p.id WHERE p.id = $1 AND p.active`, [id]);
      if (!result.rows[0]) throw Object.assign(new Error('Product not found'), { statusCode: 404 });
      json(res, 200, { ...toProduct(result.rows[0]), indexState: (result.rows[0] as ProductRow & { index_state?: string }).index_state ?? 'postgres-only' });
    } else if (req.method === 'POST' && path === '/api/products') {
      const product = validateProduct(await readBody(req));
      const created = await mutateProduct(async (client) => {
        const result = await client.query<ProductRow>(`INSERT INTO products (sku, name, brand, category, description, specs, price, rating, reviews, stock, active)
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11) RETURNING *`,
        [product.sku, product.name, product.brand, product.category, product.description, JSON.stringify(product.specs), product.price, product.rating, product.reviews, product.stock, product.active]);
        return { product: result.rows[0], result: result.rows[0] };
      }, 'product.upserted');
      json(res, 201, toProduct(created));
    } else if (req.method === 'PATCH' && /^\/api\/products\/\d+$/.test(path)) {
      const id = path.split('/').at(-1);
      const body = await readBody(req) as ProductInput;
      const next = {
        sku: body.sku === undefined ? null : requiredText(body.sku, 'SKU', 80),
        name: body.name === undefined ? null : requiredText(body.name, 'Name', 180),
        brand: body.brand === undefined ? null : requiredText(body.brand, 'Brand', 80),
        category: body.category === undefined ? null : requiredText(body.category, 'Category', 80),
        description: body.description === undefined ? null : typeof body.description === 'string' ? body.description.slice(0, 2_000) : null,
        specs: body.specs === undefined ? null : JSON.stringify(body.specs),
        price: body.price === undefined ? null : numberInRange(body.price, 'Price', 0, 100_000_000),
        rating: body.rating === undefined ? null : numberInRange(body.rating, 'Rating', 0, 5),
        reviews: body.reviews === undefined ? null : numberInRange(body.reviews, 'Reviews', 0, 100_000_000),
        stock: body.stock === undefined ? null : numberInRange(body.stock, 'Stock', 0, 100_000_000),
      };
      if (body.specs !== undefined && (!Array.isArray(body.specs) || body.specs.length > 24 || body.specs.some((item) => typeof item !== 'string' || item.length > 120))) badRequest('Specifications must be an array of up to 24 strings, each at most 120 characters');
      const updated = await mutateProduct(async (client) => {
      const result = await client.query<ProductRow>(`UPDATE products SET
        sku = COALESCE($2, sku), name = COALESCE($3, name), brand = COALESCE($4, brand), category = COALESCE($5, category),
        description = COALESCE($6, description), specs = COALESCE($7::jsonb, specs), price = COALESCE($8, price), rating = COALESCE($9, rating),
        reviews = COALESCE($10, reviews), stock = COALESCE($11, stock), version = version + 1, updated_at = now()
        WHERE id = $1 AND active = true RETURNING *`,
      [id, next.sku, next.name, next.brand, next.category, next.description, next.specs, next.price, next.rating, next.reviews, next.stock]);
      if (!result.rows[0]) throw Object.assign(new Error('Product not found'), { statusCode: 404 });
      return { product: result.rows[0], result: result.rows[0] };
      }, 'product.upserted');
      json(res, 200, toProduct(updated));
    } else if (req.method === 'DELETE' && /^\/api\/products\/\d+$/.test(path)) {
      const id = path.split('/').at(-1);
      await mutateProduct(async (client) => {
        const result = await client.query<ProductRow>(`UPDATE products SET active = false, version = version + 1, updated_at = now() WHERE id = $1 AND active = true RETURNING *`, [id]);
        if (!result.rows[0]) throw Object.assign(new Error('Product not found'), { statusCode: 404 });
        return { product: result.rows[0], result: result.rows[0] };
      }, 'product.deactivated');
      json(res, 200, { id, active: false, indexStatus: 'pending' });
    } else {
      status = 404;
      json(res, status, { error: 'Route not found' });
    }
  } catch (error) {
      const code = typeof error === 'object' && error !== null && 'statusCode' in error ? Number((error as { statusCode: number }).statusCode) : error instanceof SyntaxError ? 400 : 500;
    status = Number.isInteger(code) && code >= 400 && code < 600 ? code : 500;
    const message = error instanceof Error ? error.message : 'Unknown server error';
    if (status === 500) console.error('[api]', message);
    if (!res.headersSent) json(res, status, { error: status === 500 ? 'Internal server error' : message });
  } finally {
    const entry = JSON.stringify({ timestamp: new Date().toISOString(), method: req.method, path, status, durationMs: Number((performance.now() - requestStart).toFixed(3)) });
    accessLog.write(`${entry}\n`);
  }
}

const server = createServer((req, res) => { void route(req, res); });
let stopWorker: () => void = () => {};

server.listen(port, '127.0.0.1', async () => {
  try {
    stopWorker = await startIndexerWorker();
    console.info(`[api] http://127.0.0.1:${port} (search=${process.env.SEARCH_MODE ?? 'baseline'})`);
  } catch (error) {
    console.error('[indexer] startup failed; PostgreSQL search remains available', error);
    console.info(`[api] http://127.0.0.1:${port} (search=${process.env.SEARCH_MODE ?? 'baseline'})`);
  }
});

async function shutdown(): Promise<void> {
  stopWorker();
  server.close();
  accessLog.end();
  await closePool();
  process.exit(0);
}
process.on('SIGINT', () => { void shutdown(); });
process.on('SIGTERM', () => { void shutdown(); });
