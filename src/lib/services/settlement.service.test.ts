import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import { recordSettlement } from "@/lib/services/settlement.service";
import type { RecordSettlementInput } from "@/lib/validations/settlement";

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
    create: vi.fn(),
  },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

const GROUP_ID = "group_1";
const ACTOR_ID = "user_actor";

type LedgerMembership = {
  userId: string;
  name: string;
  leftAt: Date | null;
  joinedAt: Date;
};

type LedgerExpense = {
  id: string;
  description: string;
  amount: bigint;
  expenseDate: Date;
  paidById: string;
  participants: { userId: string; shareAmount: bigint }[];
};

type LedgerSettlement = {
  id: string;
  fromUserId: string;
  toUserId: string;
  amount: bigint;
  method: "BKASH" | "CASH" | "BANK";
  transactionReference: string | null;
  note: string | null;
  settledAt: Date;
};

type LedgerState = {
  actorRole: "ADMIN" | "MEMBER";
  members: LedgerMembership[];
  expenses: LedgerExpense[];
  settlements: LedgerSettlement[];
};

let state: LedgerState;

function member(userId: string, leftAt: Date | null = null): LedgerMembership {
  return {
    userId,
    name: userId.toUpperCase(),
    leftAt,
    joinedAt: new Date(Date.UTC(2026, 0, 1)),
  };
}

function setupLedger(
  options: {
    actorRole?: "ADMIN" | "MEMBER";
    members?: LedgerMembership[];
    expenses?: LedgerExpense[];
    settlements?: LedgerSettlement[];
  } = {},
) {
  state = {
    actorRole: options.actorRole ?? "MEMBER",
    members: options.members ?? [member("rafi"), member("nusrat")],
    expenses: options.expenses ?? [
      {
        id: "dinner",
        description: "Dinner",
        amount: 30_000n,
        expenseDate: new Date(Date.UTC(2026, 10, 3)),
        paidById: "rafi",
        participants: [{ userId: "nusrat", shareAmount: 30_000n }],
      },
    ],
    settlements: options.settlements ?? [],
  };
}

function installMocks() {
  prismaMock.groupMember.findFirst.mockImplementation(async () =>
    state.actorRole
      ? { id: "membership_actor", role: state.actorRole }
      : null,
  );

  prismaMock.groupMember.findMany.mockImplementation(
    async (args: {
      where?: { userId?: { in?: string[] } };
      select?: { user?: unknown };
    }) => {
      const userIds = args.where?.userId?.in;

      if (userIds) {
        return state.members
          .filter((entry) => userIds.includes(entry.userId))
          .map((entry) => ({ userId: entry.userId }));
      }

      return state.members.map((entry) => ({
        userId: entry.userId,
        leftAt: entry.leftAt,
        joinedAt: entry.joinedAt,
        user: { name: entry.name },
      }));
    },
  );

  prismaMock.expense.findMany.mockImplementation(async () => state.expenses);
  prismaMock.settlement.findMany.mockImplementation(
    async () => state.settlements,
  );

  prismaMock.settlement.create.mockImplementation(
    async (args: {
      data: {
        groupId: string;
        fromUserId: string;
        toUserId: string;
        amount: bigint;
        method: "BKASH" | "CASH" | "BANK";
        transactionReference?: string | null;
        note?: string | null;
        createdById: string;
        settledAt: Date;
      };
    }) => {
      const id = `settlement-${state.settlements.length + 1}`;
      state.settlements.push({
        id,
        fromUserId: args.data.fromUserId,
        toUserId: args.data.toUserId,
        amount: args.data.amount,
        method: args.data.method,
        transactionReference: args.data.transactionReference ?? null,
        note: args.data.note ?? null,
        settledAt: args.data.settledAt,
      });
      return { id };
    },
  );

  prismaMock.$queryRaw.mockResolvedValue([]);
  prismaMock.$transaction.mockImplementation(
    async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock),
  );
}

function validInput(
  overrides: Partial<RecordSettlementInput> = {},
): RecordSettlementInput {
  return {
    fromUserId: "nusrat",
    toUserId: "rafi",
    amount: 10_000n,
    method: "BKASH",
    transactionReference: "TRX123",
    note: "Partial payment",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  setupLedger();
  installMocks();
});

