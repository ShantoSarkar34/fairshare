import { formatBasisPointsAsPercent } from "@/lib/percentage";
import type { ExpenseSplitType } from "./types";

export const SPLIT_TYPE_LABELS: Record<ExpenseSplitType, string> = {
  EQUAL: "Equally",
  EXACT: "Exact amounts",
  PERCENTAGE: "Percentages",
  SHARES: "Shares",
};

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "UTC",
});

/** Formats a YYYY-MM-DD database date without any timezone shift. */
export function formatExpenseDate(dateOnly: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
  if (!match) return dateOnly;

  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );

  return dateFormat.format(date);
}

/** Human-readable split metadata for detail pages. */
export function describeSplitValue(
  splitType: ExpenseSplitType,
  splitValue: number | null,
): string | null {
  if (splitValue === null) return null;

  if (splitType === "PERCENTAGE") {
    return `${formatBasisPointsAsPercent(splitValue)}%`;
  }

  if (splitType === "SHARES") {
    return `${splitValue} ${splitValue === 1 ? "share" : "shares"}`;
  }

  return null;
}
