export type BkashPaymentStatus =
  | "PENDING"
  | "INITIATED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "UNKNOWN";

export type BkashPaymentView = {
  id: string;
  /** Decimal string. Always positive. */
  amount: string;
  currency: string;
  merchantInvoiceNumber: string;
  paymentID: string | null;
  trxID: string | null;
  status: BkashPaymentStatus;
  failureReason: string | null;
  createdAt: string;
  createdAtLabel: string;
  completedAt: string | null;
  completedAtLabel: string | null;
};

export type BkashSandboxData = {
  enabled: boolean;
  currentUserId: string;
  payments: BkashPaymentView[];
};

export type BkashSandboxResult =
  | { ok: true; data: BkashSandboxData }
  | { ok: false; error: string };

export type BkashCheckoutSession = {
  paymentId: string;
  checkoutUrl: string;
};
