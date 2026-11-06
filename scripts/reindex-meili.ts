import { appendFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pool, closePool } from '../api/src/db.js';

const base = process.env.MEILI_URL;
if (!base) throw new Error('Set MEILI_URL before building the Meilisearch index');
const key = process.env.MEILI_API_KEY;
const uid = process.env.MEILI_INDEX ?? 'products';
const batchSize = Number(process.env.MEILI_BATCH_SIZE ?? 5_000);
const resultPath = resolve('benchmarks/results/meili-index-runs.jsonl');
const started = performance.now();
let indexed = 0;
async function call(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${base!.replace(/\/$/, '')}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}), ...init.headers } });
}
async function waitTask(id: number): Promise<void> {
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    const response = await call(`/tasks/${id}`);
    if (!response.ok) throw new Error(`Could not read Meilisearch task ${id}: ${response.status}`);
    const task = await response.json() as { status: string; error?: { message?: string } };
    if (task.status === 'succeeded') return;
    if (task.status === 'failed' || task.status === 'canceled') throw new Error(task.error?.message ?? `Meilisearch task ${task.status}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Meilisearch task ${id} exceeded five minutes`);
}
try {
  let response = await call('/indexes', { method: 'POST', body: JSON.stringify({ uid, primaryKey: 'id' }) });
  if (response.ok) { const task = await response.json() as { taskUid: number }; await waitTask(task.taskUid); }
  else if (response.status !== 409) throw new Error(`Index create failed: ${response.status} ${(await response.text()).slice(0, 300)}`);
  response = await call(`/indexes/${uid}/settings`, { method: 'PATCH', body: JSON.stringify({ searchableAttributes: ['name', 'brand', 'category', 'description', 'specs', 'sku'], filterableAttributes: ['brand', 'category', 'active', 'stock', 'price', 'id'], sortableAttributes: ['price', 'rating', 'id'] }) });
  if (!response.ok) throw new Error(`Settings update failed: ${response.status} ${(await response.text()).slice(0, 300)}`);
  await waitTask(((await response.json()) as { taskUid: number }).taskUid);
  let lastId = '0';
  while (true) {
    const result = await pool.query<Record<string, unknown>>(`SELECT id, sku, name, brand, category, description, specs, price::float AS price, rating::float AS rating, reviews, stock, active, version, created_at, updated_at FROM products WHERE id > $1::bigint ORDER BY id LIMIT $2`, [lastId, batchSize]);
    if (!result.rows.length) break;
    const docs = result.rows.map((row) => ({ ...row, id: Number(row.id) }));
    const posted = await call(`/indexes/${uid}/documents?primaryKey=id`, { method: 'POST', body: JSON.stringify(docs) });
    if (!posted.ok) throw new Error(`Bulk indexing failed at row ${indexed}: ${posted.status} ${(await posted.text()).slice(0, 300)}`);
    await waitTask(((await posted.json()) as { taskUid: number }).taskUid);
    indexed += result.rows.length;
    lastId = String(result.rows.at(-1)?.id);
    console.info(`[meili] indexed ${indexed.toLocaleString()} products`);
  }
  const record = { timestamp: new Date().toISOString(), indexedRows: indexed, elapsedMs: Number((performance.now() - started).toFixed(2)), rowsPerSecond: Number((indexed / ((performance.now() - started) / 1000)).toFixed(1)), index: uid };
  await mkdir(resolve('benchmarks/results'), { recursive: true });
  await appendFile(resultPath, `${JSON.stringify(record)}\n`);
  console.info(JSON.stringify(record, null, 2));
} finally { await closePool(); }
