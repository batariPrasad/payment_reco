import { Router } from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pool } from '../config/db';
import { parseShipmentUploadWorkbookStream } from '../services/xlsxParser';
import { upsertShipmentsBatch } from '../services/shipmentsRepo';
import { ShipmentRecord } from '../types';
import { authMiddleware, requirePermission } from '../middleware/auth';

// Disk storage (not memoryStorage): real exports run 100k+ rows / tens of MB, and we stream-parse
// from a file path rather than holding the whole upload in RAM twice (raw buffer + parsed object graph).
const upload = multer({
  storage: multer.diskStorage({ destination: os.tmpdir() }),
  limits: { fileSize: 200 * 1024 * 1024 },
});
export const shipmentUploadRouter = Router();
shipmentUploadRouter.use(authMiddleware);

// Mirrors the real Kwikship "shipment report" export's column names, so a file downloaded
// straight from the Kwikship dashboard needs no reshaping before upload here.
shipmentUploadRouter.get('/template', async (_req, res) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Shipment Data');
  ws.columns = [
    { header: 'AWB', key: 'awb', width: 20 },
    { header: 'Order Code', key: 'orderCode', width: 16 },
    { header: 'Shipper Name', key: 'shipperName', width: 24 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Weight', key: 'weight', width: 10 },
    { header: 'Payment Mode', key: 'paymentMode', width: 14 },
    { header: 'Total Amount', key: 'totalAmount', width: 14 },
    { header: 'City', key: 'city', width: 16 },
    { header: 'State', key: 'state', width: 16 },
    { header: 'Pincode', key: 'pincode', width: 12 },
    { header: 'Pickup Address', key: 'pickupAddress', width: 50 },
  ];
  ws.addRow({
    awb: '49582200000000',
    orderCode: '#2026786979',
    shipperName: 'DelhiverySurface500gm-Brand',
    status: 'delivered',
    weight: 100,
    paymentMode: 'COD',
    totalAmount: 457,
    city: 'bhiwani',
    state: 'haryana',
    pincode: 127042,
    pickupAddress: 'hari chaitanya consumers pvt ltd 217 bitna road baba badbhag singh ji gurudwara, ghatiwala pinjore, 134102',
  });
  ws.getRow(1).font = { bold: true };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="shipment_data_template.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

// Manual alternative to "Sync from Kwikship" for when API credentials aren't set up yet.
// Upserts into the same `shipments` table the API sync writes to, tagged source='upload'.
// Streams the file from disk and writes in batches so 100k+ row exports don't OOM the process.
shipmentUploadRouter.post('/', requirePermission('canUpload'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded (field name: file)' });
  const filePath = req.file.path;

  try {
    let rowsInFile = 0;
    let upserted = 0;
    let buffer: ShipmentRecord[] = [];
    const FLUSH_SIZE = 2000;

    const flush = async () => {
      if (buffer.length === 0) return;
      await upsertShipmentsBatch(buffer, 'upload');
      upserted += buffer.length;
      buffer = [];
    };

    for await (const record of parseShipmentUploadWorkbookStream(filePath)) {
      rowsInFile += 1;
      buffer.push(record);
      if (buffer.length >= FLUSH_SIZE) await flush();
    }
    await flush();

    if (rowsInFile === 0) return res.status(400).json({ success: false, error: 'No data rows found in file' });
    res.status(201).json({ success: true, data: { rowsInFile, upserted } });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Failed to parse file' });
  } finally {
    fs.unlink(filePath, () => {});
  }
});

shipmentUploadRouter.get('/', requirePermission('canView'), async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT source, COUNT(*)::int AS count, MAX(synced_at) AS last_updated
     FROM shipments GROUP BY source`
  );
  res.json({ success: true, data: rows });
});
