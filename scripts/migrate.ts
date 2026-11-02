import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pool, closePool } from '../api/src/db.js';

const dir = resolve('db/migrations');
const through = process.argv.find((arg) => arg.startsWith('--through='))?.split('=')[1];
try {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const done = new Set((await pool.query<{ version: string }>('SELECT version FROM schema_migrations')).rows.map((row) => row.version));
  for (const file of (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort()) {
    const version = file.replace(/\.sql$/, '');
    if (through && version > through) continue;
    if (done.has(version)) { console.info(`[migrate] already applied ${version}`); continue; }
    const client = await pool.connect();
    const started = performance.now();
    try {
      await client.query('BEGIN');
      await client.query(await readFile(resolve(dir, file), 'utf8'));
      await client.query('INSERT INTO schema_migrations(version) VALUES ($1)', [version]);
      await client.query('COMMIT');
      console.info(`[migrate] applied ${version} in ${(performance.now() - started).toFixed(1)} ms`);
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
} finally { await closePool(); }
