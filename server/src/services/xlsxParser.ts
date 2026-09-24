import ExcelJS from 'exceljs';
import { MisRow, Mode, ShipmentRecord, Zone } from '../types';

function cellText(v: ExcelJS.CellValue): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object' && 'text' in (v as any)) return String((v as any).text).trim();
  if (typeof v === 'object' && 'result' in (v as any)) return String((v as any).result).trim();
  const s = String(v).trim();
  return s.length ? s : null;
}

function cellNumber(v: ExcelJS.CellValue): number | null {
  const s = cellText(v);
  if (s === null) return null;
  const cleaned = s.replace(/,/g, '').trim();
  if (cleaned === '' || cleaned === '-' || /^-+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function headerMap(headerRow: ExcelJS.Row): Record<string, number> {
  const map: Record<string, number> = {};
  headerRow.eachCell((cell, colNumber) => {
    const key = cellText(cell.value);
    if (key) map[key.toLowerCase()] = colNumber;
  });
  return map;
}

function col(map: Record<string, number>, ...names: string[]): number | undefined {
  for (const n of names) {
    const v = map[n.toLowerCase()];
    if (v) return v;
  }
  return undefined;
}

export async function parseMisWorkbook(buffer: Buffer): Promise<MisRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  const ws = wb.worksheets[0];
  const header = headerMap(ws.getRow(1));

  const c = {
    awb: col(header, 'AWB'),
    merchant: col(header, 'Merchant'),
    masterShipper: col(header, 'Master Shipper'),
    mode: col(header, 'Mode'),
    weight: col(header, 'Weight'),
    zone: col(header, 'Zone'),
    status: col(header, 'Status'),
    payment: col(header, 'Payment'),
    collectableAmount: col(header, 'Collectable Amount'),
    forwardFreight: col(header, 'Forward Freight'),
    rtoFreight: col(header, 'RTO Freight'),
    reverseCharges: col(header, 'Reverse Charges'),
    codCharge: col(header, 'COD Charge'),
    grossFreight: col(header, 'Gross Freight'),
    totalFreight: col(header, 'Total Freight'),
    mid: col(header, 'MID'),
    orderId: col(header, 'Order ID'),
    orderValue: col(header, 'Order Value'),
    skuCode: col(header, 'sku_code'),
    skuCount: col(header, 'sku_count'),
    productQuantityCombined: col(header, 'product_quantity_combined'),
  };

  if (!c.awb) throw new Error('MIS file is missing an "AWB" column');

  const rows: MisRow[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const get = (idx: number | undefined) => (idx ? row.getCell(idx).value : undefined);
    const awb = cellText(get(c.awb));
    if (!awb) return;

    rows.push({
      awb,
      merchant: cellText(get(c.merchant)),
      masterShipper: cellText(get(c.masterShipper)),
      mode: (cellText(get(c.mode))?.toUpperCase() as Mode) || null,
      weight: cellNumber(get(c.weight)),
      zone: (cellText(get(c.zone))?.toUpperCase() as Zone) || null,
      status: cellText(get(c.status)),
      payment: cellText(get(c.payment))?.toUpperCase() || null,
      collectableAmount: cellNumber(get(c.collectableAmount)),
      forwardFreight: cellNumber(get(c.forwardFreight)),
      rtoFreight: cellNumber(get(c.rtoFreight)),
      reverseCharges: cellNumber(get(c.reverseCharges)),
      codCharge: cellNumber(get(c.codCharge)),
      grossFreight: cellNumber(get(c.grossFreight)),
      totalFreight: cellNumber(get(c.totalFreight)),
      mid: cellText(get(c.mid)),
      orderId: cellText(get(c.orderId)),
      orderValue: cellNumber(get(c.orderValue)),
      skuCode: cellText(get(c.skuCode)),
      skuCount: cellNumber(get(c.skuCount)),
      productQuantityCombined: cellText(get(c.productQuantityCombined)),
    });
  });

  return rows;
}

export interface ZoneReferenceRow {
  pickupPincode: string;
  pickupCity: string | null;
  pickupState: string | null;
  deliveryPincode: string;
  deliveryCity: string | null;
  deliveryState: string | null;
  zone: Zone;
}

