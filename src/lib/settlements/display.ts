import type { SettlementMethod } from "@/lib/settlements/types";

export const SETTLEMENT_METHOD_LABELS: Record<SettlementMethod, string> = {
  BKASH: "bKash",
  CASH: "Cash",
  BANK: "Bank",
};

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/** Formats an ISO timestamp deterministically on the server. */
export function formatSettlementDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return dateTimeFormat.format(date);
}
