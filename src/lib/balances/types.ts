import type { BalanceStatus } from "@/lib/calculations/balance";

/**
 * Serializable balance data for server components.
 * Monetary values are plain decimal strings because BigInt is not JSON-safe.
 */
export type BalanceEntryView = {
  expenseId: string;
  description: string;
  expenseDate?: string;
  paid: string;
  share: string;
  effect: string;
};

export type SettlementBalanceEntryView = {
  settlementId: string;
  fromUserId: string;
  fromName: string;
  toUserId: string;
  toName: string;
  amount: string;
  settledAt?: string;
  settledAtLabel?: string;
  method?: string;
  note?: string;
  transactionReference?: string;
  effect: string;
};

export type MemberBalanceView = {
  userId: string;
  name: string;
  isActive: boolean;
  paid: string;
  share: string;
  settlementsSent: string;
  settlementsReceived: string;
  net: string;
  status: BalanceStatus;
  entries: BalanceEntryView[];
  settlementEntries: SettlementBalanceEntryView[];
};

export type GroupBalanceSummary = {
  totalExpenses: string;
  currentUserId: string;
  members: MemberBalanceView[];
};

export type GroupBalanceResult =
  | { ok: true; data: GroupBalanceSummary }
  | { ok: false; error: string };
