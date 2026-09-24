import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../config/db';
import { syncShipments } from '../services/syncService';
import { authMiddleware, requirePermission } from '../middleware/auth';

export const syncRouter = Router();
syncRouter.use(authMiddleware);

const bodySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD'),
});

// Runs synchronously in the request for simplicity. For very large date ranges this can
// take a while (one detail call per AWB); the client should show a spinner and can poll
// GET /api/sync/runs for progress in the meantime from another tab if it times out.
syncRouter.post('/', requirePermission('canUpload'), async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message });

  try {
    const result = await syncShipments(parsed.data.from, parsed.data.to);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(502).json({ success: false, error: err instanceof Error ? err.message : 'Sync failed' });
  }
});

syncRouter.get('/runs', requirePermission('canView'), async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 50');
  res.json({ success: true, data: rows });
});
