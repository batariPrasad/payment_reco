-- Payment reconciliation schema

CREATE TABLE IF NOT EXISTS pickup_hubs (
  code TEXT PRIMARY KEY,          -- e.g. 'bangalore', 'pinjore'
  name TEXT NOT NULL,
  pincode TEXT NOT NULL UNIQUE,
  city TEXT NOT NULL,
  state TEXT NOT NULL
);

INSERT INTO pickup_hubs (code, name, pincode, city, state) VALUES
  ('bangalore', 'Bangalore Warehouse', '560076', 'Bangalore', 'Karnataka'),
  ('pinjore', 'Pinjore Warehouse', '134102', 'Pinjore', 'Haryana')
ON CONFLICT (code) DO NOTHING;

-- Pincode -> zone map, one set of rows per pickup hub. Re-uploadable.
CREATE TABLE IF NOT EXISTS zone_reference (
  id SERIAL PRIMARY KEY,
  pickup_hub TEXT NOT NULL REFERENCES pickup_hubs(code),
  pickup_pincode TEXT NOT NULL,
  pickup_city TEXT,
  pickup_state TEXT,
  delivery_pincode TEXT NOT NULL,
  delivery_city TEXT,
  delivery_state TEXT,
  zone TEXT NOT NULL CHECK (zone IN ('A','B','C','D','E')),
  source_file TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pickup_hub, delivery_pincode)
);

CREATE INDEX IF NOT EXISTS idx_zone_reference_lookup
  ON zone_reference (pickup_hub, delivery_pincode);

-- Schedule B rate card. Re-uploadable; only one active version at a time.
CREATE TABLE IF NOT EXISTS rate_cards (
  id SERIAL PRIMARY KEY,
  courier_group TEXT NOT NULL CHECK (courier_group IN ('ALL','BLUEDART')),
  mode TEXT NOT NULL CHECK (mode IN ('SURFACE','AIR','NDD')),
  type TEXT NOT NULL CHECK (type IN ('Forward','RTO')),
  zone TEXT NOT NULL CHECK (zone IN ('A','B','C','D','E')),
  base_weight_slab NUMERIC NOT NULL DEFAULT 0.5,
  additional_weight_slab NUMERIC NOT NULL DEFAULT 0.5,
  rate NUMERIC NOT NULL,
  cod_flat NUMERIC NOT NULL DEFAULT 0,
  cod_percent NUMERIC NOT NULL DEFAULT 0,
  source_file TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_rate_cards_lookup
  ON rate_cards (courier_group, mode, type, zone) WHERE is_active;

-- Raw MIS file uploads
CREATE TABLE IF NOT EXISTS mis_uploads (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  row_count INT NOT NULL DEFAULT 0,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mis_rows (
  id SERIAL PRIMARY KEY,
  mis_upload_id INT NOT NULL REFERENCES mis_uploads(id) ON DELETE CASCADE,
  awb TEXT NOT NULL,
  merchant TEXT,
  master_shipper TEXT,
  mode TEXT,
  weight NUMERIC,
  zone TEXT,
  status TEXT,
  payment TEXT,
  collectable_amount NUMERIC,
  forward_freight NUMERIC,
  rto_freight NUMERIC,
  reverse_charges NUMERIC,
  cod_charge NUMERIC,
  gross_freight NUMERIC,
  total_freight NUMERIC,
  mid TEXT,
  order_id TEXT,
  order_value NUMERIC,
  sku_code TEXT,
  sku_count NUMERIC,
  product_quantity_combined TEXT
);

CREATE INDEX IF NOT EXISTS idx_mis_rows_awb ON mis_rows (awb);
CREATE INDEX IF NOT EXISTS idx_mis_rows_upload ON mis_rows (mis_upload_id);

-- Shipments synced from the Kwikship API (ground truth)
CREATE TABLE IF NOT EXISTS shipments (
  awb TEXT PRIMARY KEY,
  order_id TEXT,
  status TEXT,
  payment_mode TEXT,
  courier_name TEXT,
  weight NUMERIC,
  total_amount NUMERIC,
  pickup_pincode TEXT,
  destination_pincode TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  creation_datetime TIMESTAMPTZ,
  estimated_delivery_date TIMESTAMPTZ,
  raw_json JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id SERIAL PRIMARY KEY,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  shipments_listed INT NOT NULL DEFAULT 0,
  shipments_detailed INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id SERIAL PRIMARY KEY,
  mis_upload_id INT NOT NULL REFERENCES mis_uploads(id) ON DELETE CASCADE,
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_rows INT NOT NULL DEFAULT 0,
  matched_count INT NOT NULL DEFAULT 0,
  mismatch_count INT NOT NULL DEFAULT 0,
  no_api_data_count INT NOT NULL DEFAULT 0,
  total_discrepancy NUMERIC NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS reconciliation_results (
  id SERIAL PRIMARY KEY,
  run_id INT NOT NULL REFERENCES reconciliation_runs(id) ON DELETE CASCADE,
  mis_row_id INT REFERENCES mis_rows(id) ON DELETE SET NULL,
  awb TEXT NOT NULL,

  payment_mis TEXT,
  payment_api TEXT,
  payment_mismatch BOOLEAN NOT NULL DEFAULT false,

  status_mis TEXT,
  status_api TEXT,
  status_mismatch BOOLEAN NOT NULL DEFAULT false,

  pickup_pincode_api TEXT,
  destination_pincode_api TEXT,
  pickup_hub TEXT,
  zone_mis TEXT,
  zone_calculated TEXT,
  zone_mismatch BOOLEAN NOT NULL DEFAULT false,

  weight_mis NUMERIC,
  weight_api NUMERIC,
  weight_mismatch BOOLEAN NOT NULL DEFAULT false,

  mode_used TEXT,
  courier_name_api TEXT,
  courier_group TEXT,

  forward_freight_calc NUMERIC,
  rto_freight_calc NUMERIC,
  cod_charge_calc NUMERIC,
  gross_freight_calc NUMERIC,
  total_freight_calc NUMERIC,

  forward_freight_mis NUMERIC,
  rto_freight_mis NUMERIC,
  cod_charge_mis NUMERIC,
  gross_freight_mis NUMERIC,
  total_freight_mis NUMERIC,

  freight_delta NUMERIC,

  match_status TEXT NOT NULL CHECK (match_status IN (
    'MATCHED', 'FREIGHT_MISMATCH', 'PAYMENT_MISMATCH', 'STATUS_MISMATCH',
    'ZONE_MISMATCH', 'WEIGHT_MISMATCH', 'NO_API_DATA', 'RATE_NOT_FOUND', 'ZONE_NOT_FOUND'
  )),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_recon_results_run ON reconciliation_results (run_id);
CREATE INDEX IF NOT EXISTS idx_recon_results_awb ON reconciliation_results (awb);
CREATE INDEX IF NOT EXISTS idx_recon_results_status ON reconciliation_results (match_status);
