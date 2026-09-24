import { pool } from '../config/db';
import { CourierGroup, Mode, MisRow, Zone } from '../types';
import { buildRateCardLookup, calculateFreight, detectCourierGroup } from './rateCalculator';
import { loadZoneLookup, resolveZone } from './zoneLookup';
import { isLostOrExceptionStatus, isRtoLikeStatus, isStatusMatch } from './statusGroups';

const FREIGHT_TOLERANCE = 1.0; // rupees

interface ShipmentDbRow {
  awb: string;
  order_id: string | null;
  status: string | null;
  payment_mode: string | null;
  courier_name: string | null;
  weight: string | null;
  pickup_pincode: string | null;
  destination_pincode: string | null;
  source: string;
}

interface RateCardDbRow {
  courier_group: CourierGroup;
  mode: Mode;
  type: 'Forward' | 'RTO';
  zone: Zone;
  base_weight_slab: string;
  additional_weight_slab: string;
  rate: string;
  cod_flat: string;
  cod_percent: string;
}

export async function runReconciliation(misUploadId: number): Promise<{ runId: number }> {
  const { rows: misRowsRaw } = await pool.query('SELECT * FROM mis_rows WHERE mis_upload_id = $1', [misUploadId]);
  const misRows: MisRow[] = misRowsRaw.map(mapMisRowDb);

  const awbs = misRows.map((r) => r.awb);
  const { rows: shipmentRows } = await pool.query<ShipmentDbRow>(
    'SELECT awb, order_id, status, payment_mode, courier_name, weight, pickup_pincode, destination_pincode, source FROM shipments WHERE awb = ANY($1)',
    [awbs]
  );
  const shipmentsByAwb = new Map(shipmentRows.map((s) => [s.awb, s]));

  const { rows: rateCardRows } = await pool.query<RateCardDbRow>(
    'SELECT courier_group, mode, type, zone, base_weight_slab, additional_weight_slab, rate, cod_flat, cod_percent FROM rate_cards WHERE is_active'
  );
  const rateLookup = buildRateCardLookup(
    rateCardRows.map((r) => ({
      courierGroup: r.courier_group,
      mode: r.mode,
      type: r.type,
      zone: r.zone,
      baseWeightSlab: Number(r.base_weight_slab),
      additionalWeightSlab: Number(r.additional_weight_slab),
      rate: Number(r.rate),
      codFlat: Number(r.cod_flat),
      codPercent: Number(r.cod_percent),
    }))
  );

  const zoneLookup = await loadZoneLookup();

  const { rows: runRows } = await pool.query<{ id: number }>(
    'INSERT INTO reconciliation_runs (mis_upload_id) VALUES ($1) RETURNING id',
    [misUploadId]
  );
  const runId = runRows[0].id;

  let matched = 0;
  let mismatched = 0;
  let noApiData = 0;
  let lost = 0;
  let totalDiscrepancy = 0;
  let totalClaimable = 0;
  // freightDelta = calculated - MIS. Positive => Kwikship billed less than correct (undercharge,
  // you technically owe more). Negative => Kwikship billed more than correct (overcharge, they owe you).
  let overchargedAmount = 0;
  let overchargedCount = 0;
  let underchargedAmount = 0;
  let underchargedCount = 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const mis of misRows) {
      const shipment = shipmentsByAwb.get(mis.awb);

      if (!shipment) {
        noApiData += 1;
        await insertResult(client, runId, mis, {
          matchStatus: 'NO_API_DATA',
          notes: 'AWB not found in synced Kwikship shipments. Run a sync covering this AWB\'s date range.',
        });
        continue;
      }

      const paymentApi = shipment.payment_mode?.toUpperCase() ?? null;
      const paymentMis = mis.payment?.toUpperCase() ?? null;
      const paymentMismatch = !!paymentApi && !!paymentMis && paymentApi !== paymentMis;

      const statusMismatch = !isStatusMatch(mis.status, shipment.status);

      const zoneResult = resolveZone(zoneLookup, shipment.pickup_pincode, shipment.destination_pincode);
      if (!zoneResult.zone) {
        await insertResult(client, runId, mis, {
          matchStatus: 'ZONE_NOT_FOUND',
          notes: zoneResult.reason,
          pickupPincodeApi: shipment.pickup_pincode,
          destinationPincodeApi: shipment.destination_pincode,
          pickupHub: zoneResult.pickupHub,
          statusApi: shipment.status,
          statusMis: mis.status,
          statusMismatch,
          paymentApi,
          paymentMis,
          paymentMismatch,
          shipmentSource: shipment.source,
        });
        mismatched += 1;
        continue;
      }

      const zoneMismatch = !!mis.zone && mis.zone !== zoneResult.zone;

      const weightApi = shipment.weight !== null ? Number(shipment.weight) : null;
      // MIS's Weight is the billed slab weight (always a clean 0.5kg multiple); the shipment
      // data's Weight can be the literal actual item weight (e.g. 0.2kg for a small bottle),
      // which will almost never equal the slab value even when billing is entirely correct.
      // What actually matters for freight is which 0.5kg slab each rounds up to — compare that,
      // not the raw kg values, or this flags nearly every row as a false positive.
      const weightMismatch =
        weightApi !== null && mis.weight !== null && Math.ceil(weightApi / 0.5) !== Math.ceil(mis.weight / 0.5);

      if (isLostOrExceptionStatus(shipment.status)) {
        const claimAmount = mis.orderValue;
        lost += 1;
        mismatched += 1;
        if (claimAmount) totalClaimable += claimAmount;
        await insertResult(client, runId, mis, {
          matchStatus: 'LOST',
          notes: `Shipment status is "${shipment.status}" — not a clean delivered/RTO outcome, so freight was not calculated. Claim the order value (₹${claimAmount ?? '0'}) back from the courier.`,
          paymentApi,
          paymentMis,
          paymentMismatch,
          statusApi: shipment.status,
          statusMis: mis.status,
          statusMismatch,
          pickupPincodeApi: shipment.pickup_pincode,
          destinationPincodeApi: shipment.destination_pincode,
          pickupHub: zoneResult.pickupHub,
          zoneCalculated: zoneResult.zone,
          zoneMismatch,
          weightApi,
          weightMismatch,
          courierNameApi: shipment.courier_name,
          shipmentSource: shipment.source,
          claimAmount,
        });
        continue;
      }

      const mode = mis.mode; // API exposes no transport mode; MIS declaration is the only source.
      if (!mode) {
        await insertResult(client, runId, mis, {
          matchStatus: 'RATE_NOT_FOUND',
          notes: 'MIS row has no Mode value; cannot look up a rate.',
          pickupPincodeApi: shipment.pickup_pincode,
          destinationPincodeApi: shipment.destination_pincode,
          pickupHub: zoneResult.pickupHub,
          zoneCalculated: zoneResult.zone,
          zoneMismatch,
          weightApi,
          weightMismatch,
          statusApi: shipment.status,
          statusMis: mis.status,
          statusMismatch,
          paymentApi,
          paymentMis,
          paymentMismatch,
          shipmentSource: shipment.source,
        });
        mismatched += 1;
        continue;
      }

      const courierGroup = detectCourierGroup(shipment.courier_name);
      const isRto = isRtoLikeStatus(shipment.status);
      const isCod = paymentApi === 'COD';
      const weightForCalc = weightApi ?? mis.weight ?? 0;

      const calc = calculateFreight(
        {
          courierGroup,
          mode,
          zone: zoneResult.zone,
          weight: weightForCalc,
          isRto,
          isCod,
          collectableAmount: mis.collectableAmount ?? 0,
        },
        rateLookup
      );

      if (calc.missingRates.length > 0) {
        await insertResult(client, runId, mis, {
          matchStatus: 'RATE_NOT_FOUND',
          notes: `No active rate card entry for: ${calc.missingRates.join(', ')}`,
          pickupPincodeApi: shipment.pickup_pincode,
          destinationPincodeApi: shipment.destination_pincode,
          pickupHub: zoneResult.pickupHub,
          zoneCalculated: zoneResult.zone,
          zoneMismatch,
          weightApi,
          weightMismatch,
          modeUsed: mode,
          courierNameApi: shipment.courier_name,
          courierGroup,
          statusApi: shipment.status,
          statusMis: mis.status,
          statusMismatch,
          paymentApi,
          paymentMis,
          paymentMismatch,
          shipmentSource: shipment.source,
        });
        mismatched += 1;
        continue;
      }

      const freightDelta = round2(calc.totalFreight - (mis.totalFreight ?? 0));
      const freightMismatch = Math.abs(freightDelta) > FREIGHT_TOLERANCE;

      let matchStatus: string;
      if (paymentMismatch) matchStatus = 'PAYMENT_MISMATCH';
      else if (statusMismatch) matchStatus = 'STATUS_MISMATCH';
      else if (zoneMismatch) matchStatus = 'ZONE_MISMATCH';
      else if (weightMismatch) matchStatus = 'WEIGHT_MISMATCH';
      else if (freightMismatch) matchStatus = 'FREIGHT_MISMATCH';
      else matchStatus = 'MATCHED';

      if (matchStatus === 'MATCHED') matched += 1;
      else mismatched += 1;
      totalDiscrepancy += Math.abs(freightDelta);
      if (freightDelta < -FREIGHT_TOLERANCE) {
        overchargedAmount += Math.abs(freightDelta); // Kwikship billed more than correct -> owed back to merchant
        overchargedCount += 1;
      } else if (freightDelta > FREIGHT_TOLERANCE) {
        underchargedAmount += freightDelta; // Kwikship billed less than correct
        underchargedCount += 1;
      }

      await insertResult(client, runId, mis, {
        matchStatus,
        paymentApi,
        paymentMis,
        paymentMismatch,
        statusApi: shipment.status,
        statusMis: mis.status,
        statusMismatch,
        pickupPincodeApi: shipment.pickup_pincode,
        destinationPincodeApi: shipment.destination_pincode,
        pickupHub: zoneResult.pickupHub,
        zoneCalculated: zoneResult.zone,
        zoneMismatch,
        weightApi,
        weightMismatch,
        modeUsed: mode,
        courierNameApi: shipment.courier_name,
        courierGroup,
        forwardFreightCalc: calc.forwardFreight,
        rtoFreightCalc: calc.rtoFreight,
        codChargeCalc: calc.codCharge,
        grossFreightCalc: calc.grossFreight,
        totalFreightCalc: calc.totalFreight,
        freightDelta,
        shipmentSource: shipment.source,
      });
    }

    await client.query(
      `UPDATE reconciliation_runs SET
         total_rows=$1, matched_count=$2, mismatch_count=$3, no_api_data_count=$4, total_discrepancy=$5,
         lost_count=$6, total_claimable=$7,
         overcharged_amount=$8, overcharged_count=$9, undercharged_amount=$10, undercharged_count=$11
       WHERE id=$12`,
      [
        misRows.length, matched, mismatched, noApiData, round2(totalDiscrepancy),
        lost, round2(totalClaimable),
        round2(overchargedAmount), overchargedCount, round2(underchargedAmount), underchargedCount,
        runId,
      ]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return { runId };
}

