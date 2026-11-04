import type { BkashPaymentStatus } from "@/lib/bkash/types";

export const BKASH_STATUS_LABELS: Record<BkashPaymentStatus, string> = {
  PENDING: "Pending",
  INITIATED: "Initiated",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  UNKNOWN: "Needs status check",
};

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export function formatBkashDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return dateTimeFormat.format(date);
}
