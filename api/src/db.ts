import pg from 'pg';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Keep local `.env` support dependency-free; shell-provided variables take precedence.
const envFile = resolve('.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
    process.env[match[1]] = value;
  }
}

const { Pool } = pg;
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/product_search',
  max: Number(process.env.PG_POOL_MAX ?? 12),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (error) => console.error('[db] idle client error', error.message));

export async function closePool(): Promise<void> {
  await pool.end();
}
