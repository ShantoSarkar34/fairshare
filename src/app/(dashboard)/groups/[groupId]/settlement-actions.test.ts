import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  recordSettlement: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/services/settlement.service", () => ({
  recordSettlement: mocks.recordSettlement,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { recordSettlementAction } from "./settlement-actions";
import { ValidationError } from "@/lib/errors";

const GROUP_ID = "group_1";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "user_1" });
});

describe("recordSettlementAction", () => {
  it("does not call the service when the user is unauthenticated", async () => {
    mocks.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(
      recordSettlementAction(GROUP_ID, {
        fromUserId: "a",
        toUserId: "b",
        amount: "10",
        method: "CASH",
      }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.recordSettlement).not.toHaveBeenCalled();
  });

  it("rejects an invalid group id", async () => {
    const result = await recordSettlementAction("", {
      fromUserId: "a",
      toUserId: "b",
      amount: "10",
      method: "CASH",
    });

    expect(result).toEqual({ ok: false, error: "Invalid group" });
    expect(mocks.recordSettlement).not.toHaveBeenCalled();
  });

  it("returns field errors for an invalid amount", async () => {
    const result = await recordSettlementAction(GROUP_ID, {
      fromUserId: "a",
      toUserId: "b",
      amount: "0",
      method: "CASH",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("highlighted");
    expect(result.fieldErrors?.amount).toBeDefined();
    expect(mocks.recordSettlement).not.toHaveBeenCalled();
  });

  it("rejects the same sender and receiver", async () => {
    const result = await recordSettlementAction(GROUP_ID, {
      fromUserId: "a",
      toUserId: "a",
      amount: "10",
      method: "CASH",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors?.toUserId).toBeDefined();
    expect(mocks.recordSettlement).not.toHaveBeenCalled();
  });

  it("passes the parsed poisha amount and session actor to the service", async () => {
    mocks.recordSettlement.mockResolvedValue({ settlementId: "settlement_1" });

    const result = await recordSettlementAction(GROUP_ID, {
      fromUserId: "a",
      toUserId: "b",
      amount: "123.45",
      method: "BKASH",
      transactionReference: " TRX ",
      note: " Note ",
    });

    expect(result).toEqual({
      ok: true,
      data: { settlementId: "settlement_1" },
    });
    expect(mocks.recordSettlement).toHaveBeenCalledWith(
      GROUP_ID,
      "user_1",
      expect.objectContaining({
        fromUserId: "a",
        toUserId: "b",
        amount: 12_345n,
        method: "BKASH",
        transactionReference: "TRX",
        note: "Note",
      }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/groups/${GROUP_ID}`);
  });

  it("returns the safe message from an expected service error", async () => {
    mocks.recordSettlement.mockRejectedValue(
      new ValidationError("Payment exceeds the sender's outstanding debt"),
    );

    const result = await recordSettlementAction(GROUP_ID, {
      fromUserId: "a",
      toUserId: "b",
      amount: "10",
      method: "CASH",
    });

    expect(result).toEqual({
      ok: false,
      error: "Payment exceeds the sender's outstanding debt",
    });
  });
});
