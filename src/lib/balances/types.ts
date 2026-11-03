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

export type MemberBalanceView = {
  userId: string;
  name: string;
  isActive: boolean;
  paid: string;
  share: string;
  net: string;
  status: BalanceStatus;
  entries: BalanceEntryView[];
};

export type GroupBalanceSummary = {
  totalExpenses: string;
  currentUserId: string;
  members: MemberBalanceView[];
};

export type GroupBalanceResult =
  | { ok: true; data: GroupBalanceSummary }
  | { ok: false; error: string };
