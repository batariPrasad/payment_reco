import { Router } from 'express';
import multer from 'multer';
import { pool } from '../config/db';
import { parseRateCardWorkbook, RateCardFileRow } from '../services/xlsxParser';
import { Zone } from '../types';
import { classifyRateCardCourierGroup } from '../services/rateCalculator';
import { authMiddleware, requirePermission } from '../middleware/auth';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
export const rateCardsRouter = Router();
rateCardsRouter.use(authMiddleware);

// Uploading a new Schedule B deactivates the previous version and activates this one.
rateCardsRouter.post('/', requirePermission('canUpload'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded (field name: file)' });

  let fileRows;
  try {
    fileRows = await parseRateCardWorkbook(req.file.buffer);
  } catch (err) {
    return res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Failed to parse file' });
  }
  if (fileRows.length === 0) return res.status(400).json({ success: false, error: 'No data rows found in file' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE rate_cards SET is_active = false WHERE is_active');

    let insertedCount = 0;
    const zones: Array<[Zone, keyof RateCardFileRow]> = [
      ['A', 'a'], ['B', 'b'], ['C', 'c'], ['D', 'd'], ['E', 'e'],
    ];
    for (const fr of fileRows) {
      const courierGroup = classifyRateCardCourierGroup(fr.courierName);
      const type = fr.type === 'RTO' ? 'RTO' : 'Forward';
      for (const [zone, key] of zones) {
        const rate = fr[key] as number;
        await client.query(
          `INSERT INTO rate_cards (courier_group, mode, type, zone, base_weight_slab, additional_weight_slab, rate, cod_flat, cod_percent, source_file, is_active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)`,
          [courierGroup, fr.mode, type, zone, fr.baseWeightSlab, fr.additionalWeightSlab, rate, fr.cod, fr.codPercent, req.file.originalname]
        );
        insertedCount += 1;
      }
    }
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: { rowsInFile: fileRows.length, rateEntriesCreated: insertedCount } });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Upload failed' });
  } finally {
    client.release();
  }
});

rateCardsRouter.get('/', requirePermission('canView'), async (req, res) => {
  const activeOnly = req.query.active !== 'false';
  const { rows } = await pool.query(
    `SELECT * FROM rate_cards ${activeOnly ? 'WHERE is_active' : ''} ORDER BY courier_group, mode, type, zone`
  );
  res.json({ success: true, data: rows });
});
