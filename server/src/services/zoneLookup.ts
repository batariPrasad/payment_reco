import { pool } from '../config/db';
import { Zone } from '../types';

const HUB_BY_PINCODE: Record<string, string> = {
  '560076': 'bangalore',
  '134102': 'pinjore',
};

export function hubForPickupPincode(pickupPincode: string | null | undefined): string | null {
  if (!pickupPincode) return null;
  return HUB_BY_PINCODE[pickupPincode.trim()] || null;
}

export interface ZoneLookupResult {
  zone: Zone | null;
  pickupHub: string | null;
  reason?: string;
}

/**
 * Loads the full zone_reference table into memory, keyed by `${hub}|${deliveryPincode}`.
 * The table is at most ~55k rows (two hubs x ~27k pincodes) so this is cheap and avoids
 * a per-row DB round trip during a reconciliation run.
 */
export async function loadZoneLookup(): Promise<Map<string, Zone>> {
  const { rows } = await pool.query<{ pickup_hub: string; delivery_pincode: string; zone: Zone }>(
    'SELECT pickup_hub, delivery_pincode, zone FROM zone_reference'
  );
  const map = new Map<string, Zone>();
  for (const r of rows) {
    map.set(`${r.pickup_hub}|${r.delivery_pincode}`, r.zone);
  }
  return map;
}

export function resolveZone(
  lookup: Map<string, Zone>,
  pickupPincode: string | null | undefined,
  destinationPincode: string | null | undefined
): ZoneLookupResult {
  const hub = hubForPickupPincode(pickupPincode);
  if (!hub) {
    return { zone: null, pickupHub: null, reason: `Unrecognized pickup pincode: ${pickupPincode ?? 'null'}` };
  }
  if (!destinationPincode) {
    return { zone: null, pickupHub: hub, reason: 'Missing destination pincode' };
  }
  const zone = lookup.get(`${hub}|${destinationPincode.trim()}`);
  if (!zone) {
    return { zone: null, pickupHub: hub, reason: `No zone mapping for ${hub} -> ${destinationPincode}` };
  }
  return { zone, pickupHub: hub };
}
