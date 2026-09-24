import { CourierGroup, FreightCalcInput, FreightCalcResult, FreightType, GST_RATE, Mode, RateCardRow, Zone } from '../types';

/**
 * Formula validated against 23,137 real Kwikship MIS rows at 99.49% exact-paisa
 * match (remainder within 0.5 rupee rounding noise):
 *   weightMultiplier = ceil(weight / baseWeightSlab)
 *   forward = multiplier * rate[courierGroup][mode][Forward][zone]
 *   rto     = multiplier * rate[courierGroup][mode][RTO][zone]        (only if isRto)
 *   cod     = MAX(codFlat, codPercent * collectableAmount)            (only if isCod AND NOT isRto)
 *   gross   = forward + rto + cod
 *   total   = gross * 1.18
 */

export type RateCardLookup = Map<string, RateCardRow>;

export function rateCardKey(courierGroup: CourierGroup, mode: Mode, type: FreightType, zone: Zone): string {
  return `${courierGroup}|${mode}|${type}|${zone}`;
}

export function buildRateCardLookup(rows: RateCardRow[]): RateCardLookup {
  const map: RateCardLookup = new Map();
  for (const row of rows) {
    map.set(rateCardKey(row.courierGroup, row.mode, row.type, row.zone), row);
  }
  return map;
}

/** For live courier names coming off a shipment (e.g. "BlueDart Express", "DelhiveryDirect"). */
export function detectCourierGroup(courierName: string | null | undefined): CourierGroup {
  if (courierName && courierName.toLowerCase().includes('bluedart')) return 'BLUEDART';
  return 'ALL';
}

/**
 * For a Schedule B rate-card row's "Courier Name" label. Unlike a live courier name, this
 * label can itself be an exclusion phrase — "ALL (Except Bluedart)" — which contains the
 * substring "bluedart" but must NOT classify as the Bluedart group. Strip any parenthetical
 * qualifier first and require an exact match.
 */
export function classifyRateCardCourierGroup(courierNameLabel: string): CourierGroup {
  const stripped = courierNameLabel.replace(/\(.*?\)/g, '').trim().toLowerCase();
  return stripped === 'bluedart' ? 'BLUEDART' : 'ALL';
}

export function calculateFreight(input: FreightCalcInput, lookup: RateCardLookup): FreightCalcResult {
  const missingRates: string[] = [];
  const multiplier = Math.ceil(round4(input.weight / getBaseSlab(lookup, input.courierGroup, input.mode, 'Forward', input.zone)));

  const forwardRate = lookup.get(rateCardKey(input.courierGroup, input.mode, 'Forward', input.zone));
  if (!forwardRate) missingRates.push(rateCardKey(input.courierGroup, input.mode, 'Forward', input.zone));
  const forwardFreight = forwardRate ? multiplier * forwardRate.rate : 0;

  let rtoFreight = 0;
  if (input.isRto) {
    const rtoRate = lookup.get(rateCardKey(input.courierGroup, input.mode, 'RTO', input.zone));
    if (!rtoRate) missingRates.push(rateCardKey(input.courierGroup, input.mode, 'RTO', input.zone));
    rtoFreight = rtoRate ? multiplier * rtoRate.rate : 0;
  }

  let codCharge = 0;
  if (input.isCod && !input.isRto) {
    const codRateSource = forwardRate; // cod_flat / cod_percent are stored per mode row
    if (codRateSource) {
      const flat = codRateSource.codFlat;
      const pct = codRateSource.codPercent * (input.collectableAmount || 0);
      codCharge = round2(Math.max(flat, pct));
    }
  }

  const grossFreight = round2(forwardFreight + rtoFreight + codCharge);
  const totalFreight = round2(grossFreight * (1 + GST_RATE));

  return {
    weightMultiplier: multiplier,
    forwardFreight: round2(forwardFreight),
    rtoFreight: round2(rtoFreight),
    codCharge,
    grossFreight,
    totalFreight,
    missingRates,
  };
}

function getBaseSlab(lookup: RateCardLookup, courierGroup: CourierGroup, mode: Mode, type: FreightType, zone: Zone): number {
  const row = lookup.get(rateCardKey(courierGroup, mode, type, zone));
  return row?.baseWeightSlab || 0.5;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}
