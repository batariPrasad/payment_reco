-- Splits the total discrepancy by direction: money Kwikship overcharged (owed back to the
-- merchant) vs undercharged (merchant technically owes Kwikship), instead of only the
-- direction-blind absolute total.
ALTER TABLE reconciliation_runs ADD COLUMN IF NOT EXISTS overcharged_amount NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE reconciliation_runs ADD COLUMN IF NOT EXISTS overcharged_count INT NOT NULL DEFAULT 0;
ALTER TABLE reconciliation_runs ADD COLUMN IF NOT EXISTS undercharged_amount NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE reconciliation_runs ADD COLUMN IF NOT EXISTS undercharged_count INT NOT NULL DEFAULT 0;
