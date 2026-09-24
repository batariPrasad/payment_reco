import { pool } from '../src/config/db';

async function main() {
  const runId = 12;
  const { rows } = await pool.query(
    `SELECT match_status, freight_delta FROM reconciliation_results WHERE run_id = $1 AND freight_delta IS NOT NULL`,
    [runId]
  );

  let kwikshipOverchargedSum = 0; // delta < 0 -> calc < MIS -> Kwikship billed more than correct
  let kwikshipUnderchargedSum = 0; // delta > 0 -> calc > MIS -> Kwikship billed less than correct
  let overchargedCount = 0;
  let underchargedCount = 0;

  for (const r of rows) {
    const d = Number(r.freight_delta);
    if (d < -0.5) {
      kwikshipOverchargedSum += Math.abs(d);
      overchargedCount++;
    } else if (d > 0.5) {
      kwikshipUnderchargedSum += d;
      underchargedCount++;
    }
  }

  console.log({
    kwikshipOverchargedYou_KwikshipOwesPokonut: round2(kwikshipOverchargedSum),
    overchargedRowCount: overchargedCount,
    kwikshipUnderchargedYou_YouTechnicallyOweKwikship: round2(kwikshipUnderchargedSum),
    underchargedRowCount: underchargedCount,
    netSigned_negative_means_kwikship_owes_you: round2(kwikshipUnderchargedSum - kwikshipOverchargedSum),
    absoluteTotal_dashboard_figure: round2(kwikshipOverchargedSum + kwikshipUnderchargedSum),
  });

  await pool.end();
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

main().catch((err) => { console.error(err); process.exit(1); });
