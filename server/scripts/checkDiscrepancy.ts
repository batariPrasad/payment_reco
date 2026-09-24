import { pool } from '../src/config/db';

async function main() {
  const runId = 11;
  const { rows } = await pool.query(
    `SELECT match_status, freight_delta FROM reconciliation_results WHERE run_id = $1`,
    [runId]
  );

  let sumAbs = 0;
  let sumSigned = 0;
  let sumAbsFreightMismatchOnly = 0;
  let sumSignedFreightMismatchOnly = 0;
  let sumAbsWeightOnly = 0;
  let sumAbsZoneOnly = 0;
  let countWithDelta = 0;

  for (const r of rows) {
    if (r.freight_delta === null) continue;
    const d = Number(r.freight_delta);
    countWithDelta++;
    sumAbs += Math.abs(d);
    sumSigned += d;
    if (r.match_status === 'FREIGHT_MISMATCH') {
      sumAbsFreightMismatchOnly += Math.abs(d);
      sumSignedFreightMismatchOnly += d;
    }
    if (r.match_status === 'WEIGHT_MISMATCH') sumAbsWeightOnly += Math.abs(d);
    if (r.match_status === 'ZONE_MISMATCH') sumAbsZoneOnly += Math.abs(d);
  }

  console.log({
    totalRowsWithDelta: countWithDelta,
    sumAbs: round2(sumAbs),
    sumSigned: round2(sumSigned),
    sumAbsFreightMismatchOnly: round2(sumAbsFreightMismatchOnly),
    sumSignedFreightMismatchOnly: round2(sumSignedFreightMismatchOnly),
    sumAbsWeightOnly: round2(sumAbsWeightOnly),
    sumAbsZoneOnly: round2(sumAbsZoneOnly),
  });

  await pool.end();
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

main().catch((err) => { console.error(err); process.exit(1); });
