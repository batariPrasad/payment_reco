-- Distinguishes shipments populated via the Kwikship API sync from ones
-- manually uploaded as a file (used when API credentials aren't available yet).
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'api';
ALTER TABLE reconciliation_results ADD COLUMN IF NOT EXISTS shipment_source TEXT;
