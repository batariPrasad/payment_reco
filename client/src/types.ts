export interface SessionUser {
  sub: number;
  email: string;
  role: 'admin' | 'user';
  canView: boolean;
  canEdit: boolean;
  canUpload: boolean;
}

export interface ManagedUser {
  id: number;
  email: string;
  role: 'admin' | 'user';
  can_view: boolean;
  can_edit: boolean;
  can_upload: boolean;
  is_active: boolean;
  created_at: string;
}

export interface MisUpload {
  id: number;
  filename: string;
  row_count: number;
  uploaded_at: string;
}

export interface ZoneReferenceSummary {
  pickup_hub: string;
  row_count: string;
  uploaded_at: string;
  source_file: string;
}

export interface RateCardRow {
  id: number;
  courier_group: 'ALL' | 'BLUEDART';
  mode: 'SURFACE' | 'AIR' | 'NDD';
  type: 'Forward' | 'RTO';
  zone: 'A' | 'B' | 'C' | 'D' | 'E';
  base_weight_slab: string;
  additional_weight_slab: string;
  rate: string;
  cod_flat: string;
  cod_percent: string;
  source_file: string;
  uploaded_at: string;
  is_active: boolean;
}

export interface SyncRun {
  id: number;
  from_date: string;
  to_date: string;
  started_at: string;
  finished_at: string | null;
  shipments_listed: number;
  shipments_detailed: number;
  status: string;
  error_message: string | null;
}

export interface ReconciliationRun {
  id: number;
  mis_upload_id: number;
  mis_filename: string;
  run_at: string;
  total_rows: number;
  matched_count: number;
  mismatch_count: number;
  no_api_data_count: number;
  total_discrepancy: string;
  lost_count: number;
  total_claimable: string;
  overcharged_amount: string;
  overcharged_count: number;
  undercharged_amount: string;
  undercharged_count: number;
}

export interface ReconciliationBreakdownItem {
  match_status: string;
  count: number;
  abs_delta_sum: number;
}

export interface ReconciliationResult {
  id: number;
  run_id: number;
  awb: string;
  payment_mis: string | null;
  payment_api: string | null;
  payment_mismatch: boolean;
  status_mis: string | null;
  status_api: string | null;
  status_mismatch: boolean;
  pickup_pincode_api: string | null;
  destination_pincode_api: string | null;
  pickup_hub: string | null;
  zone_mis: string | null;
  zone_calculated: string | null;
  zone_mismatch: boolean;
  weight_mis: string | null;
  weight_api: string | null;
  weight_mismatch: boolean;
  mode_used: string | null;
  courier_name_api: string | null;
  courier_group: string | null;
  forward_freight_calc: string | null;
  rto_freight_calc: string | null;
  cod_charge_calc: string | null;
  gross_freight_calc: string | null;
  total_freight_calc: string | null;
  forward_freight_mis: string | null;
  rto_freight_mis: string | null;
  cod_charge_mis: string | null;
  gross_freight_mis: string | null;
  total_freight_mis: string | null;
  freight_delta: string | null;
  match_status: string;
  notes: string | null;
  claim_amount: string | null;
}

export const MATCH_STATUS_LABELS: Record<string, string> = {
  MATCHED: 'Matched',
  FREIGHT_MISMATCH: 'Freight mismatch',
  PAYMENT_MISMATCH: 'Payment method mismatch',
  STATUS_MISMATCH: 'Status mismatch',
  ZONE_MISMATCH: 'Zone mismatch',
  WEIGHT_MISMATCH: 'Weight mismatch',
  NO_API_DATA: 'No API data (sync needed)',
  RATE_NOT_FOUND: 'Rate card entry missing',
  ZONE_NOT_FOUND: 'Zone mapping missing',
  LOST: 'Lost / stuck RTO — claim back',
};

/** Statuses treated as "lost or stuck" — not a clean delivered/RTO outcome, so freight isn't
 * calculated for these; the order value is tracked as a claim-back amount instead. */
export const LOST_OR_EXCEPTION_API_STATUSES = ['lost', 'rto_initiated', 'rto_in_transit', 'rto_cancelled', 'rto_ndr'];
