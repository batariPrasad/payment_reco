-- "Lost or stuck" shipments (lost, or an RTO that never actually completed) don't get a
-- normal freight comparison -- the real ask is claiming the order value back from the courier.
ALTER TABLE reconciliation_results DROP CONSTRAINT IF EXISTS reconciliation_results_match_status_check;
ALTER TABLE reconciliation_results ADD CONSTRAINT reconciliation_results_match_status_check CHECK (match_status IN (
  'MATCHED', 'FREIGHT_MISMATCH', 'PAYMENT_MISMATCH', 'STATUS_MISMATCH',
  'ZONE_MISMATCH', 'WEIGHT_MISMATCH', 'NO_API_DATA', 'RATE_NOT_FOUND', 'ZONE_NOT_FOUND', 'LOST'
));
ALTER TABLE reconciliation_results ADD COLUMN IF NOT EXISTS claim_amount NUMERIC;

ALTER TABLE reconciliation_runs ADD COLUMN IF NOT EXISTS lost_count INT NOT NULL DEFAULT 0;
ALTER TABLE reconciliation_runs ADD COLUMN IF NOT EXISTS total_claimable NUMERIC NOT NULL DEFAULT 0;
