export type SettlementMethod = "BKASH" | "CASH" | "BANK";

export type SettlementMemberView = {
  userId: string;
  name: string;
  isActive: boolean;
  /** Decimal string. Negative means the member owes money. */
  net: string;
};

export type SuggestedTransferView = {
  fromUserId: string;
  fromName: string;
  toUserId: string;
  toName: string;
  /** Decimal string. Always positive. */
  amount: string;
};

export type SettlementHistoryItem = {
  id: string;
  fromUserId: string;
  fromName: string;
  toUserId: string;
  toName: string;
  /** Decimal string. Always positive. */
  amount: string;
  method: SettlementMethod;
  transactionReference: string | null;
  note: string | null;
  recordedById: string;
  recordedByName: string;
  settledAt: string;
  /** Pre-formatted on the server to avoid timezone hydration mismatches. */
  settledAtLabel: string;
};

export type SettlementOverviewData = {
  currentUserId: string;
  currentUserRole: "ADMIN" | "MEMBER";
  members: SettlementMemberView[];
  suggestions: SuggestedTransferView[];
  history: SettlementHistoryItem[];
};

export type SettlementOverviewResult =
  | { ok: true; data: SettlementOverviewData }
  | { ok: false; error: string };
