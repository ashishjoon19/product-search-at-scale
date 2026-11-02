import { pool } from './db.js';

type OutboxEvent = {
  id: string;
  product_id: string;
  product_version: number;
  event_type: string;
  payload: Record<string, unknown>;
  attempts: number;
};

const meiliUrl = process.env.MEILI_URL;
const meiliKey = process.env.MEILI_API_KEY;
const indexUid = process.env.MEILI_INDEX ?? 'products';
let working = false;

async function meiliRequest(path: string, init: RequestInit = {}): Promise<Response> {
  if (!meiliUrl) throw new Error('MEILI_URL is not configured');
  return fetch(`${meiliUrl.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(meiliKey ? { Authorization: `Bearer ${meiliKey}` } : {}), ...init.headers },
  });
}

async function waitForMeiliTask(taskUid: number): Promise<void> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const response = await meiliRequest(`/tasks/${taskUid}`);
    if (!response.ok) throw new Error(`Meilisearch task read failed (${response.status})`);
    const task = await response.json() as { status: string; error?: { message?: string } };
    if (task.status === 'succeeded') return;
    if (task.status === 'failed' || task.status === 'canceled') throw new Error(task.error?.message ?? `Meilisearch task ${task.status}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Meilisearch task ${taskUid} did not finish within 120 seconds`);
}

async function ensureIndex(): Promise<void> {
  if (!meiliUrl) return;
  let response = await meiliRequest('/indexes', { method: 'POST', body: JSON.stringify({ uid: indexUid, primaryKey: 'id' }) });
  if (response.ok) {
    const task = await response.json() as { taskUid: number };
    await waitForMeiliTask(task.taskUid);
  } else if (response.status !== 409) throw new Error(`Meilisearch index create failed (${response.status})`);
  response = await meiliRequest(`/indexes/${indexUid}/settings`, {
    method: 'PATCH',
    body: JSON.stringify({
      searchableAttributes: ['name', 'brand', 'category', 'description', 'specs', 'sku'],
      filterableAttributes: ['brand', 'category', 'active', 'stock', 'price', 'id'],
      sortableAttributes: ['price', 'rating', 'id'],
    }),
  });
  if (!response.ok) throw new Error(`Meilisearch settings update failed (${response.status})`);
  const settingsTask = await response.json() as { taskUid: number };
  await waitForMeiliTask(settingsTask.taskUid);
}

async function claimBatch(): Promise<OutboxEvent[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<OutboxEvent>(`
      WITH selected AS (
        SELECT id FROM outbox_events
        WHERE processed_at IS NULL AND (locked_at IS NULL OR locked_at < now() - interval '2 minutes')
        ORDER BY id
        FOR UPDATE SKIP LOCKED
        LIMIT 100
      )
      UPDATE outbox_events e
      SET locked_at = now(), attempts = attempts + 1
      FROM selected s WHERE e.id = s.id
      RETURNING e.id, e.product_id, e.product_version, e.event_type, e.payload, e.attempts
    `);
    await client.query('COMMIT');
    return result.rows;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function processBatch(events: OutboxEvent[]): Promise<void> {
  if (events.length === 0 || !meiliUrl) return;
  const latestByProduct = new Map<string, OutboxEvent>();
  for (const event of events) {
    const previous = latestByProduct.get(event.product_id);
    if (!previous || event.product_version > previous.product_version) latestByProduct.set(event.product_id, event);
  }
  const latest = [...latestByProduct.values()];
  const documents = latest.filter((event) => event.event_type === 'product.upserted').map((event) => ({ ...event.payload, id: Number(event.product_id) }));
  const deleted = latest.filter((event) => event.event_type === 'product.deactivated').map((event) => event.product_id);
  try {
    const successes = new Set<string>();
    if (documents.length) {
      const response = await meiliRequest(`/indexes/${indexUid}/documents?primaryKey=id`, { method: 'POST', body: JSON.stringify(documents) });
      if (!response.ok) throw new Error(`Meilisearch document upsert failed (${response.status}): ${(await response.text()).slice(0, 400)}`);
      const task = await response.json() as { taskUid: number };
      await waitForMeiliTask(task.taskUid);
      for (const event of latest) if (event.event_type === 'product.upserted') {
        for (const original of events) if (original.product_id === event.product_id) successes.add(original.id);
      }
    }
    for (const productId of deleted) {
      const response = await meiliRequest(`/indexes/${indexUid}/documents/${productId}`, { method: 'DELETE' });
      if (!response.ok && response.status !== 404) throw new Error(`Meilisearch document delete failed (${response.status})`);
      if (response.ok) {
        const task = await response.json() as { taskUid: number };
        await waitForMeiliTask(task.taskUid);
      }
      for (const event of events) if (event.product_id === productId) successes.add(event.id);
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const event of events) {
        if (successes.has(event.id)) {
          await client.query('UPDATE outbox_events SET processed_at = now(), locked_at = NULL, last_error = NULL WHERE id = $1', [event.id]);
          await client.query(`INSERT INTO search_sync_status (product_id, indexed_version, state, updated_at, last_error)
            VALUES ($1, $2, 'current', now(), NULL)
            ON CONFLICT (product_id) DO UPDATE SET indexed_version = GREATEST(search_sync_status.indexed_version, EXCLUDED.indexed_version), state = 'current', updated_at = now(), last_error = NULL`, [event.product_id, event.product_version]);
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : 'Unknown index worker error';
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const event of events) {
        await client.query('UPDATE outbox_events SET locked_at = NULL, last_error = $2 WHERE id = $1', [event.id, message]);
        await client.query(`INSERT INTO search_sync_status (product_id, indexed_version, state, updated_at, last_error)
          VALUES ($1, 0, 'failed', now(), $2)
          ON CONFLICT (product_id) DO UPDATE SET state = 'failed', updated_at = now(), last_error = EXCLUDED.last_error`, [event.product_id, message]);
      }
      await client.query('COMMIT');
    } catch {
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  }
}

export async function startIndexerWorker(): Promise<() => void> {
  if (!meiliUrl) {
    console.info('[indexer] MEILI_URL not configured; PostgreSQL search stays active and outbox rows remain pending');
    return () => undefined;
  }
  await ensureIndex();
  let stopped = false;
  const tick = async () => {
    if (stopped || working) return;
    working = true;
    try {
      const batch = await claimBatch();
      await processBatch(batch);
    } catch (error) {
      console.error('[indexer]', error);
    } finally {
      working = false;
    }
  };
  const timer = setInterval(() => { void tick(); }, 1_000);
  void tick();
  return () => { stopped = true; clearInterval(timer); };
}
