import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotFoundError } from "@/lib/errors";
import { getGroupBalances } from "@/lib/services/balance.service";

const prismaMock = vi.hoisted(() => ({
  groupMember: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  expense: {
    findMany: vi.fn(),
  },
  settlement: {
    findMany: vi.fn(),
  },
}));

const sessionMock = vi.hoisted(() => ({
  requireUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth/session", () => ({ requireUser: sessionMock.requireUser }));

const GROUP_ID = "group_1";
const USER_ID = "user_viewer";

function currentUserIsMember() {
  prismaMock.groupMember.findFirst.mockResolvedValue({
    id: "membership_1",
    role: "MEMBER",
  });
}

function membership(
  userId: string,
  options: { leftAt?: Date | null; joinedAt?: Date } = {},
) {
  return {
    userId,
    leftAt: options.leftAt ?? null,
    joinedAt: options.joinedAt ?? new Date(Date.UTC(2026, 0, 1)),
    user: { name: userId.toUpperCase() },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionMock.requireUser.mockResolvedValue({ id: USER_ID });
  prismaMock.settlement.findMany.mockResolvedValue([]);
});

describe("getGroupBalances", () => {
  it("rejects a non-member and does not read group data", async () => {
    prismaMock.groupMember.findFirst.mockResolvedValue(null);

    await expect(getGroupBalances(GROUP_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    expect(sessionMock.requireUser).toHaveBeenCalledOnce();
    expect(prismaMock.groupMember.findMany).not.toHaveBeenCalled();
    expect(prismaMock.expense.findMany).not.toHaveBeenCalled();
    expect(prismaMock.settlement.findMany).not.toHaveBeenCalled();
  });

  it("returns serialized balances for this group only", async () => {
    currentUserIsMember();
    prismaMock.groupMember.findMany.mockResolvedValue([
      membership("rafi"),
      membership("nusrat"),
      membership("karim"),
    ]);
    prismaMock.expense.findMany.mockResolvedValue([
      {
        id: "dinner",
        description: "Dinner",
        amount: 90_000n,
        expenseDate: new Date(Date.UTC(2026, 10, 3)),
        paidById: "rafi",
        participants: [
          { userId: "rafi", shareAmount: 30_000n },
          { userId: "nusrat", shareAmount: 30_000n },
          { userId: "karim", shareAmount: 30_000n },
        ],
      },
    ]);

    const result = await getGroupBalances(GROUP_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.totalExpenses).toBe("900.00");
    expect(result.data.currentUserId).toBe(USER_ID);
    expect(result.data.members).toHaveLength(3);

    expect(result.data.members[0]).toMatchObject({
      userId: "rafi",
      name: "RAFI",
      isActive: true,
      paid: "900.00",
      share: "300.00",
      net: "600.00",
      status: "owed",
    });
    expect(result.data.members[0].entries[0]).toEqual({
      expenseId: "dinner",
      description: "Dinner",
      expenseDate: "2026-11-03",
      paid: "900.00",
      share: "300.00",
      effect: "600.00",
    });
    expect(result.data.members[1]).toMatchObject({
      userId: "nusrat",
      net: "-300.00",
      status: "owes",
    });
    expect(result.data.members[2]).toMatchObject({
      userId: "karim",
      net: "-300.00",
      status: "owes",
    });

    expect(prismaMock.groupMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { groupId: GROUP_ID } }),
    );
    expect(prismaMock.expense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { groupId: GROUP_ID },
        orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
      }),
    );
  });

  it("includes settlements in serialized member balances and breakdowns", async () => {
    currentUserIsMember();
    prismaMock.groupMember.findMany.mockResolvedValue([
      membership("rafi"),
      membership("nusrat"),
    ]);
    prismaMock.expense.findMany.mockResolvedValue([
      {
        id: "dinner",
        description: "Dinner",
        amount: 30_000n,
        expenseDate: new Date(Date.UTC(2026, 10, 3)),
        paidById: "rafi",
        participants: [{ userId: "nusrat", shareAmount: 30_000n }],
      },
    ]);
    prismaMock.settlement.findMany.mockResolvedValue([
      {
        id: "settlement-1",
        fromUserId: "nusrat",
        toUserId: "rafi",
        amount: 10_000n,
        method: "BKASH",
        transactionReference: "TRX123",
        note: "Partial payment",
        settledAt: new Date(Date.UTC(2026, 10, 4, 12, 30)),
      },
    ]);

    const result = await getGroupBalances(GROUP_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.members[0]).toMatchObject({
      userId: "rafi",
      net: "200.00",
      settlementsSent: "0.00",
      settlementsReceived: "100.00",
    });
    expect(result.data.members[0].settlementEntries[0]).toMatchObject({
      settlementId: "settlement-1",
      fromName: "NUSRAT",
      toName: "RAFI",
      amount: "100.00",
      effect: "-100.00",
      method: "BKASH",
      transactionReference: "TRX123",
    });
    expect(result.data.members[1]).toMatchObject({
      userId: "nusrat",
      net: "-200.00",
      settlementsSent: "100.00",
      settlementsReceived: "0.00",
    });
    expect(result.data.members[1].settlementEntries[0]).toMatchObject({
      effect: "100.00",
    });

    expect(prismaMock.settlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { groupId: GROUP_ID } }),
    );
  });

  it("keeps a former member whose only activity is a settlement", async () => {
    currentUserIsMember();
    prismaMock.groupMember.findMany.mockResolvedValue([
      membership("active"),
      membership("former", {
        leftAt: new Date(Date.UTC(2026, 5, 1)),
      }),
    ]);
    prismaMock.expense.findMany.mockResolvedValue([]);
    prismaMock.settlement.findMany.mockResolvedValue([
      {
        id: "settlement-former",
        fromUserId: "former",
        toUserId: "active",
        amount: 5_000n,
        method: "CASH",
        transactionReference: null,
        note: null,
        settledAt: new Date(Date.UTC(2026, 10, 4)),
      },
    ]);

    const result = await getGroupBalances(GROUP_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.members).toHaveLength(2);
    expect(result.data.members[1]).toMatchObject({
      userId: "former",
      isActive: false,
      net: "50.00",
    });
  });

  it("keeps former members who have activity, but omits inactive members with none", async () => {
    currentUserIsMember();
    prismaMock.groupMember.findMany.mockResolvedValue([
      membership("active"),
      membership("former-payer", {
        leftAt: new Date(Date.UTC(2026, 5, 1)),
      }),
      membership("former-idle", {
        leftAt: new Date(Date.UTC(2026, 5, 1)),
      }),
    ]);
    prismaMock.expense.findMany.mockResolvedValue([
      {
        id: "old-expense",
        description: "Old expense",
        amount: 10_000n,
        expenseDate: new Date(Date.UTC(2026, 4, 1)),
        paidById: "former-payer",
        participants: [
          { userId: "active", shareAmount: 5_000n },
          { userId: "former-payer", shareAmount: 5_000n },
        ],
      },
    ]);

    const result = await getGroupBalances(GROUP_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.members).toHaveLength(2);
    expect(result.data.members[0]).toMatchObject({
      userId: "active",
      isActive: true,
      net: "-50.00",
    });
    expect(result.data.members[1]).toMatchObject({
      userId: "former-payer",
      isActive: false,
      net: "50.00",
    });
    expect(
      result.data.members.some((member) => member.userId === "former-idle"),
    ).toBe(false);
  });

  it("returns a settled empty state when the group has no expenses", async () => {
    currentUserIsMember();
    prismaMock.groupMember.findMany.mockResolvedValue([
      membership("rafi"),
      membership("nusrat"),
    ]);
    prismaMock.expense.findMany.mockResolvedValue([]);

    const result = await getGroupBalances(GROUP_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.totalExpenses).toBe("0.00");
    expect(result.data.members).toHaveLength(2);
    expect(result.data.members.every((member) => member.net === "0.00")).toBe(
      true,
    );
    expect(
      result.data.members.every((member) => member.status === "settled"),
    ).toBe(true);
    expect(
      result.data.members.every((member) => member.entries.length === 0),
    ).toBe(true);
  });

  it("handles an empty group", async () => {
    currentUserIsMember();
    prismaMock.groupMember.findMany.mockResolvedValue([]);
    prismaMock.expense.findMany.mockResolvedValue([]);

    const result = await getGroupBalances(GROUP_ID);

    expect(result).toEqual({
      ok: true,
      data: { totalExpenses: "0.00", currentUserId: USER_ID, members: [] },
    });
  });

  it("returns a safe error result for inconsistent stored allocations", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      currentUserIsMember();
      prismaMock.groupMember.findMany.mockResolvedValue([
        membership("rafi"),
        membership("nusrat"),
      ]);
      prismaMock.expense.findMany.mockResolvedValue([
        {
          id: "broken-expense",
          description: "Broken expense",
          amount: 10_000n,
          expenseDate: new Date(Date.UTC(2026, 10, 3)),
          paidById: "rafi",
          participants: [
            { userId: "rafi", shareAmount: 4_000n },
            { userId: "nusrat", shareAmount: 4_000n },
          ],
        },
      ]);

      const result = await getGroupBalances(GROUP_ID);

      expect(result).toEqual({
        ok: false,
        error:
          "Balances could not be calculated because the group's ledger is inconsistent.",
      });
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });
});
