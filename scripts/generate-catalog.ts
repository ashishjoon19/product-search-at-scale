import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { once } from 'node:events';
import { pool, closePool } from '../api/src/db.js';

const target = Number(process.env.TARGET_ROWS ?? process.argv.find((arg) => arg.startsWith('--rows='))?.split('=')[1] ?? 1_000);
const seed = Number(process.env.DATA_SEED ?? 20261101);
const batchSize = Number(process.env.BATCH_SIZE ?? 10_000);
const checkpointPath = resolve(process.env.GENERATOR_CHECKPOINT ?? 'benchmarks/results/generator-checkpoint.json');
const resultPath = resolve(process.env.GENERATOR_RESULT ?? 'benchmarks/results/generation-runs.jsonl');
if (!Number.isSafeInteger(target) || target < 1 || target > 10_000_000) throw new Error('TARGET_ROWS must be an integer from 1 to 10,000,000');
if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 100_000) throw new Error('BATCH_SIZE must be an integer from 1 to 100,000');

let state = seed >>> 0;
function random(): number { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 0x1_0000_0000; }
function pick<T>(values: T[]): T { return values[Math.floor(random() * values.length)]; }
function weighted<T>(values: T[], weights: number[]): T {
  let n = random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < values.length; i += 1) { n -= weights[i]; if (n < 0) return values[i]; }
  return values.at(-1)!;
}
const categories = ['Laptops', 'Audio', 'Accessories', 'Monitors', 'Storage', 'Networking', 'Mobile', 'Home office'];
const brands = ['Dell', 'Lenovo', 'HP', 'ASUS', 'Acer', 'Apple', 'Sony', 'Logitech', 'Samsung', 'LG', 'Keychron', 'Jabra'];
const processors = ['Intel Core i5-1335U', 'Intel Core i7-1355U', 'Intel Core Ultra 7 155H', 'AMD Ryzen 5 7530U', 'AMD Ryzen 7 7840U', 'Apple M3'];
const memory = ['8 GB DDR4', '16 GB DDR5', '32 GB DDR5', '64 GB DDR5'];
const storage = ['256 GB SSD', '512 GB SSD', '1 TB SSD', '2 TB SSD'];
const adjectives = ['Pro', 'Business', 'Essential', 'Creator', 'Everyday', 'Performance', 'Travel', 'Studio'];
function product(i: number): string {
  // Each row gets its own PRNG start so resuming at a checkpoint produces the
  // same records as one uninterrupted generation run.
  state = (Math.imul((seed ^ i) >>> 0, 747796405) + 2891336453) >>> 0;
  const category = weighted(categories, [28, 13, 15, 10, 9, 7, 11, 7]);
  const brand = weighted(brands, [13, 12, 11, 9, 8, 4, 8, 8, 8, 6, 5, 4]);
  const sku = `${brand.slice(0, 3).toUpperCase()}-${category.slice(0, 3).toUpperCase()}-${String(i).padStart(8, '0')}`;
  const model = `${brand} ${pick(adjectives)} ${100 + Math.floor(random() * 900)}${String.fromCharCode(65 + Math.floor(random() * 26))}`;
  const specs = category === 'Laptops' ? [pick(processors), pick(memory), pick(storage), `${13 + Math.floor(random() * 5)}-inch display`, 'Wi-Fi 6E'] : category === 'Audio' ? ['Bluetooth 5.3', 'Active noise cancelling', `${20 + Math.floor(random() * 40)}-hour battery`, 'USB-C charging'] : [`${Math.floor(2 + random() * 10)}-year warranty`, 'USB-C', 'Wireless connectivity'];
  const about = `${model} ${category.toLowerCase()} designed for work and everyday use. Includes ${specs.slice(0, 2).join(' and ')}.`;
  const price = category === 'Laptops' ? 35_000 + random() * 160_000 : 1_000 + random() * 45_000;
  const stock = random() < 0.08 ? 0 : Math.floor(random() * 250);
  const fields = [sku, model, brand, category, about, JSON.stringify(specs), price.toFixed(2), (3 + random() * 2).toFixed(1), String(Math.floor(random() * 20_000)), String(stock), 'true'];
  return fields.map((field) => field.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n')).join('\t');
}

await mkdir(resolve('benchmarks/results'), { recursive: true });
const countResult = await pool.query<{ count: string }>('SELECT count(*)::text AS count FROM products');
let inserted = Number(countResult.rows[0].count);
if (inserted > target) throw new Error(`Database already has ${inserted} rows, above requested target ${target}. Use a fresh database for a lower target.`);
const started = performance.now();
const out = createWriteStream(checkpointPath, { flags: 'w' });
out.write(JSON.stringify({ target, seed, startingRows: inserted, startedAt: new Date().toISOString() }));
out.end(); await once(out, 'finish');
let batchNo = 0;
try {
  while (inserted < target) {
    const amount = Math.min(batchSize, target - inserted);
    const copy = (await import('pg-copy-streams')).from;
    const client = await pool.connect();
    let released = false;
    const batchStart = performance.now();
    try {
      const submitCopy = client.query as unknown as (query: unknown) => unknown;
      const sink = submitCopy(copy(`COPY products (sku,name,brand,category,description,specs,price,rating,reviews,stock,active) FROM STDIN WITH (FORMAT text)`)) as import('node:stream').Writable;
      for (let n = 0; n < amount; n += 1) {
        const line = `${product(inserted + n + 1)}\n`;
        if (!sink.write(line)) await once(sink, 'drain');
      }
      sink.end(); await once(sink, 'finish');
      inserted += amount; batchNo += 1;
      const record = { timestamp: new Date().toISOString(), batch: batchNo, inserted, target, batchRows: amount, batchMs: Number((performance.now() - batchStart).toFixed(2)), elapsedMs: Number((performance.now() - started).toFixed(2)), rowsPerSecond: Number((inserted / ((performance.now() - started) / 1000)).toFixed(1)), seed };
      const append = createWriteStream(resultPath, { flags: 'a' }); append.write(`${JSON.stringify(record)}\n`); append.end(); await once(append, 'finish');
      const cp = createWriteStream(checkpointPath, { flags: 'w' }); cp.write(JSON.stringify({ target, seed, inserted, updatedAt: new Date().toISOString() })); cp.end(); await once(cp, 'finish');
      console.info(`[seed] ${inserted.toLocaleString()} / ${target.toLocaleString()} rows · batch ${record.batchMs} ms · avg ${record.rowsPerSecond} rows/s`);
    } catch (error) { client.release(); released = true; throw error; } finally { if (!released) client.release(); }
  }
  const file = await stat(resultPath).catch(() => null);
  console.info(`[seed] complete: ${inserted.toLocaleString()} products; run log ${resultPath}; prior log bytes ${file?.size ?? 0}`);
} finally { await closePool(); }
