import axios, { AxiosInstance } from 'axios';
import { env } from '../config/env';
import { ShipmentRecord } from '../types';

interface ListShipmentsParams {
  from: string; // ISO date
  to: string;
  page?: number;
  per_page?: number;
  status?: string;
  payment_mode?: string;
  courier_name?: string;
}

interface ListShipmentsResponseItem {
  awb: string;
  order_id: string;
  status: string;
  payment_mode: string;
  courier_name: string;
  total_amount: number;
  weight: number;
  customer_name?: string;
  customer_phone?: string;
  creation_datetime?: string;
  estimated_delivery_date?: string;
}

interface ApiListResponse<T> {
  success: boolean;
  data: T[];
  meta?: { page: number; per_page: number; total: number; total_pages: number };
  message?: string;
}

interface ApiSingleResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

function client(): AxiosInstance {
  return axios.create({
    baseURL: env.kwikshipBaseUrl,
    headers: {
      'gk-app-id': env.kwikshipAppId,
      'gk-app-secret': env.kwikshipAppSecret,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      const retryable = status === undefined || status === 429 || status >= 500;
      if (!retryable || attempt === retries) break;
      const delayMs = 500 * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

/** Splits [from, to] into <=30-day inclusive windows, matching the API's max date-range rule. */
export function chunkDateRange(from: string, to: string, maxDays = 30): Array<{ from: string; to: string }> {
  const chunks: Array<{ from: string; to: string }> = [];
  let cursor = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  while (cursor <= end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + maxDays - 1);
    const actualEnd = chunkEnd > end ? end : chunkEnd;
    chunks.push({ from: cursor.toISOString().slice(0, 10), to: actualEnd.toISOString().slice(0, 10) });
    cursor = new Date(actualEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return chunks;
}

/** Lists all shipments in a date window, paginating until total_pages is exhausted. */
export async function listAllShipments(
  params: Omit<ListShipmentsParams, 'page' | 'per_page'>,
  onPage?: (items: ListShipmentsResponseItem[], page: number, totalPages: number) => void
): Promise<ListShipmentsResponseItem[]> {
  const http = client();
  const perPage = 100;
  let page = 1;
  let totalPages = 1;
  const all: ListShipmentsResponseItem[] = [];

  do {
    const res = await withRetry(() =>
      http.get<ApiListResponse<ListShipmentsResponseItem>>('/api/v1/shipments', {
        params: { ...params, page, per_page: perPage },
      })
    );
    const { data, meta } = res.data;
    all.push(...data);
    totalPages = meta?.total_pages ?? 1;
    onPage?.(data, page, totalPages);
    page += 1;
  } while (page <= totalPages);

  return all;
}

export async function getShipmentDetail(awb: string): Promise<ShipmentRecord | null> {
  const http = client();
  try {
    const res = await withRetry(() => http.get<ApiSingleResponse<any>>(`/api/v1/shipments/${encodeURIComponent(awb)}`));
    const d = res.data.data;
    return {
      awb: d.awb,
      orderId: d.order_id ?? null,
      status: d.status ?? null,
      paymentMode: d.payment_mode ?? null,
      courierName: d.courier_name ?? null,
      weight: d.dimensions?.weight ?? d.weight ?? null,
      totalAmount: d.total_amount ?? null,
      pickupPincode: d.pickup_address?.pincode ?? null,
      destinationPincode: d.shipping_address?.pincode ?? null,
      customerName: d.customer_name ?? null,
      customerPhone: d.customer_phone ?? null,
      creationDatetime: d.creation_datetime ?? null,
      estimatedDeliveryDate: d.estimated_delivery_date ?? null,
      rawJson: d,
    };
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) return null;
    throw err;
  }
}