function mapMisRowDb(r: any): MisRow {
  return {
    id: r.id,
    misUploadId: r.mis_upload_id,
    awb: r.awb,
    merchant: r.merchant,
    masterShipper: r.master_shipper,
    mode: r.mode,
    weight: r.weight !== null ? Number(r.weight) : null,
    zone: r.zone,
    status: r.status,
    payment: r.payment,
    collectableAmount: r.collectable_amount !== null ? Number(r.collectable_amount) : null,
    forwardFreight: r.forward_freight !== null ? Number(r.forward_freight) : null,
    rtoFreight: r.rto_freight !== null ? Number(r.rto_freight) : null,
    reverseCharges: r.reverse_charges !== null ? Number(r.reverse_charges) : null,
    codCharge: r.cod_charge !== null ? Number(r.cod_charge) : null,
    grossFreight: r.gross_freight !== null ? Number(r.gross_freight) : null,
    totalFreight: r.total_freight !== null ? Number(r.total_freight) : null,
    mid: r.mid,
    orderId: r.order_id,
    orderValue: r.order_value !== null ? Number(r.order_value) : null,
    skuCode: r.sku_code,
    skuCount: r.sku_count !== null ? Number(r.sku_count) : null,
    productQuantityCombined: r.product_quantity_combined,
  };
}