export async function parseZoneReferenceWorkbook(buffer: Buffer): Promise<ZoneReferenceRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  const ws = wb.worksheets[0];
  const header = headerMap(ws.getRow(1));

  const c = {
    pickupPincode: col(header, 'Pickup Pincode'),
    pickupCity: col(header, 'Pickup City'),
    pickupState: col(header, 'Pickup State'),
    deliveryPincode: col(header, 'Delivery Pincode'),
    deliveryCity: col(header, 'Delivery City'),
    deliveryState: col(header, 'Delivery State'),
    zone: col(header, 'Standard Zone', 'Zone'),
  };

  if (!c.pickupPincode || !c.deliveryPincode || !c.zone) {
    throw new Error('Zone reference file must have Pickup Pincode, Delivery Pincode and Standard Zone columns');
  }

  const rows: ZoneReferenceRow[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const get = (idx: number | undefined) => (idx ? row.getCell(idx).value : undefined);
    const pickupPincode = cellText(get(c.pickupPincode));
    const deliveryPincode = cellText(get(c.deliveryPincode));
    const zone = cellText(get(c.zone))?.toUpperCase();
    if (!pickupPincode || !deliveryPincode || !zone) return;

    rows.push({
      pickupPincode,
      pickupCity: cellText(get(c.pickupCity)),
      pickupState: cellText(get(c.pickupState)),
      deliveryPincode,
      deliveryCity: cellText(get(c.deliveryCity)),
      deliveryState: cellText(get(c.deliveryState)),
      zone: zone as Zone,
    });
  });

  return rows;
}

export interface RateCardFileRow {
  courierName: string;
  mode: string;
  baseWeightSlab: number;
  additionalWeightSlab: number;
  type: string;
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  cod: number;
  codPercent: number;
}

export async function parseRateCardWorkbook(buffer: Buffer): Promise<RateCardFileRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  const ws = wb.worksheets[0];

  // Schedule B has a title row + blank row before the real header; find the header row
  // by scanning for a row containing "Courier Name".
  let headerRowNumber = -1;
  for (let i = 1; i <= Math.min(ws.rowCount, 10); i++) {
    const row = ws.getRow(i);
    let found = false;
    row.eachCell((cell) => {
      if (cellText(cell.value)?.toLowerCase() === 'courier name') found = true;
    });
    if (found) {
      headerRowNumber = i;
      break;
    }
  }
  if (headerRowNumber === -1) throw new Error('Could not find header row (expected a "Courier Name" column)');

  const header = headerMap(ws.getRow(headerRowNumber));
  const c = {
    courierName: col(header, 'Courier Name'),
    mode: col(header, 'Transportation Mode'),
    baseWeightSlab: col(header, 'Base Weight Slab'),
    additionalWeightSlab: col(header, 'Additional Weight Slab'),
    type: col(header, 'Type'),
    a: col(header, 'A'),
    b: col(header, 'B'),
    cCol: col(header, 'C'),
    d: col(header, 'D'),
    e: col(header, 'E'),
    cod: col(header, 'COD'),
    codPercent: col(header, 'COD %'),
  };

  const rows: RateCardFileRow[] = [];
  for (let i = headerRowNumber + 1; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    const get = (idx: number | undefined) => (idx ? row.getCell(idx).value : undefined);
    const courierName = cellText(get(c.courierName));
    const mode = cellText(get(c.mode));
    const type = cellText(get(c.type));
    if (!courierName || !mode || !type) continue;

    const codPercentRaw = cellText(get(c.codPercent));
    const codPercent = codPercentRaw ? parseFloat(codPercentRaw.replace('%', '')) / 100 : 0;

    rows.push({
      courierName,
      mode: mode.toUpperCase(),
      baseWeightSlab: cellNumber(get(c.baseWeightSlab)) ?? 0.5,
      additionalWeightSlab: cellNumber(get(c.additionalWeightSlab)) ?? 0.5,
      type,
      a: cellNumber(get(c.a)) ?? 0,
      b: cellNumber(get(c.b)) ?? 0,
      c: cellNumber(get(c.cCol)) ?? 0,
      d: cellNumber(get(c.d)) ?? 0,
      e: cellNumber(get(c.e)) ?? 0,
      cod: cellNumber(get(c.cod)) ?? 0,
      codPercent,
    });
  }

  return rows;
}

/** Finds the last standalone 6-digit number in a free-text address, e.g. extracts
 * "134102" from "...ghatiwala pinjore, 134102". Indian addresses conventionally end
 * with the PIN code, so the *last* match (not the first) is taken deliberately. */
function extractPincodeFromAddress(address: string | null): string | null {
  if (!address) return null;
  const matches = address.match(/\b\d{6}\b/g);
  return matches && matches.length > 0 ? matches[matches.length - 1] : null;
}

