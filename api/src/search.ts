import { pool } from './db.js';
import { toProduct, type Product, type ProductRow } from './types.js';

export type SearchInput = {
  q: string;
  category?: string;
  brand?: string;
  inStock?: boolean;
  minPrice?: number;
  maxPrice?: number;
  maxId?: number;
  limit: number;
  cursor?: string;
  mode: 'baseline' | 'optimized';
};

type Cursor = { score: number; id: string };
function decodeCursor(value?: string): Cursor | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Cursor;
    if (!Number.isFinite(parsed.score) || !/^\d+$/.test(parsed.id)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}
function encodeCursor(value: Cursor): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

type WhereClause = { sql: string; values: unknown[] };
function createWhere(input: SearchInput, parameterOffset = 0): WhereClause {
  const values: unknown[] = [];
  const add = (value: unknown) => { values.push(value); return `$${parameterOffset + values.length}`; };
  const clauses = ['active = true'];
  const query = input.q.trim().toLocaleLowerCase();
  if (query) {
    const exact = add(query);
    const like = add(`%${escapeLike(query)}%`);
    const exactClause = `search_text LIKE ${like} ESCAPE '\\'`;
    if (input.mode === 'optimized' && query.length >= 3) {
      const termClauses = query.split(/\s+/).filter(Boolean).map((term) => {
        const fuzzyTerm = add(term);
        const literalTerm = add(`%${escapeLike(term)}%`);
        return term.length >= 3
          ? `(search_text % ${fuzzyTerm} OR search_text LIKE ${literalTerm} ESCAPE '\\')`
          : `search_text LIKE ${literalTerm} ESCAPE '\\'`;
      });
      clauses.push(`(${exactClause} OR (${termClauses.join(' AND ')}) OR search_vector @@ plainto_tsquery('simple', ${exact}))`);
    } else {
      clauses.push(exactClause);
    }
  }
  if (input.category) clauses.push(`category = ${add(input.category)}`);
  if (input.brand) clauses.push(`brand = ${add(input.brand)}`);
  if (input.inStock) clauses.push('stock > 0');
  if (Number.isFinite(input.minPrice)) clauses.push(`price >= ${add(input.minPrice)}`);
  if (Number.isFinite(input.maxPrice)) clauses.push(`price <= ${add(input.maxPrice)}`);
  if (Number.isSafeInteger(input.maxId) && Number(input.maxId) > 0) clauses.push(`id <= ${add(input.maxId)}`);
  return { sql: clauses.join(' AND '), values };
}

function relevanceExpression(query: string): string {
  if (!query) return '0::integer';
  return `CASE
    WHEN lower(sku) = lower($1) THEN 100
    WHEN lower(name) = lower($1) THEN 90
    WHEN name ILIKE $2 ESCAPE '\\' THEN 70
    WHEN name ILIKE $3 ESCAPE '\\' THEN 50
    WHEN description ILIKE $3 ESCAPE '\\' THEN 30
    ELSE 10
  END::integer`;
}

export async function searchProducts(input: SearchInput): Promise<{
  items: Product[];
  total: number;
  nextCursor: string | null;
  dbMs: number;
  mode: string;
  facets: { categories: { name: string; count: number }[]; brands: { name: string; count: number }[] };
  priceRange: { min: number; max: number };
}> {
  const started = performance.now();
  const query = input.q.trim();
  const queryParams = query ? [query, `${escapeLike(query)}%`, `%${escapeLike(query)}%`] : [];
  const where = createWhere(input, queryParams.length);
  const values = [...queryParams, ...where.values];
  const relation = query ? relevanceExpression(query) : '0::integer';
  const cursor = decodeCursor(input.cursor);
  const cursorClause = cursor ? `AND ((rank < $${values.length + 1}) OR (rank = $${values.length + 1} AND id > $${values.length + 2}::bigint))` : '';
  if (cursor) values.push(cursor.score, cursor.id);
  values.push(input.limit + 1);
  const limitParam = `$${values.length}`;
  const searchSql = `WITH matched AS (
    SELECT id, sku, name, brand, category, description, specs, price, rating, reviews, stock,
      active, version, created_at, updated_at,
      ${relation} AS rank
    FROM products
    WHERE ${where.sql}
  )
  SELECT id, sku, name, brand, category, description, specs, price, rating, reviews, stock,
    active, version, created_at, updated_at, rank
  FROM matched
  WHERE true ${cursorClause}
  ORDER BY rank DESC, id ASC
  LIMIT ${limitParam}`;
  const countSql = `SELECT count(*)::bigint AS total FROM products WHERE ${where.sql}`;
  const categoryWhere = createWhere({ ...input, category: undefined }, queryParams.length);
  const brandWhere = createWhere({ ...input, brand: undefined }, queryParams.length);
  const rangeWhere = createWhere({ ...input, minPrice: undefined, maxPrice: undefined }, queryParams.length);
  const categoryValues = [...queryParams, ...categoryWhere.values];
  const brandValues = [...queryParams, ...brandWhere.values];
  const [rows, count, categories, brands, range] = await Promise.all([
    pool.query(searchSql, values),
    pool.query(countSql, values.slice(0, values.length - (cursor ? 3 : 1))),
    pool.query<{ name: string; count: string }>(`SELECT category AS name, count(*)::bigint AS count FROM products WHERE ${categoryWhere.sql} GROUP BY category ORDER BY count(*) DESC, category`, categoryValues),
    pool.query<{ name: string; count: string }>(`SELECT brand AS name, count(*)::bigint AS count FROM products WHERE ${brandWhere.sql} GROUP BY brand ORDER BY count(*) DESC, brand`, brandValues),
    pool.query<{ min: string | null; max: string | null }>(`SELECT min(price)::text AS min, max(price)::text AS max FROM products WHERE ${rangeWhere.sql}`, [...queryParams, ...rangeWhere.values]),
  ]);
  const hasMore = rows.rows.length > input.limit;
  const pageRows = (hasMore ? rows.rows.slice(0, input.limit) : rows.rows) as (ProductRow & { rank: number })[];
  const last = pageRows.at(-1);
  return {
    items: pageRows.map((row) => toProduct(row)),
    total: Number(count.rows[0]?.total ?? 0),
    nextCursor: hasMore && last ? encodeCursor({ score: Number(last.rank), id: last.id }) : null,
    dbMs: Number((performance.now() - started).toFixed(3)),
    mode: input.mode,
    facets: {
      categories: categories.rows.map((row) => ({ name: row.name, count: Number(row.count) })),
      brands: brands.rows.map((row) => ({ name: row.name, count: Number(row.count) })),
    },
    priceRange: { min: Number(range.rows[0]?.min ?? 0), max: Number(range.rows[0]?.max ?? 0) },
  };
}
