import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../config/db';
import { runReconciliation } from '../services/reconciliationEngine';
import { authMiddleware, requireAdmin, requirePermission } from '../middleware/auth';

export const reconcileRouter = Router();
reconcileRouter.use(authMiddleware);

const runSchema = z.object({ misUploadId: z.number().int().positive() });

reconcileRouter.post('/run', requirePermission('canEdit'), async (req, res) => {
  const parsed = runSchema.safeParse({ misUploadId: Number(req.body.misUploadId) });
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message });

  try {
    const result = await runReconciliation(parsed.data.misUploadId);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Reconciliation failed' });
  }
});

reconcileRouter.get('/runs', requirePermission('canView'), async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT r.*, m.filename AS mis_filename
     FROM reconciliation_runs r
     JOIN mis_uploads m ON m.id = r.mis_upload_id
     ORDER BY r.run_at DESC`
  );
  res.json({ success: true, data: rows });
});

reconcileRouter.get('/runs/:runId/summary', requirePermission('canView'), async (req, res) => {
  const runId = Number(req.params.runId);
  const { rows } = await pool.query('SELECT * FROM reconciliation_runs WHERE id = $1', [runId]);
  if (rows.length === 0) return res.status(404).json({ success: false, error: 'Run not found' });

  const { rows: breakdown } = await pool.query(
    'SELECT match_status, COUNT(*)::int AS count, COALESCE(SUM(ABS(freight_delta)),0)::float AS abs_delta_sum FROM reconciliation_results WHERE run_id = $1 GROUP BY match_status',
    [runId]
  );

  // Sub-breakdown of the LOST bucket by actual status (e.g. "lost" vs "rto_in_transit" vs
  // "rto_out_of_delivery") so it's clear what's actually in there, not just the total count.
  const { rows: lostBreakdown } = await pool.query(
    `SELECT status_api, COUNT(*)::int AS count, COALESCE(SUM(claim_amount),0)::float AS claim_sum
     FROM reconciliation_results WHERE run_id = $1 AND match_status = 'LOST' GROUP BY status_api ORDER BY count DESC`,
    [runId]
  );

  res.json({ success: true, data: { run: rows[0], breakdown, lostBreakdown } });
});

reconcileRouter.get('/runs/:runId/results', requirePermission('canView'), async (req, res) => {
  const runId = Number(req.params.runId);
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = Math.min(200, Math.max(1, Number(req.query.per_page) || 50));
  const offset = (page - 1) * perPage;

  const filters: string[] = ['run_id = $1'];
  const params: unknown[] = [runId];

  if (req.query.match_status) {
    params.push(req.query.match_status);
    filters.push(`match_status = $${params.length}`);
  }
  if (req.query.zone) {
    params.push(req.query.zone);
    filters.push(`zone_calculated = $${params.length}`);
  }
  if (req.query.mode) {
    params.push(req.query.mode);
    filters.push(`mode_used = $${params.length}`);
  }
  if (req.query.search) {
    params.push(`%${req.query.search}%`);
    filters.push(`awb ILIKE $${params.length}`);
  }

  const where = filters.join(' AND ');
  const { rows: countRows } = await pool.query(`SELECT COUNT(*)::int AS total FROM reconciliation_results WHERE ${where}`, params);
  params.push(perPage, offset);
  const { rows } = await pool.query(
    `SELECT * FROM reconciliation_results WHERE ${where} ORDER BY id LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  res.json({ success: true, data: rows, meta: { page, per_page: perPage, total: countRows[0].total, total_pages: Math.ceil(countRows[0].total / perPage) } });
});

reconcileRouter.get('/runs/:runId/export', requirePermission('canView'), async (req, res) => {
  const runId = Number(req.params.runId);
  const filters: string[] = ['run_id = $1'];
  const params: unknown[] = [runId];
  if (req.query.match_status) {
    params.push(req.query.match_status);
    filters.push(`match_status = $${params.length}`);
  }
  if (req.query.zone) {
    params.push(req.query.zone);
    filters.push(`zone_calculated = $${params.length}`);
  }
  if (req.query.mode) {
    params.push(req.query.mode);
    filters.push(`mode_used = $${params.length}`);
  }
  if (req.query.search) {
    params.push(`%${req.query.search}%`);
    filters.push(`awb ILIKE $${params.length}`);
  }
  const { rows } = await pool.query(`SELECT * FROM reconciliation_results WHERE ${filters.join(' AND ')} ORDER BY id`, params);
  if (rows.length === 0) return res.status(404).json({ success: false, error: 'No results match these filters' });

  const headers = Object.keys(rows[0]);
  const csvLines = [headers.join(',')];
  for (const row of rows) {
    csvLines.push(headers.map((h) => csvEscape((row as any)[h])).join(','));
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="reconciliation_run_${runId}.csv"`);
  res.send(csvLines.join('\n'));
});

reconcileRouter.delete('/runs/:runId', requireAdmin, async (req, res) => {
  const runId = Number(req.params.runId);
  const { rowCount } = await pool.query('DELETE FROM reconciliation_runs WHERE id = $1', [runId]);
  if (!rowCount) return res.status(404).json({ success: false, error: 'Run not found.' });
  res.json({ success: true, data: { message: 'Reconciliation run deleted.' } });
});

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
