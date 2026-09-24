/**
 * Standalone sanity check: re-parses the real MIS file and Schedule B rate card
 * directly from disk (no DB needed) and verifies the shipped rateCalculator
 * reproduces Kwikship's actual Total Freight numbers.
 *
 * Usage: npm run validate:formula -- "D:\payment_reco\Pokonut_AWB_July2026 (6).xlsx" "D:\payment_reco\Schedule_B_Commercials_Pricing.xlsx"
 */
import fs from 'node:fs';
import { parseMisWorkbook, parseRateCardWorkbook, RateCardFileRow } from '../src/services/xlsxParser';
import { buildRateCardLookup, calculateFreight, detectCourierGroup, classifyRateCardCourierGroup } from '../src/services/rateCalculator';
import { CourierGroup, Mode, Zone } from '../src/types';
import { normalizeMisStatus } from '../src/services/statusGroups';

async function main() {
  const misPath = process.argv[2];
  const rateCardPath = process.argv[3];
  if (!misPath || !rateCardPath) {
    console.error('Usage: validateFormula.ts <mis-file.xlsx> <schedule-b.xlsx>');
    process.exit(1);
  }

  const misRows = await parseMisWorkbook(fs.readFileSync(misPath));
  const fileRows = await parseRateCardWorkbook(fs.readFileSync(rateCardPath));

  const zoneKeys: Array<[Zone, keyof RateCardFileRow]> = [
    ['A', 'a'], ['B', 'b'], ['C', 'c'], ['D', 'd'], ['E', 'e'],
  ];
  const rateRows = fileRows.flatMap((fr) => {
    const courierGroup: CourierGroup = classifyRateCardCourierGroup(fr.courierName);
    const type = fr.type === 'RTO' ? 'RTO' as const : 'Forward' as const;
    return zoneKeys.map(([zone, key]) => ({
      courierGroup,
      mode: fr.mode as Mode,
      type,
      zone,
      baseWeightSlab: fr.baseWeightSlab,
      additionalWeightSlab: fr.additionalWeightSlab,
      rate: fr[key] as number,
      codFlat: fr.cod,
      codPercent: fr.codPercent,
    }));
  });
  const lookup = buildRateCardLookup(rateRows);

  let exact = 0, close = 0, mismatch = 0;
  const mismatches: string[] = [];

  for (const mis of misRows) {
    if (mis.totalFreight === null || !mis.mode || !mis.zone || mis.weight === null) continue;
    const courierGroup = detectCourierGroup(mis.masterShipper);
    const isRto = normalizeMisStatus(mis.status) === 'rto';
    const isCod = (mis.payment || '').toUpperCase() === 'COD';

    const calc = calculateFreight(
      { courierGroup, mode: mis.mode, zone: mis.zone, weight: mis.weight, isRto, isCod, collectableAmount: mis.collectableAmount ?? 0 },
      lookup
    );
    const delta = Math.round((calc.totalFreight - mis.totalFreight) * 100) / 100;
    if (Math.abs(delta) < 0.02) exact++;
    else if (Math.abs(delta) < 1) close++;
    else {
      mismatch++;
      if (mismatches.length < 10) mismatches.push(`${mis.awb} mode=${mis.mode} zone=${mis.zone} wt=${mis.weight} calc=${calc.totalFreight} mis=${mis.totalFreight} delta=${delta}`);
    }
  }

  const total = exact + close + mismatch;
  console.log(`exact: ${exact}, close(<1 rupee): ${close}, mismatch: ${mismatch}, total: ${total}`);
  console.log(`accuracy: ${((100 * exact) / total).toFixed(3)}%`);
  if (mismatches.length) {
    console.log('\nsample mismatches:');
    mismatches.forEach((m) => console.log('  ' + m));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
