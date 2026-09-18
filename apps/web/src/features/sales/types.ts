import type { PaymentMethod, SaleChannel, SaleDto, SaleStatus } from '@pos/shared';

/**
 * The sales module DTOs that live in the API rather than in @pos/shared
 * (apps/api/src/modules/sales/mappers.ts), mirrored here so the screens stay
 * typed without reaching across the workspace.
 */

export interface RefundLineDto {
  id: string;
  saleLineId: string;
  productId: string | null;
  name: string | null;
  sku: string | null;
  quantity: number;
  amountMinor: number;
  reason: string;
  restocked: boolean;
}

export interface RefundDto {
  id: string;
  entityId: string;
  saleId: string;
  receiptNumber: string | null;
  reference: string;
  totalMinor: number;
  taxMinor: number;
  /** Stripped by the API for roles without product:cost. */
  cogsMinor?: number;
  method: string;
  note: string | null;
  userId: string | null;
  userName: string | null;
  createdAt: string;
  lines: RefundLineDto[];
}

/** GET /api/sales/:id */
export type SaleDetailDto = SaleDto & {
  refunds: RefundDto[];
  /** Restaurant sales may carry one; the mapper does not always emit it. */
  serviceChargeMinor?: number;
};

/** The one filter object shared by the table, the summary strip and the URL. */
export interface SalesFilters {
  from: string;
  to: string;
  cashierId?: string;
  customerId?: string;
  channel?: SaleChannel;
  status?: SaleStatus;
  paymentMethod?: PaymentMethod;
  search?: string;
}

export interface SalesSummary {
  transactionCount: number;
  grossMinor: number;
  discountMinor: number;
  refundMinor: number;
  averageTicketMinor: number;
  /** True when the window was bigger than the aggregation cap. */
  truncated: boolean;
}

/** GET /api/sales/:id/receipt-text */
export interface ReceiptTextResponse {
  receiptNumber: string;
  text: string;
}

/** POST /api/sales/:id/send-receipt */
export interface SendReceiptResponse {
  emailQueued: boolean;
  whatsappUrl: string;
  receiptText: string;
  recordedEmail: string | null;
  recordedPhone: string | null;
  sentAt: string | null;
  message: string;
}

/** A trimmed users list row - the cashier filter needs nothing else. */
export interface CashierOption {
  id: string;
  name: string;
  active: boolean;
}
