import { Router } from 'express';
import multer from 'multer';
import { pool } from '../config/db';
import { parseMisWorkbook } from '../services/xlsxParser';
import { authMiddleware, requirePermission } from '../middleware/auth';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
export const misUploadsRouter = Router();
misUploadsRouter.use(authMiddleware);

misUploadsRouter.post('/', requirePermission('canUpload'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded (field name: file)' });

  let rows;
  try {
    rows = await parseMisWorkbook(req.file.buffer);
  } catch (err) {
    return res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Failed to parse file' });
  }
  if (rows.length === 0) return res.status(400).json({ success: false, error: 'No data rows found in file' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: uploadRows } = await client.query<{ id: number }>(
      'INSERT INTO mis_uploads (filename, row_count) VALUES ($1, $2) RETURNING id',
      [req.file.originalname, rows.length]
    );
    const misUploadId = uploadRows[0].id;

    for (const r of rows) {
      await client.query(
        `INSERT INTO mis_rows (
          mis_upload_id, awb, merchant, master_shipper, mode, weight, zone, status, payment,
          collectable_amount, forward_freight, rto_freight, reverse_charges, cod_charge,
          gross_freight, total_freight, mid, order_id, order_value, sku_code, sku_count, product_quantity_combined
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
        [
          misUploadId, r.awb, r.merchant, r.masterShipper, r.mode, r.weight, r.zone, r.status, r.payment,
          r.collectableAmount, r.forwardFreight, r.rtoFreight, r.reverseCharges, r.codCharge,
          r.grossFreight, r.totalFreight, r.mid, r.orderId, r.orderValue, r.skuCode, r.skuCount, r.productQuantityCombined,
        ]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: { misUploadId, rowCount: rows.length, filename: req.file.originalname } });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Upload failed' });
  } finally {
    client.release();
  }
});

misUploadsRouter.get('/', requirePermission('canView'), async (_req, res) => {
  const { rows } = await pool.query('SELECT id, filename, row_count, uploaded_at FROM mis_uploads ORDER BY uploaded_at DESC');
  res.json({ success: true, data: rows });
});
