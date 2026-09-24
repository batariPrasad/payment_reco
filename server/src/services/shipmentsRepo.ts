import { pool } from '../config/db';
import { ShipmentRecord } from '../types';

export async function upsertShipment(s: ShipmentRecord, source: 'api' | 'upload') {
  await pool.query(
    `INSERT INTO shipments (
       awb, order_id, status, payment_mode, courier_name, weight, total_amount,
       pickup_pincode, destination_pincode, customer_name, customer_phone,
       creation_datetime, estimated_delivery_date, raw_json, source, synced_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now())
     ON CONFLICT (awb) DO UPDATE SET
       order_id = EXCLUDED.order_id,
       status = EXCLUDED.status,
       payment_mode = EXCLUDED.payment_mode,
       courier_name = EXCLUDED.courier_name,
       weight = EXCLUDED.weight,
       total_amount = EXCLUDED.total_amount,
       pickup_pincode = EXCLUDED.pickup_pincode,
       destination_pincode = EXCLUDED.destination_pincode,
       customer_name = EXCLUDED.customer_name,
       customer_phone = EXCLUDED.customer_phone,
       creation_datetime = EXCLUDED.creation_datetime,
       estimated_delivery_date = EXCLUDED.estimated_delivery_date,
       raw_json = EXCLUDED.raw_json,
       source = EXCLUDED.source,
       synced_at = now()`,
    [
      s.awb,
      s.orderId,
      s.status,
      s.paymentMode,
      s.courierName,
      s.weight,
      s.totalAmount,
      s.pickupPincode,
      s.destinationPincode,
      s.customerName,
      s.customerPhone,
      s.creationDatetime,
      s.estimatedDeliveryDate,
      s.rawJson ? JSON.stringify(s.rawJson) : null,
      source,
    ]
  );
}

const COLS_PER_ROW = 15;
const BATCH_SIZE = 500; // 500 * 15 = 7500 bind params, comfortably under Postgres's 65535 limit

/** Upserts many shipments in chunked multi-row statements instead of one query per row —
 * for a 140k-row file that's ~280 round trips instead of 140,000. */
export async function upsertShipmentsBatch(records: ShipmentRecord[], source: 'api' | 'upload') {
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    // A single multi-row `INSERT ... ON CONFLICT` errors if it targets the same conflict
    // key twice in one statement — real export files can repeat an AWB across rows, so
    // dedupe within the batch first (last occurrence wins, same as sequential upserts would).
    const chunk = [...new Map(records.slice(i, i + BATCH_SIZE).map((r) => [r.awb, r])).values()];
    const values: unknown[] = [];
    const placeholders = chunk
      .map((s, idx) => {
        const base = idx * COLS_PER_ROW;
        values.push(
          s.awb, s.orderId, s.status, s.paymentMode, s.courierName, s.weight, s.totalAmount,
          s.pickupPincode, s.destinationPincode, s.customerName, s.customerPhone,
          s.creationDatetime, s.estimatedDeliveryDate, s.rawJson ? JSON.stringify(s.rawJson) : null, source
        );
        const ph = Array.from({ length: COLS_PER_ROW }, (_, j) => `$${base + j + 1}`).join(',');
        return `(${ph})`;
      })
      .join(',');

    await pool.query(
      `INSERT INTO shipments (
         awb, order_id, status, payment_mode, courier_name, weight, total_amount,
         pickup_pincode, destination_pincode, customer_name, customer_phone,
         creation_datetime, estimated_delivery_date, raw_json, source
       ) VALUES ${placeholders}
       ON CONFLICT (awb) DO UPDATE SET
         order_id = EXCLUDED.order_id,
         status = EXCLUDED.status,
         payment_mode = EXCLUDED.payment_mode,
         courier_name = EXCLUDED.courier_name,
         weight = EXCLUDED.weight,
         total_amount = EXCLUDED.total_amount,
         pickup_pincode = EXCLUDED.pickup_pincode,
         destination_pincode = EXCLUDED.destination_pincode,
         customer_name = EXCLUDED.customer_name,
         customer_phone = EXCLUDED.customer_phone,
         creation_datetime = EXCLUDED.creation_datetime,
         estimated_delivery_date = EXCLUDED.estimated_delivery_date,
         raw_json = EXCLUDED.raw_json,
         source = EXCLUDED.source,
         synced_at = now()`,
      values
    );
  }
}
