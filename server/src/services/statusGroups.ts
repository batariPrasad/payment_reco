// Maps Kwikship's internal shipment status strings to the public "status group"
// names documented in the Shipments API (see Status Groups table).
// Source: Kwikship Public API Documentation v1, pages 14-15.

const GROUP_MAP: Record<string, string> = {
  new: 'new',
  cancellation_requested: 'new',
  return_pickup_initiated: 'new',
  return_cancelled: 'new',
  return_cancellation_requested: 'new',

  to_be_picked: 'pickup_pending',
  picklist_generated: 'pickup_pending',
  label_generated: 'pickup_pending',
  packing_exempted: 'pickup_pending',
  packing_on_hold: 'pickup_pending',
  pickup_ready: 'pickup_pending',
  ready_for_pickup: 'pickup_pending',
  manifestated: 'pickup_pending',
  out_for_pickup: 'pickup_pending',
  pickup_error: 'pickup_pending',
  pickup_exemption: 'pickup_pending',
  pickup_rescheduled: 'pickup_pending',
  ready_to_ship: 'pickup_pending',
  pickup_scheduled: 'pickup_pending',

  pickup_completed: 'in_transit',
  in_transit: 'in_transit',
  out_for_delivery: 'in_transit',
  reached_destination_hub: 'in_transit',
  reached_source_hub: 'in_transit',
  delayed: 'in_transit',
  lost: 'in_transit',
  damaged: 'in_transit',
  destroyed: 'in_transit',
  delivery_on_hold: 'in_transit',
  ndr_attempt_1: 'in_transit',
  ndr_attempt_2: 'in_transit',
  ndr_attempt_3: 'in_transit',

  delivered: 'delivered',
  return_delivered: 'delivered',

  undelivered: 'undelivered',

  rto_initiated: 'rto',
  rto_in_transit: 'rto',
  rto_delivered: 'rto',
  rto_cancelled: 'rto',
  rto_ndr: 'rto',
  rto_delivery_error: 'rto',
  rto_out_of_delivery: 'rto',

  cancelled: 'cancelled',
  cancellation_initiated: 'cancelled',
};

export function toStatusGroup(internalStatus: string | null | undefined): string {
  if (!internalStatus) return 'unknown';
  const key = internalStatus.trim().toLowerCase();
  if (GROUP_MAP[key]) return GROUP_MAP[key];
  if (key.startsWith('rto')) return 'rto';
  if (key.includes('deliver') && key.includes('return')) return 'delivered';
  if (key.includes('deliver')) return 'delivered';
  return key; // fall back to raw value if unrecognized
}

/** Normalizes an MIS "Status" column value (e.g. "Delivered", "RTO") to the same group vocabulary. */
export function normalizeMisStatus(misStatus: string | null | undefined): string {
  if (!misStatus) return 'unknown';
  const key = misStatus.trim().toLowerCase();
  if (key === 'rto') return 'rto';
  if (key === 'delivered') return 'delivered';
  if (key === 'cancelled' || key === 'canceled') return 'cancelled';
  if (key === 'undelivered') return 'undelivered';
  if (key === 'in transit' || key === 'in_transit') return 'in_transit';
  return key;
}

/** A shipment counts as RTO (for freight calc: adds RTO freight, suppresses COD charge)
 * if it's genuinely back with the seller — either the standard RTO path (any `rto_*`
 * status) or a return-pickup that's been delivered back (`return_delivered`). An RTO
 * still in transit (`rto_in_transit`, `rto_initiated`, ...) is NOT yet actually returned. */
export function isRtoLikeStatus(apiStatus: string | null | undefined): boolean {
  if (!apiStatus) return false;
  const key = apiStatus.trim().toLowerCase();
  return key.startsWith('rto') || key === 'return_delivered';
}

/**
 * MIS is a billing/settlement file — its Status is expected to reflect a FINAL, completed
 * state, not an in-progress one. So the match rule is intentionally strict, not a fuzzy
 * group comparison:
 *   MIS "Delivered" matches ONLY the exact status "delivered" (return_delivered does NOT count).
 *   MIS "RTO"        matches ONLY "rto_delivered" or "return_delivered" (an RTO still in
 *                     transit, e.g. "rto_in_transit", is not actually returned yet).
 * Any other MIS status value falls back to the broader group comparison.
 */
export function isStatusMatch(misStatus: string | null | undefined, apiStatus: string | null | undefined): boolean {
  const mis = normalizeMisStatus(misStatus);
  const apiKey = (apiStatus ?? '').trim().toLowerCase();

  if (mis === 'delivered') return apiKey === 'delivered';
  if (mis === 'rto') return apiKey === 'rto_delivered' || apiKey === 'return_delivered';
  return toStatusGroup(apiStatus) === mis;
}

/**
 * "Lost or stuck" shipments: genuinely lost, or any RTO sub-status that isn't the one
 * confirming the return actually completed. Per Kwikship's own status list, `rto_delivered`
 * is the only RTO status that means "done" — every other rto_* status (rto_initiated,
 * rto_in_transit, rto_cancelled, rto_ndr, rto_out_of_delivery, rto_delivery_error, ...) means
 * the return is still in progress or hit a problem, not actually completed. Normal freight
 * billing doesn't apply cleanly to any of these — the real ask is claiming the order value
 * back from the courier, not a freight comparison. Written as a rule (not a hardcoded list)
 * so any future rto_* sub-status Kwikship adds is covered automatically.
 */
export function isLostOrExceptionStatus(apiStatus: string | null | undefined): boolean {
  if (!apiStatus) return false;
  const key = apiStatus.trim().toLowerCase();
  if (key === 'lost') return true;
  return key.startsWith('rto') && key !== 'rto_delivered';
}