/**
 * Manual alternative to the live Kwikship API sync: a file with the same ground-truth
 * fields the API would provide (status, payment method, pincodes, weight, courier),
 * for use when API credentials aren't available yet. Matches the real Kwikship
 * "shipment report" export format: pickup pincode isn't its own column, it's embedded
 * at the end of a free-text "Pickup Address" field, and Weight is reported in grams.
 *
 * Real exports run to 100k+ rows (tens of MB). ExcelJS's default `workbook.xlsx.load()`
 * builds the whole file as an in-memory object graph, which at that scale burns multiple
 * GB of heap and crashes the process — confirmed against a real 140,003-row/29MB export.
 * This streams the file row-by-row from disk instead (ExcelJS's WorkbookReader), which
 * keeps memory flat regardless of file size (~130-220MB observed on that same file).
 */
export async function* parseShipmentUploadWorkbookStream(filePath: string): AsyncGenerator<ShipmentRecord> {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    entries: 'emit',
    sharedStrings: 'cache',
    styles: 'ignore',
    hyperlinks: 'ignore',
    worksheets: 'emit',
  });

  let c: {
    awb?: number; status?: number; paymentMethod?: number; pickupPincode?: number; pickupAddress?: number;
    destinationPincode?: number; weight?: number; courierName?: number; orderId?: number; totalAmount?: number;
  } | null = null;

  for await (const worksheetReader of reader) {
    for await (const row of worksheetReader) {
      if (row.number === 1) {
        const header = headerMap(row);
        c = {
          awb: col(header, 'AWB'),
          status: col(header, 'Status'),
          paymentMethod: col(header, 'Payment Mode', 'Payment Method', 'Payment'),
          pickupPincode: col(header, 'Pickup Pincode'),
          pickupAddress: col(header, 'Pickup Address'),
          destinationPincode: col(header, 'Pincode', 'Destination Pincode', 'Drop Pincode', 'Delivery Pincode'),
          weight: col(header, 'Weight'),
          courierName: col(header, 'Shipper Name', 'Courier Name', 'Courier'),
          orderId: col(header, 'Order Code', 'Order ID'),
          totalAmount: col(header, 'Total Amount', 'Order Value'),
        };

        if (!c.awb) throw new Error('Shipment data file is missing an "AWB" column');
        if (!c.status) throw new Error('Shipment data file is missing a "Status" column');
        if (!c.paymentMethod) throw new Error('Shipment data file is missing a "Payment Mode" column');
        if (!c.pickupPincode && !c.pickupAddress) {
          throw new Error('Shipment data file needs either a "Pickup Pincode" column or a "Pickup Address" column (pincode extracted from the end of the address text)');
        }
        if (!c.destinationPincode) throw new Error('Shipment data file is missing a "Pincode" (destination) column');
        if (!c.weight) throw new Error('Shipment data file is missing a "Weight" column');
        continue;
      }

      if (!c) continue; // no header row seen yet (shouldn't happen once row 1 is processed)
      const get = (idx: number | undefined) => (idx ? row.getCell(idx).value : undefined);
      const awb = cellText(get(c.awb));
      if (!awb) continue;

      const pickupPincode = c.pickupPincode
        ? cellText(get(c.pickupPincode))
        : extractPincodeFromAddress(cellText(get(c.pickupAddress)));

      // Real export always reports Weight in grams, with no exceptions — verified against
      // real product data: rows with a small raw value (1, 2, 3, 10...) are NOT already-kg
      // heavy items, they're single/multi-pack roll-on/cream SKUs (e.g. raw=2 is a genuine
      // "Pack of 2" roll-on at ~609 order value, not a 2kg parcel). An earlier magnitude-based
      // heuristic (">20 assume grams, else assume already kg") produced false-positive
      // underbilling flags on these rows. Always convert.
      const rawWeight = cellNumber(get(c.weight));
      const weight = rawWeight !== null ? rawWeight / 1000 : null;

      yield {
        awb,
        orderId: cellText(get(c.orderId)),
        status: cellText(get(c.status)),
        paymentMode: cellText(get(c.paymentMethod))?.toUpperCase() ?? null,
        courierName: cellText(get(c.courierName)),
        weight,
        totalAmount: cellNumber(get(c.totalAmount)),
        pickupPincode,
        destinationPincode: cellText(get(c.destinationPincode)),
        customerName: null,
        customerPhone: null,
        creationDatetime: null,
        estimatedDeliveryDate: null,
      };
    }
  }
}