interface InsertResultFields {
  matchStatus: string;
  notes?: string | null;
  paymentApi?: string | null;
  paymentMis?: string | null;
  paymentMismatch?: boolean;
  statusApi?: string | null;
  statusMis?: string | null;
  statusMismatch?: boolean;
  pickupPincodeApi?: string | null;
  destinationPincodeApi?: string | null;
  pickupHub?: string | null;
  zoneCalculated?: string | null;
  zoneMismatch?: boolean;
  weightApi?: number | null;
  weightMismatch?: boolean;
  modeUsed?: string | null;
  courierNameApi?: string | null;
  courierGroup?: string | null;
  forwardFreightCalc?: number | null;
  rtoFreightCalc?: number | null;
  codChargeCalc?: number | null;
  grossFreightCalc?: number | null;
  totalFreightCalc?: number | null;
  freightDelta?: number | null;
  shipmentSource?: string | null;
  claimAmount?: number | null;
}

async function insertResult(client: any, runId: number, mis: MisRow, f: InsertResultFields) {
  await client.query(
    `INSERT INTO reconciliation_results (
      run_id, mis_row_id, awb,
      payment_mis, payment_api, payment_mismatch,
      status_mis, status_api, status_mismatch,
      pickup_pincode_api, destination_pincode_api, pickup_hub, zone_mis, zone_calculated, zone_mismatch,
      weight_mis, weight_api, weight_mismatch,
      mode_used, courier_name_api, courier_group,
      forward_freight_calc, rto_freight_calc, cod_charge_calc, gross_freight_calc, total_freight_calc,
      forward_freight_mis, rto_freight_mis, cod_charge_mis, gross_freight_mis, total_freight_mis,
      freight_delta, match_status, notes, shipment_source, claim_amount
    ) VALUES (
      $1,$2,$3, $4,$5,$6, $7,$8,$9, $10,$11,$12,$13,$14,$15, $16,$17,$18, $19,$20,$21,
      $22,$23,$24,$25,$26, $27,$28,$29,$30,$31, $32,$33,$34,$35,$36
    )`,
    [
      runId,
      mis.id ?? null,
      mis.awb,
      f.paymentMis ?? mis.payment,
      f.paymentApi ?? null,
      f.paymentMismatch ?? false,
      f.statusMis ?? mis.status,
      f.statusApi ?? null,
      f.statusMismatch ?? false,
      f.pickupPincodeApi ?? null,
      f.destinationPincodeApi ?? null,
      f.pickupHub ?? null,
      mis.zone,
      f.zoneCalculated ?? null,
      f.zoneMismatch ?? false,
      mis.weight,
      f.weightApi ?? null,
      f.weightMismatch ?? false,
      f.modeUsed ?? mis.mode,
      f.courierNameApi ?? null,
      f.courierGroup ?? null,
      f.forwardFreightCalc ?? null,
      f.rtoFreightCalc ?? null,
      f.codChargeCalc ?? null,
      f.grossFreightCalc ?? null,
      f.totalFreightCalc ?? null,
      mis.forwardFreight,
      mis.rtoFreight,
      mis.codCharge,
      mis.grossFreight,
      mis.totalFreight,
      f.freightDelta ?? null,
      f.matchStatus,
      f.notes ?? null,
      f.shipmentSource ?? null,
      f.claimAmount ?? null,
    ]
  );
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
