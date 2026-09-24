export type Mode = 'SURFACE' | 'AIR' | 'NDD';
export type FreightType = 'Forward' | 'RTO';
export type Zone = 'A' | 'B' | 'C' | 'D' | 'E';
export type CourierGroup = 'ALL' | 'BLUEDART';

export interface MisRow {
  id?: number;
  misUploadId?: number;
  awb: string;
  merchant: string | null;
  masterShipper: string | null;
  mode: Mode | null;
  weight: number | null;
  zone: Zone | null;
  status: string | null;
  payment: string | null;
  collectableAmount: number | null;
  forwardFreight: number | null;
  rtoFreight: number | null;
  reverseCharges: number | null;
  codCharge: number | null;
  grossFreight: number | null;
  totalFreight: number | null;
  mid: string | null;
  orderId: string | null;
  orderValue: number | null;
  skuCode: string | null;
  skuCount: number | null;
  productQuantityCombined: string | null;
}

export interface ShipmentRecord {
  awb: string;
  orderId: string | null;
  status: string | null;
  paymentMode: string | null;
  courierName: string | null;
  weight: number | null;
  totalAmount: number | null;
  pickupPincode: string | null;
  destinationPincode: string | null;
  customerName: string | null;
  customerPhone: string | null;
  creationDatetime: string | null;
  estimatedDeliveryDate: string | null;
  rawJson?: unknown;
}

export interface RateCardRow {
  courierGroup: CourierGroup;
  mode: Mode;
  type: FreightType;
  zone: Zone;
  baseWeightSlab: number;
  additionalWeightSlab: number;
  rate: number;
  codFlat: number;
  codPercent: number;
}

export interface FreightCalcInput {
  courierGroup: CourierGroup;
  mode: Mode;
  zone: Zone;
  weight: number;
  isRto: boolean;
  isCod: boolean;
  collectableAmount: number;
}

export interface FreightCalcResult {
  weightMultiplier: number;
  forwardFreight: number;
  rtoFreight: number;
  codCharge: number;
  grossFreight: number;
  totalFreight: number;
  missingRates: string[];
}

export const GST_RATE = 0.18;

export type UserRole = 'admin' | 'user';

export interface UserRecord {
  id: number;
  email: string;
  role: UserRole;
  canView: boolean;
  canEdit: boolean;
  canUpload: boolean;
  isActive: boolean;
}

export interface SessionPayload {
  sub: number; // user id
  email: string;
  role: UserRole;
  canView: boolean;
  canEdit: boolean;
  canUpload: boolean;
}
