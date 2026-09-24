import { pool } from '../src/config/db';

async function main() {
  const runId = 11;
  const { rows } = await pool.query(
    `SELECT match_status, freight_delta, gross_freight_mis, gross_freight_calc, forward_freight_mis, forward_freight_calc,
            zone_mismatch, weight_mismatch, payment_mismatch, status_mismatch
     FROM reconciliation_results WHERE run_id = $1`,
    [runId]
  );

  let grossAbs = 0, grossSigned = 0;
  let forwardOnlyZoneMismatchAbs = 0;
  let onlyOneReasonAbs = 0; // rows flagged for exactly one reason (not compounded)
  let multiReasonAbs = 0;

  for (const r of rows) {
    if (r.gross_freight_mis !== null && r.gross_freight_calc !== null) {
      const gd = Number(r.gross_freight_calc) - Number(r.gross_freight_mis);
      grossAbs += Math.abs(gd);
      grossSigned += gd;
    }
    if (r.zone_mismatch && r.forward_freight_mis !== null && r.forward_freight_calc !== null) {
      forwardOnlyZoneMismatchAbs += Math.abs(Number(r.forward_freight_calc) - Number(r.forward_freight_mis));
    }
    const reasonCount = [r.zone_mismatch, r.weight_mismatch, r.payment_mismatch, r.status_mismatch].filter(Boolean).length;
    if (r.freight_delta !== null) {
      if (reasonCount <= 1) onlyOneReasonAbs += Math.abs(Number(r.freight_delta));
      else multiReasonAbs += Math.abs(Number(r.freight_delta));
    }
  }

  console.log({
    grossAbs: round2(grossAbs),
    grossSigned: round2(grossSigned),
    forwardOnlyZoneMismatchAbs: round2(forwardOnlyZoneMismatchAbs),
    onlyOneReasonAbs: round2(onlyOneReasonAbs),
    multiReasonAbs: round2(multiReasonAbs),
  });

  await pool.end();
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

main().catch((err) => { console.error(err); process.exit(1); });
