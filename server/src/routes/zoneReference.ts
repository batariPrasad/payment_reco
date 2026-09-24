import { Router } from 'express';
import multer from 'multer';
import { pool } from '../config/db';
import { parseZoneReferenceWorkbook } from '../services/xlsxParser';
import { authMiddleware, requirePermission } from '../middleware/auth';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
export const zoneReferenceRouter = Router();
zoneReferenceRouter.use(authMiddleware);

const VALID_HUBS = ['bangalore', 'pinjore'];

// Uploading a hub's file replaces its existing zone map entirely.
zoneReferenceRouter.post('/:hub', requirePermission('canUpload'), upload.single('file'), async (req, res) => {
  const hub = req.params.hub;
  if (!VALID_HUBS.includes(hub)) {
    return res.status(400).json({ success: false, error: `Unknown hub "${hub}". Expected one of: ${VALID_HUBS.join(', ')}` });
  }
  if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded (field name: file)' });

  let rows;
  try {
    rows = await parseZoneReferenceWorkbook(req.file.buffer);
  } catch (err) {
    return res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Failed to parse file' });
  }
  if (rows.length === 0) return res.status(400).json({ success: false, error: 'No data rows found in file' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM zone_reference WHERE pickup_hub = $1', [hub]);
    for (const r of rows) {
      await client.query(
        `INSERT INTO zone_reference (pickup_hub, pickup_pincode, pickup_city, pickup_state, delivery_pincode, delivery_city, delivery_state, zone, source_file)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (pickup_hub, delivery_pincode) DO UPDATE SET zone = EXCLUDED.zone, source_file = EXCLUDED.source_file, uploaded_at = now()`,
        [hub, r.pickupPincode, r.pickupCity, r.pickupState, r.deliveryPincode, r.deliveryCity, r.deliveryState, r.zone, req.file.originalname]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: { hub, rowCount: rows.length } });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Upload failed' });
  } finally {
    client.release();
  }
});

zoneReferenceRouter.get('/', requirePermission('canView'), async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT pickup_hub, COUNT(*) AS row_count, MAX(uploaded_at) AS uploaded_at, MAX(source_file) AS source_file
     FROM zone_reference GROUP BY pickup_hub`
  );
  res.json({ success: true, data: rows });
});
