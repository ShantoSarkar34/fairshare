import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createExpense: vi.fn(),
  updateExpense: vi.fn(),
  deleteExpense: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/services/expense.service", () => ({
  createExpense: mocks.createExpense,
  updateExpense: mocks.updateExpense,
  deleteExpense: mocks.deleteExpense,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  createExpenseAction,
  deleteExpenseAction,
  updateExpenseAction,
} from "./actions";
import { ForbiddenError, NotFoundError } from "@/lib/errors";

const ACTOR = {
  id: "user_actor",
  name: "Actor",
  email: "actor@example.com",
};

const VALID_PAYLOAD = {
  description: "Dinner",
  amount: "1200",
  expenseDate: "2026-11-03",
  paidById: "rafi",
  splitType: "EQUAL",
  participants: [{ userId: "rafi" }, { userId: "nusrat" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue(ACTOR);
  mocks.createExpense.mockResolvedValue({ id: "expense_1" });
  mocks.updateExpense.mockResolvedValue({ id: "expense_1" });
  mocks.deleteExpense.mockResolvedValue(undefined);
});

describe("createExpenseAction", () => {
  it("does nothing when the user is not authenticated", async () => {
    mocks.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(
      createExpenseAction("group_1", VALID_PAYLOAD),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.createExpense).not.toHaveBeenCalled();
  });

  it("passes the session user id, never a client-provided creator id", async () => {
    const result = await createExpenseAction("group_1", {
      ...VALID_PAYLOAD,
      createdById: "attacker",
      creatorId: "attacker",
    });

    expect(result).toEqual({
      ok: true,
      data: { expenseId: "expense_1" },
    });

    const serviceInput = mocks.createExpense.mock.calls[0]?.[2] as Record<
      string,
      unknown
    >;

    expect(mocks.createExpense).toHaveBeenCalledWith(
      "group_1",
      "user_actor",
      expect.objectContaining({
        description: "Dinner",
        amount: 120_000n,
        paidById: "rafi",
        splitType: "EQUAL",
      }),
    );
    expect(serviceInput).not.toHaveProperty("createdById");
    expect(serviceInput).not.toHaveProperty("creatorId");
  });

  it("returns safe validation errors without calling the service", async () => {
    const result = await createExpenseAction("group_1", {
      ...VALID_PAYLOAD,
      description: "   ",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error).toBe("Please fix the highlighted fields.");
    expect(result.fieldErrors?.description).toBeDefined();
    expect(mocks.createExpense).not.toHaveBeenCalled();
  });

  it("turns an authorization failure into a safe action result", async () => {
    mocks.createExpense.mockRejectedValue(new NotFoundError("Group not found"));

    const result = await createExpenseAction("group_1", VALID_PAYLOAD);

    expect(result).toEqual({ ok: false, error: "Group not found" });
  });
});

describe("updateExpenseAction", () => {
  it("requires authentication", async () => {
    mocks.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(
      updateExpenseAction("group_1", "expense_1", VALID_PAYLOAD),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.updateExpense).not.toHaveBeenCalled();
  });

  it("passes the session user and expense id to the service", async () => {
    const result = await updateExpenseAction(
      "group_1",
      "expense_1",
      VALID_PAYLOAD,
    );

    expect(result).toEqual({
      ok: true,
      data: { expenseId: "expense_1" },
    });
    expect(mocks.updateExpense).toHaveBeenCalledWith(
      "group_1",
      "user_actor",
      "expense_1",
      expect.objectContaining({ amount: 120_000n }),
    );
  });

  it("rejects an invalid expense id", async () => {
    const result = await updateExpenseAction("group_1", "", VALID_PAYLOAD);

    expect(result).toEqual({ ok: false, error: "Invalid expense." });
    expect(mocks.updateExpense).not.toHaveBeenCalled();
  });

  it("returns the service's permission error", async () => {
    mocks.updateExpense.mockRejectedValue(
      new ForbiddenError(
        "Only the expense creator or a group admin can edit this expense",
      ),
    );

    const result = await updateExpenseAction(
      "group_1",
      "expense_1",
      VALID_PAYLOAD,
    );

    expect(result).toEqual({
      ok: false,
      error: "Only the expense creator or a group admin can edit this expense",
    });
  });
});

describe("deleteExpenseAction", () => {
  it("requires authentication", async () => {
    mocks.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(
      deleteExpenseAction("group_1", "expense_1"),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.deleteExpense).not.toHaveBeenCalled();
  });

  it("passes the session user and both ids to the service", async () => {
    const result = await deleteExpenseAction("group_1", "expense_1");

    expect(result).toEqual({ ok: true, data: null });
    expect(mocks.deleteExpense).toHaveBeenCalledWith(
      "group_1",
      "user_actor",
      "expense_1",
    );
  });

  it("returns the service's permission error", async () => {
    mocks.deleteExpense.mockRejectedValue(
      new ForbiddenError(
        "Only the expense creator or a group admin can delete this expense",
      ),
    );

    const result = await deleteExpenseAction("group_1", "expense_1");

    expect(result).toEqual({
      ok: false,
      error:
        "Only the expense creator or a group admin can delete this expense",
    });
  });
});
