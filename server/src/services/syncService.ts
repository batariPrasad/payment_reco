import { pool } from '../config/db';
import { chunkDateRange, getShipmentDetail, listAllShipments } from './kwikshipClient';
import { upsertShipment } from './shipmentsRepo';

async function runWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function runner() {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await worker(items[current]);
    }
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, () => runner());
  await Promise.all(runners);
  return results;
}

export interface SyncProgress {
  chunk: { from: string; to: string };
  listedSoFar: number;
  detailedSoFar: number;
  totalToDetail: number;
}

export async function syncShipments(
  from: string,
  to: string,
  onProgress?: (p: SyncProgress) => void
): Promise<{ listed: number; detailed: number; syncRunId: number }> {
  const { rows } = await pool.query<{ id: number }>(
    'INSERT INTO sync_runs (from_date, to_date, status) VALUES ($1,$2,$3) RETURNING id',
    [from, to, 'running']
  );
  const syncRunId = rows[0].id;

  let listed = 0;
  let detailed = 0;

  try {
    const chunks = chunkDateRange(from, to);
    for (const chunk of chunks) {
      const items = await listAllShipments({ from: chunk.from, to: chunk.to });
      listed += items.length;

      const awbs = items.map((i) => i.awb).filter(Boolean);
      await runWithConcurrency(awbs, 8, async (awb) => {
        const detail = await getShipmentDetail(awb);
        if (detail) {
          await upsertShipment(detail, 'api');
          detailed += 1;
        }
        onProgress?.({ chunk, listedSoFar: listed, detailedSoFar: detailed, totalToDetail: awbs.length });
      });
    }

    await pool.query(
      'UPDATE sync_runs SET finished_at = now(), shipments_listed = $1, shipments_detailed = $2, status = $3 WHERE id = $4',
      [listed, detailed, 'completed', syncRunId]
    );
  } catch (err) {
    await pool.query(
      'UPDATE sync_runs SET finished_at = now(), shipments_listed = $1, shipments_detailed = $2, status = $3, error_message = $4 WHERE id = $5',
      [listed, detailed, 'failed', err instanceof Error ? err.message : String(err), syncRunId]
    );
    throw err;
  }

  return { listed, detailed, syncRunId };
}
