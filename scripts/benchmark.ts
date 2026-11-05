import { access, appendFile, mkdir } from 'node:fs/promises';
import { hostname, platform, release, totalmem, cpus } from 'node:os';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pool, closePool } from '../api/src/db.js';

const target = Number(process.env.DATASET_SIZE ?? process.argv.find((arg) => arg.startsWith('--size='))?.split('=')[1] ?? 1_000);
const count = Number(process.env.REQUESTS ?? 300);
const concurrency = Number(process.env.CONCURRENCY ?? 10);
const warmups = Number(process.env.WARMUPS ?? 30);
const mode = process.env.SEARCH_MODE ?? 'baseline';
const api = (process.env.API_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '');
const outDir = resolve(process.env.BENCHMARK_RESULTS ?? 'benchmarks/results');
if (![1_000, 100_000, 1_000_000, 10_000_000].includes(target)) throw new Error('Use --size=1000|100000|1000000|10000000');
if (!Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger(concurrency) || concurrency < 1 || !Number.isSafeInteger(warmups) || warmups < 0) throw new Error('REQUESTS and CONCURRENCY must be positive integers; WARMUPS must be a non-negative integer');
await mkdir(outDir, { recursive: true });
const actual = Number((await pool.query<{ count: string }>('SELECT count(*)::text AS count FROM products')).rows[0].count);
if (actual < target) throw new Error(`Requested ${target.toLocaleString()} rows but database has ${actual.toLocaleString()}. Run db:seed with TARGET_ROWS=${target} first.`);
const health = await fetch(`${api}/api/health`);
if (!health.ok) throw new Error(`API is not healthy (${health.status}); start it with pnpm dev:api`);
const runId = randomUUID();
const machine = { hostname: hostname(), platform: platform(), release: release(), architecture: process.arch, cpus: cpus().length, cpuModel: cpus()[0]?.model, totalMemoryBytes: totalmem(), node: process.version, postgres: (await pool.query<{ version: string }>('SHOW server_version')).rows[0].version, cacheState: process.env.CACHE_STATE ?? `warm-after-${warmups}-warmups` };
const cases = [
  { name: 'spec-i7', q: 'Intel Core i7', category: 'Laptops' },
  { name: 'brand-dell', q: 'Dell', brand: 'Dell' },
  { name: 'typo-wireless', q: 'wireles' },
  { name: 'prefix-latitude', q: 'Lat' },
  { name: 'category-price', q: 'SSD', category: 'Laptops', maxPrice: 120000 },
];
const samples: { case: string; n: number; latencyMs: number; status: number }[] = [];
let requestIndex = 0;
async function request(test: typeof cases[number], n: number): Promise<{ ms: number; status: number }> {
  const params = new URLSearchParams({ q: test.q, limit: '20', mode, maxId: String(target) });
  if (test.category) params.set('category', test.category);
  if (test.brand) params.set('brand', test.brand);
  if (test.maxPrice) params.set('maxPrice', String(test.maxPrice));
  const start = performance.now();
  const response = await fetch(`${api}/api/search?${params}`);
  await response.arrayBuffer();
  return { ms: Number((performance.now() - start).toFixed(3)), status: response.status };
}
try {
  for (let i = 0; i < warmups; i += 1) await request(cases[i % cases.length], i);
  const wallStart = performance.now();
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const n = requestIndex++;
      if (n >= count) return;
      const test = cases[n % cases.length];
      try { const result = await request(test, n); samples.push({ case: test.name, n, latencyMs: result.ms, status: result.status }); }
      catch { samples.push({ case: test.name, n, latencyMs: -1, status: 0 }); }
    }
  });
  await Promise.all(workers);
  const durationMs = performance.now() - wallStart;
  const sorted = samples.filter((s) => s.latencyMs >= 0).map((s) => s.latencyMs).sort((a, b) => a - b);
  const percentile = (p: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] : 0;
  const errors = samples.filter((s) => s.status < 200 || s.status >= 300).length;
  const summary = { runId, timestamp: new Date().toISOString(), datasetRows: target, physicalRows: actual, targetRows: target, backend: mode === 'optimized' ? 'postgresql-trigram' : mode === 'meilisearch' ? 'meilisearch' : 'postgresql-like-baseline', mode, requests: count, warmups, concurrency, errors, p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99), meanMs: sorted.length ? Number((sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(3)) : 0, throughputRps: Number((count / (durationMs / 1000)).toFixed(2)), durationMs: Number(durationMs.toFixed(2)), seed: Number(process.env.DATA_SEED ?? 20261101), machine };
  const sampleFile = resolve(outDir, 'access-time-samples.csv');
  const exists = async (path: string) => access(path).then(() => true).catch(() => false);
  const hasSamples = await exists(sampleFile);
  if (!hasSamples) await appendFile(sampleFile, 'run_id,timestamp,dataset_rows,backend,case,request,latency_ms,status\n');
  await appendFile(sampleFile, samples.map((s) => `${runId},${summary.timestamp},${target},${mode},${s.case},${s.n},${s.latencyMs},${s.status}`).join('\n') + '\n');
  const summaryFile = resolve(outDir, 'latency-summary.csv');
  if (!await exists(summaryFile)) await appendFile(summaryFile, 'timestamp,run_id,dataset_rows,backend,requests,concurrency,errors,p50_ms,p95_ms,p99_ms,mean_ms,throughput_rps,duration_ms\n');
  await appendFile(summaryFile, `${summary.timestamp},${runId},${target},${mode},${count},${concurrency},${errors},${summary.p50Ms},${summary.p95Ms},${summary.p99Ms},${summary.meanMs},${summary.throughputRps},${summary.durationMs}\n`);
  await appendFile(resolve(outDir, 'benchmark-runs.jsonl'), `${JSON.stringify(summary)}\n`);
  await pool.query(`INSERT INTO benchmark_runs(run_id,dataset_size,backend,mode,query_type,query_text,request_count,error_count,p50_ms,p95_ms,p99_ms,mean_ms,throughput_rps,duration_ms,concurrency,seed,machine)
    VALUES ($1,$2,$3,$4,'mixed','repeatable mixed search queries',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)`, [runId, target, summary.backend, mode, count, errors, summary.p50Ms, summary.p95Ms, summary.p99Ms, summary.meanMs, summary.throughputRps, summary.durationMs, concurrency, summary.seed, JSON.stringify(machine)]);
  console.info(JSON.stringify(summary, null, 2));
} finally { await closePool(); }