describe("recordSettlement", () => {
  it("rejects a non-member before reading ledger data", async () => {
    prismaMock.groupMember.findFirst.mockResolvedValue(null);

    await expect(
      recordSettlement(GROUP_ID, ACTOR_ID, validInput()),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(prismaMock.groupMember.findMany).not.toHaveBeenCalled();
    expect(prismaMock.expense.findMany).not.toHaveBeenCalled();
    expect(prismaMock.settlement.create).not.toHaveBeenCalled();
  });

  it("rejects a sender or receiver who is not in the group", async () => {
    await expect(
      recordSettlement(
        GROUP_ID,
        "rafi",
        validInput({ fromUserId: "stranger" }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      recordSettlement(
        GROUP_ID,
        "nusrat",
        validInput({ toUserId: "stranger" }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(prismaMock.settlement.create).not.toHaveBeenCalled();
  });

  it("rejects the same sender and receiver", async () => {
    await expect(
      recordSettlement(
        GROUP_ID,
        "nusrat",
        validInput({ toUserId: "nusrat" }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects zero and negative amounts", async () => {
    for (const amount of [0n, -1n]) {
      await expect(
        recordSettlement(GROUP_ID, "nusrat", validInput({ amount })),
      ).rejects.toBeInstanceOf(ValidationError);
    }
  });

  it("rejects a member who is neither sender, receiver, nor admin", async () => {
    setupLedger({
      members: [member("rafi"), member("nusrat"), member("karim")],
    });
    installMocks();

    await expect(
      recordSettlement(
        GROUP_ID,
        "karim",
        validInput({ fromUserId: "nusrat", toUserId: "rafi" }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(prismaMock.settlement.create).not.toHaveBeenCalled();
  });

  it("records a valid payment from the sender", async () => {
    const result = await recordSettlement(GROUP_ID, "nusrat", validInput());

    expect(result).toEqual({ settlementId: "settlement-1" });
    expect(prismaMock.$queryRaw).toHaveBeenCalled();
    expect(prismaMock.settlement.create).toHaveBeenCalledOnce();

    const call = prismaMock.settlement.create.mock.calls[0]?.[0] as {
      data: {
        groupId: string;
        createdById: string;
        amount: bigint;
        method: string;
        transactionReference: string | null;
      };
    };

    expect(call.data.groupId).toBe(GROUP_ID);
    expect(call.data.createdById).toBe("nusrat");
    expect(call.data.amount).toBe(10_000n);
    expect(call.data.method).toBe("BKASH");
    expect(call.data.transactionReference).toBe("TRX123");
    expect(state.settlements).toHaveLength(1);
  });

  it("allows an admin to record a payment between two other members", async () => {
    setupLedger({
      actorRole: "ADMIN",
      members: [member("rafi"), member("nusrat"), member("admin")],
    });
    installMocks();

    const result = await recordSettlement(
      GROUP_ID,
      "admin",
      validInput({ fromUserId: "nusrat", toUserId: "rafi" }),
    );

    expect(result.settlementId).toBe("settlement-1");
    expect(prismaMock.settlement.create).toHaveBeenCalledOnce();
  });

  it("rejects a payment larger than the sender's debt or receiver's credit", async () => {
    setupLedger({
      members: [member("a"), member("b"), member("c")],
      expenses: [
        {
          id: "expense-1",
          description: "First",
          amount: 15_000n,
          expenseDate: new Date(Date.UTC(2026, 10, 1)),
          paidById: "b",
          participants: [{ userId: "c", shareAmount: 15_000n }],
        },
        {
          id: "expense-2",
          description: "Second",
          amount: 5_000n,
          expenseDate: new Date(Date.UTC(2026, 10, 2)),
          paidById: "a",
          participants: [{ userId: "c", shareAmount: 5_000n }],
        },
      ],
    });
    installMocks();

    // C owes 200.00, A is owed 50.00. This exceeds A's credit without
    // exceeding C's debt.
    await expect(
      recordSettlement(
        GROUP_ID,
        "c",
        validInput({ fromUserId: "c", toUserId: "a", amount: 10_000n }),
      ),
    ).rejects.toThrow("receiver's outstanding credit");

    // C owes 200.00; 250.00 exceeds the debt.
    await expect(
      recordSettlement(
        GROUP_ID,
        "c",
        validInput({ fromUserId: "c", toUserId: "b", amount: 25_000n }),
      ),
    ).rejects.toThrow("sender's outstanding debt");

    expect(prismaMock.settlement.create).not.toHaveBeenCalled();
  });

  it("serializes concurrent payments so the same debt cannot be spent twice", async () => {
    let transactionQueue = Promise.resolve();

    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof prismaMock) => unknown) => {
        const previous = transactionQueue;
        let release = () => {};
        transactionQueue = new Promise<void>((resolve) => {
          release = resolve;
        });

        await previous;

        try {
          return await callback(prismaMock);
        } finally {
          release();
        }
      },
    );

    const results = await Promise.allSettled([
      recordSettlement(GROUP_ID, "nusrat", validInput({ amount: 30_000n })),
      recordSettlement(GROUP_ID, "nusrat", validInput({ amount: 30_000n })),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(
      1,
    );
    expect(prismaMock.settlement.create).toHaveBeenCalledOnce();
    expect(state.settlements).toHaveLength(1);
  });
});
