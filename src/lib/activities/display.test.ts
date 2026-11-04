import { describe, expect, it } from "vitest";

import { presentActivity } from "@/lib/activities/display";
import type { ActivityItem } from "@/lib/activities/types";

function item(
  action: ActivityItem["action"],
  metadata: Record<string, unknown> | null,
): ActivityItem {
  return {
    id: "activity_1",
    action,
    actor: { id: "user_1", name: "Rafi" },
    entityType: null,
    entityId: null,
    metadata,
    createdAt: "2026-11-04T12:00:00.000Z",
    createdAtLabel: "04 Nov 2026, 12:00",
  };
}

describe("presentActivity", () => {
  it("shows before/after values for an expense update", () => {
    const presentation = presentActivity(
      item("EXPENSE_UPDATED", {
        before: {
          description: "Electricity Bill",
          amount: "900.00",
          expenseDate: "2026-11-01",
          paidById: "rafi",
          paidByName: "Rafi",
          splitType: "EQUAL",
          participants: [
            {
              userId: "rafi",
              name: "Rafi",
              shareAmount: "450.00",
              splitValue: null,
            },
          ],
        },
        after: {
          description: "Electricity Bill",
          amount: "1200.00",
          expenseDate: "2026-11-01",
          paidById: "nusrat",
          paidByName: "Nusrat",
          splitType: "EXACT",
          participants: [
            {
              userId: "nusrat",
              name: "Nusrat",
              shareAmount: "1200.00",
              splitValue: null,
            },
          ],
        },
      }),
    );

    expect(presentation.actionText).toBe("updated an expense");
    expect(presentation.entityLabel).toBe("Electricity Bill");
    expect(presentation.changes).toContainEqual({
      label: "Amount",
      before: "৳900.00",
      after: "৳1,200.00",
    });
    expect(presentation.changes).toContainEqual({
      label: "Paid by",
      before: "Rafi",
      after: "Nusrat",
    });
    expect(presentation.changes).toContainEqual({
      label: "Split",
      before: "Equally",
      after: "Exact amounts",
    });
  });

  it("shows a safe summary for created/deleted expenses", () => {
    const metadata = {
      expense: {
        description: "Dinner",
        amount: "1200.00",
        paidByName: "Rafi",
        splitType: "EQUAL",
      },
    };

    expect(presentActivity(item("EXPENSE_DELETED", metadata))).toMatchObject({
      actionText: "deleted an expense",
      entityLabel: "Dinner",
      details: [
        { label: "Amount", value: "৳1,200.00" },
        { label: "Paid by", value: "Rafi" },
        { label: "Split", value: "Equally" },
      ],
    });
  });

  it("shows settlement amount and method", () => {
    const presentation = presentActivity(
      item("SETTLEMENT_RECORDED", {
        fromName: "Karim",
        toName: "Rafi",
        amount: "500.00",
        method: "BKASH",
        transactionReference: "TRX123",
      }),
    );

    expect(presentation.entityLabel).toBe("Karim → Rafi");
    expect(presentation.details).toEqual([
      { label: "Amount", value: "৳500.00" },
      { label: "Method", value: "bKash" },
      { label: "Reference", value: "TRX123" },
    ]);
  });

  it("falls back safely when metadata is malformed", () => {
    expect(presentActivity(item("EXPENSE_UPDATED", null))).toMatchObject({
      actionText: "updated an expense",
      entityLabel: null,
      changes: [],
    });
  });
});
