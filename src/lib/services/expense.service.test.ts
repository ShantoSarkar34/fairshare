import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createExpense,
  deleteExpense,
  getExpenseForMember,
  listExpensesForGroup,
  updateExpense,
} from "@/lib/services/expense.service";
import type { CreateExpenseInput } from "@/lib/validations/expense";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";

const prismaMock = vi.hoisted(() => ({
  groupMember: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  expense: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  expenseParticipant: {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  settlement: {
    delete: vi.fn(),
    deleteMany: vi.fn(),
    updateMany: vi.fn(),
  },
  activity: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

const GROUP_ID = "group_1";
const ACTOR_ID = "user_actor";
const CREATOR_ID = "user_creator";
const EXPENSE_ID = "expense_1";

type ParticipantCreate = {
  userId: string;
  shareAmount: bigint;
  splitValue: number | null;
};

const equalInput: CreateExpenseInput = {
  description: "Dinner",
  amount: 120_000n,
  expenseDate: new Date(Date.UTC(2026, 10, 3)),
  paidById: "rafi",
  splitType: "EQUAL",
  participants: [
    { userId: "rafi" },
    { userId: "nusrat" },
    { userId: "karim" },
  ],
};

const exactInput: CreateExpenseInput = {
  description: "Taxi",
  amount: 100_000n,
  expenseDate: new Date(Date.UTC(2026, 10, 4)),
  paidById: "rafi",
  splitType: "EXACT",
  participants: [
    { userId: "rafi", amount: 50_000n },
    { userId: "nusrat", amount: 30_000n },
    { userId: "karim", amount: 20_000n },
  ],
};

const percentageInput: CreateExpenseInput = {
  description: "Hotel",
  amount: 100_000n,
  expenseDate: new Date(Date.UTC(2026, 10, 5)),
  paidById: "rafi",
  splitType: "PERCENTAGE",
  participants: [
    { userId: "rafi", basisPoints: 5000 },
    { userId: "nusrat", basisPoints: 3000 },
    { userId: "karim", basisPoints: 2000 },
  ],
};

const sharesInput: CreateExpenseInput = {
  description: "Groceries",
  amount: 100_000n,
  expenseDate: new Date(Date.UTC(2026, 10, 6)),
  paidById: "rafi",
  splitType: "SHARES",
  participants: [
    { userId: "rafi", shares: 2 },
    { userId: "nusrat", shares: 1 },
    { userId: "karim", shares: 1 },
  ],
};

function mockMembership(role: "ADMIN" | "MEMBER" = "MEMBER") {
  prismaMock.groupMember.findFirst.mockResolvedValue({
    id: "membership_1",
    role,
  });
}

function mockActiveMembers(userIds: string[]) {
  prismaMock.groupMember.findMany.mockResolvedValue(
    userIds.map((userId) => ({
      userId,
      user: { name: userId.toUpperCase() },
    })),
  );
}

function mockExpenseCreate() {
  prismaMock.expense.create.mockResolvedValue({ id: EXPENSE_ID });
}

function createdParticipants(): ParticipantCreate[] {
  const call = prismaMock.expense.create.mock.calls[0]?.[0] as
    | {
        data: {
          participants: { create: ParticipantCreate[] };
        };
      }
    | undefined;

  if (!call) throw new Error("expense.create was not called");

  return call.data.participants.create;
}

function allocationsByUser(participants: ParticipantCreate[]) {
  return new Map(
    participants.map((participant) => [
      participant.userId,
      participant.shareAmount,
    ]),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.activity.create.mockResolvedValue({ id: "activity_1" });
  prismaMock.$transaction.mockImplementation((callback: unknown) => {
    if (typeof callback !== "function") {
      throw new TypeError("Expected a transaction callback");
    }
    return callback(prismaMock);
  });
});

function createdActivity() {
  const call = prismaMock.activity.create.mock.calls[0]?.[0] as
    | {
        data: {
          groupId: string;
          actorId: string | null;
          type: string;
          entityType: string | null;
          entityId: string | null;
          metadata?: Record<string, unknown>;
        };
      }
    | undefined;

  if (!call) throw new Error("activity.create was not called");
  return call.data;
}

describe("createExpense", () => {
  it("stores the session actor as creator and uses splitEqual", async () => {
    mockMembership();
    mockActiveMembers(["rafi", "nusrat", "karim"]);
    mockExpenseCreate();

    const result = await createExpense(GROUP_ID, ACTOR_ID, equalInput);

    expect(result).toEqual({ id: EXPENSE_ID });

    const call = prismaMock.expense.create.mock.calls[0]?.[0] as {
      data: {
        createdById: string;
        paidById: string;
        amount: bigint;
        splitType: string;
      };
    };

    expect(call.data.createdById).toBe(ACTOR_ID);
    expect(call.data.paidById).toBe("rafi");
    expect(call.data.amount).toBe(120_000n);

    expect(prismaMock.groupMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          groupId: GROUP_ID,
          leftAt: null,
        }),
      }),
    );

    const allocations = allocationsByUser(createdParticipants());
    expect(allocations.get("rafi")).toBe(40_000n);
    expect(allocations.get("nusrat")).toBe(40_000n);
    expect(allocations.get("karim")).toBe(40_000n);
  });

  it("logs one JSON-safe EXPENSE_CREATED activity with the session actor", async () => {
    mockMembership();
    mockActiveMembers(["rafi", "nusrat", "karim"]);
    mockExpenseCreate();

    await createExpense(GROUP_ID, ACTOR_ID, equalInput);

    expect(prismaMock.activity.create).toHaveBeenCalledOnce();
    const activity = createdActivity();

    expect(activity.groupId).toBe(GROUP_ID);
    expect(activity.actorId).toBe(ACTOR_ID);
    expect(activity.type).toBe("EXPENSE_CREATED");
    expect(activity.entityType).toBe("expense");
    expect(activity.entityId).toBe(EXPENSE_ID);
    expect(activity.metadata).toMatchObject({
      expense: {
        description: "Dinner",
        amount: "1200.00",
        paidByName: "RAFI",
        splitType: "EQUAL",
      },
    });
  });

  it("does not create activity when expense creation fails", async () => {
    mockMembership();
    mockActiveMembers(["rafi", "nusrat", "karim"]);
    prismaMock.expense.create.mockRejectedValue(new Error("insert failed"));

    await expect(
      createExpense(GROUP_ID, ACTOR_ID, equalInput),
    ).rejects.toThrow("insert failed");

    expect(prismaMock.activity.create).not.toHaveBeenCalled();
  });

  it("uses splitExact and preserves exact amounts", async () => {
    mockMembership();
    mockActiveMembers(["rafi", "nusrat", "karim"]);
    mockExpenseCreate();

    await createExpense(GROUP_ID, ACTOR_ID, exactInput);

    const allocations = allocationsByUser(createdParticipants());
    expect(allocations.get("rafi")).toBe(50_000n);
    expect(allocations.get("nusrat")).toBe(30_000n);
    expect(allocations.get("karim")).toBe(20_000n);
    expect(createdParticipants().every((p) => p.splitValue === null)).toBe(true);
  });

  it("uses splitPercentage and stores basis points as splitValue", async () => {
    mockMembership();
    mockActiveMembers(["rafi", "nusrat", "karim"]);
    mockExpenseCreate();

    await createExpense(GROUP_ID, ACTOR_ID, percentageInput);

    const participants = createdParticipants();
    const allocations = allocationsByUser(participants);

    expect(allocations.get("rafi")).toBe(50_000n);
    expect(allocations.get("nusrat")).toBe(30_000n);
    expect(allocations.get("karim")).toBe(20_000n);
    expect(participants.find((p) => p.userId === "rafi")?.splitValue).toBe(5000);
    expect(participants.find((p) => p.userId === "karim")?.splitValue).toBe(2000);
  });

  it("uses splitShares and stores share counts", async () => {
    mockMembership();
    mockActiveMembers(["rafi", "nusrat", "karim"]);
    mockExpenseCreate();

    await createExpense(GROUP_ID, ACTOR_ID, sharesInput);

    const participants = createdParticipants();
    const allocations = allocationsByUser(participants);

    expect(allocations.get("rafi")).toBe(50_000n);
    expect(allocations.get("nusrat")).toBe(25_000n);
    expect(allocations.get("karim")).toBe(25_000n);
    expect(participants.find((p) => p.userId === "rafi")?.splitValue).toBe(2);
  });

  it("rejects a caller who is not an active group member", async () => {
    prismaMock.groupMember.findFirst.mockResolvedValue(null);

    await expect(
      createExpense(GROUP_ID, ACTOR_ID, equalInput),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(prismaMock.groupMember.findMany).not.toHaveBeenCalled();
    expect(prismaMock.expense.create).not.toHaveBeenCalled();
  });

  it("rejects a payer from outside the group", async () => {
    mockMembership();
    // The payer (rafi) is missing from this group.
    mockActiveMembers(["nusrat", "karim"]);

    await expect(
      createExpense(GROUP_ID, ACTOR_ID, equalInput),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(prismaMock.expense.create).not.toHaveBeenCalled();
  });

  it("rejects participants from another group", async () => {
    mockMembership();
    // karim is not an active member here.
    mockActiveMembers(["rafi", "nusrat"]);

    await expect(
      createExpense(GROUP_ID, ACTOR_ID, equalInput),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(prismaMock.expense.create).not.toHaveBeenCalled();
  });

  it("rejects an exact split that does not sum to the total", async () => {
    mockMembership();
    mockActiveMembers(["rafi", "nusrat"]);

    await expect(
      createExpense(GROUP_ID, ACTOR_ID, {
        ...exactInput,
        participants: [
          { userId: "rafi", amount: 50_000n },
          { userId: "nusrat", amount: 40_000n },
        ],
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(prismaMock.expense.create).not.toHaveBeenCalled();
  });

  it("rejects percentages that do not total 100%", async () => {
    mockMembership();
    mockActiveMembers(["rafi", "nusrat"]);

    await expect(
      createExpense(GROUP_ID, ACTOR_ID, {
        ...percentageInput,
        participants: [
          { userId: "rafi", basisPoints: 5000 },
          { userId: "nusrat", basisPoints: 4000 },
        ],
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(prismaMock.expense.create).not.toHaveBeenCalled();
  });

  it("rejects invalid shares", async () => {
    mockMembership();
    mockActiveMembers(["rafi"]);

    await expect(
      createExpense(GROUP_ID, ACTOR_ID, {
        ...sharesInput,
        participants: [{ userId: "rafi", shares: 0 }],
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(prismaMock.expense.create).not.toHaveBeenCalled();
  });

  it("rejects share counts outside the PostgreSQL INTEGER range", async () => {
    mockMembership();
    mockActiveMembers(["rafi"]);

    await expect(
      createExpense(GROUP_ID, ACTOR_ID, {
        ...sharesInput,
        participants: [{ userId: "rafi", shares: 2_147_483_648 }],
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(prismaMock.expense.create).not.toHaveBeenCalled();
  });
});

describe("updateExpense", () => {
  function mockExistingExpense(createdById = CREATOR_ID) {
    prismaMock.expense.findFirst.mockResolvedValue({
      id: EXPENSE_ID,
      createdById,
      description: "Dinner",
      amount: 120_000n,
      expenseDate: new Date(Date.UTC(2026, 10, 3)),
      paidById: "rafi",
      splitType: "EQUAL",
      paidBy: { name: "RAFI" },
      participants: [
        {
          userId: "rafi",
          shareAmount: 40_000n,
          splitValue: null,
          user: { name: "RAFI" },
        },
        {
          userId: "nusrat",
          shareAmount: 40_000n,
          splitValue: null,
          user: { name: "NUSRAT" },
        },
        {
          userId: "karim",
          shareAmount: 40_000n,
          splitValue: null,
          user: { name: "KARIM" },
        },
      ],
    });
    prismaMock.expense.update.mockResolvedValue({ id: EXPENSE_ID });
    prismaMock.expenseParticipant.deleteMany.mockResolvedValue({ count: 3 });
    prismaMock.expenseParticipant.createMany.mockResolvedValue({ count: 3 });
  }

  it("lets the creator replace all allocations in a transaction", async () => {
    mockMembership("MEMBER");
    mockExistingExpense(CREATOR_ID);
    mockActiveMembers(["rafi", "nusrat", "karim"]);

    const result = await updateExpense(
      GROUP_ID,
      CREATOR_ID,
      EXPENSE_ID,
      percentageInput,
    );

    expect(result).toEqual({ id: EXPENSE_ID });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.expense.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: EXPENSE_ID },
        data: expect.objectContaining({
          description: "Hotel",
          amount: 100_000n,
          splitType: "PERCENTAGE",
        }),
      }),
    );
    expect(prismaMock.expenseParticipant.deleteMany).toHaveBeenCalledWith({
      where: { expenseId: EXPENSE_ID },
    });
    // An expense edit must not erase independent settlement records.
    expect(prismaMock.settlement.delete).not.toHaveBeenCalled();
    expect(prismaMock.settlement.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.settlement.updateMany).not.toHaveBeenCalled();

    expect(prismaMock.activity.create).toHaveBeenCalledOnce();
    const activity = createdActivity();
    expect(activity.type).toBe("EXPENSE_UPDATED");
    expect(activity.entityId).toBe(EXPENSE_ID);
    expect(activity.actorId).toBe(CREATOR_ID);

    const metadata = activity.metadata as {
      before: { amount: string; description: string; splitType: string };
      after: { amount: string; description: string; splitType: string };
    };
    expect(metadata.before).toMatchObject({
      description: "Dinner",
      amount: "1200.00",
      splitType: "EQUAL",
    });
    expect(metadata.after).toMatchObject({
      description: "Hotel",
      amount: "1000.00",
      splitType: "PERCENTAGE",
    });

    const createManyCall = prismaMock.expenseParticipant.createMany.mock
      .calls[0]?.[0] as {
      data: Array<ParticipantCreate & { expenseId: string }>;
    };

    const allocations = new Map(
      createManyCall.data.map((participant) => [
        participant.userId,
        participant.shareAmount,
      ]),
    );

    expect(allocations.get("rafi")).toBe(50_000n);
    expect(allocations.get("nusrat")).toBe(30_000n);
    expect(allocations.get("karim")).toBe(20_000n);
  });

  it("lets a group admin edit another member's expense", async () => {
    mockMembership("ADMIN");
    mockExistingExpense(CREATOR_ID);
    mockActiveMembers(["rafi", "nusrat", "karim"]);

    await expect(
      updateExpense(GROUP_ID, ACTOR_ID, EXPENSE_ID, equalInput),
    ).resolves.toEqual({ id: EXPENSE_ID });
  });

  it("forbids an ordinary member who did not create the expense", async () => {
    mockMembership("MEMBER");
    mockExistingExpense(CREATOR_ID);
    mockActiveMembers(["rafi", "nusrat", "karim"]);

    await expect(
      updateExpense(GROUP_ID, ACTOR_ID, EXPENSE_ID, equalInput),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(prismaMock.expense.update).not.toHaveBeenCalled();
  });

  it("returns not found for an expense in another group", async () => {
    mockMembership("ADMIN");
    prismaMock.expense.findFirst.mockResolvedValue(null);

    await expect(
      updateExpense(GROUP_ID, ACTOR_ID, EXPENSE_ID, equalInput),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(prismaMock.expense.update).not.toHaveBeenCalled();
  });

  it("does not create activity when the update fails", async () => {
    mockMembership("MEMBER");
    mockExistingExpense(CREATOR_ID);
    mockActiveMembers(["rafi", "nusrat", "karim"]);
    prismaMock.expense.update.mockRejectedValue(new Error("update failed"));

    await expect(
      updateExpense(GROUP_ID, CREATOR_ID, EXPENSE_ID, equalInput),
    ).rejects.toThrow("update failed");

    expect(prismaMock.activity.create).not.toHaveBeenCalled();
  });

  it("recalculates exact splits on update", async () => {
    mockMembership("MEMBER");
    mockExistingExpense(CREATOR_ID);
    mockActiveMembers(["rafi", "nusrat", "karim"]);

    await updateExpense(GROUP_ID, CREATOR_ID, EXPENSE_ID, exactInput);

    const createManyCall = prismaMock.expenseParticipant.createMany.mock
      .calls[0]?.[0] as {
      data: Array<ParticipantCreate & { expenseId: string }>;
    };

    expect(createManyCall.data).toHaveLength(3);
    expect(
      createManyCall.data.reduce((sum, p) => sum + p.shareAmount, 0n),
    ).toBe(100_000n);
  });
});

describe("deleteExpense", () => {
  function mockExistingExpense(createdById = CREATOR_ID) {
    prismaMock.expense.findFirst.mockResolvedValue({
      id: EXPENSE_ID,
      createdById,
      description: "Dinner",
      amount: 120_000n,
      expenseDate: new Date(Date.UTC(2026, 10, 3)),
      paidById: "rafi",
      splitType: "EQUAL",
      paidBy: { name: "RAFI" },
      participants: [
        {
          userId: "rafi",
          shareAmount: 40_000n,
          splitValue: null,
          user: { name: "RAFI" },
        },
        {
          userId: "nusrat",
          shareAmount: 40_000n,
          splitValue: null,
          user: { name: "NUSRAT" },
        },
        {
          userId: "karim",
          shareAmount: 40_000n,
          splitValue: null,
          user: { name: "KARIM" },
        },
      ],
    });
    prismaMock.expense.delete.mockResolvedValue({ id: EXPENSE_ID });
  }

  it("lets the creator delete and preserves a snapshot in activity", async () => {
    mockMembership("MEMBER");
    mockExistingExpense(CREATOR_ID);

    await deleteExpense(GROUP_ID, CREATOR_ID, EXPENSE_ID);

    expect(prismaMock.expense.delete).toHaveBeenCalledWith({
      where: { id: EXPENSE_ID },
    });
    // Settlements are historical records and are independent of expenses.
    expect(prismaMock.settlement.delete).not.toHaveBeenCalled();
    expect(prismaMock.settlement.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.settlement.updateMany).not.toHaveBeenCalled();

    expect(prismaMock.activity.create).toHaveBeenCalledOnce();
    const activity = createdActivity();
    expect(activity.type).toBe("EXPENSE_DELETED");
    expect(activity.entityType).toBe("expense");
    expect(activity.entityId).toBe(EXPENSE_ID);
    expect(activity.metadata).toMatchObject({
      expense: {
        description: "Dinner",
        amount: "1200.00",
        expenseDate: "2026-11-03",
        paidByName: "RAFI",
        participants: [
          { userId: "karim", name: "KARIM", shareAmount: "400.00" },
          { userId: "nusrat", name: "NUSRAT", shareAmount: "400.00" },
          { userId: "rafi", name: "RAFI", shareAmount: "400.00" },
        ],
      },
    });
  });

  it("does not create activity when deletion fails", async () => {
    mockMembership("MEMBER");
    mockExistingExpense(CREATOR_ID);
    prismaMock.expense.delete.mockRejectedValue(new Error("delete failed"));

    await expect(
      deleteExpense(GROUP_ID, CREATOR_ID, EXPENSE_ID),
    ).rejects.toThrow("delete failed");

    expect(prismaMock.activity.create).not.toHaveBeenCalled();
  });

  it("lets a group admin delete another member's expense", async () => {
    mockMembership("ADMIN");
    mockExistingExpense(CREATOR_ID);

    await deleteExpense(GROUP_ID, ACTOR_ID, EXPENSE_ID);

    expect(prismaMock.expense.delete).toHaveBeenCalled();
  });

  it("forbids an ordinary member who did not create the expense", async () => {
    mockMembership("MEMBER");
    mockExistingExpense(CREATOR_ID);

    await expect(
      deleteExpense(GROUP_ID, ACTOR_ID, EXPENSE_ID),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(prismaMock.expense.delete).not.toHaveBeenCalled();
  });

  it("returns not found for an expense in another group", async () => {
    mockMembership("ADMIN");
    prismaMock.expense.findFirst.mockResolvedValue(null);

    await expect(
      deleteExpense(GROUP_ID, ACTOR_ID, EXPENSE_ID),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(prismaMock.expense.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: EXPENSE_ID, groupId: GROUP_ID },
      }),
    );
    expect(prismaMock.expense.delete).not.toHaveBeenCalled();
  });
});

describe("listExpensesForGroup", () => {
  it("returns serializable amounts and newest-first ordering", async () => {
    mockMembership("MEMBER");
    prismaMock.expense.findMany.mockResolvedValue([
      {
        id: EXPENSE_ID,
        description: "Dinner",
        amount: 120_000n,
        expenseDate: new Date(Date.UTC(2026, 10, 3)),
        splitType: "EQUAL",
        createdById: CREATOR_ID,
        paidBy: { id: "rafi", name: "Rafi" },
        createdBy: { id: CREATOR_ID, name: "Creator" },
        participants: [
          { userId: "rafi", user: { name: "Rafi" } },
          { userId: "nusrat", user: { name: "Nusrat" } },
        ],
      },
    ]);

    const expenses = await listExpensesForGroup(GROUP_ID, ACTOR_ID);

    expect(prismaMock.expense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { groupId: GROUP_ID },
        orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
      }),
    );
    expect(expenses).toHaveLength(1);
    expect(expenses[0].amount).toBe("1200.00");
    expect(expenses[0].expenseDate).toBe("2026-11-03");
    expect(expenses[0].participants).toHaveLength(2);
    expect(expenses[0].canManage).toBe(false);
  });

  it("shows manage permission for a group admin", async () => {
    mockMembership("ADMIN");
    prismaMock.expense.findMany.mockResolvedValue([
      {
        id: EXPENSE_ID,
        description: "Dinner",
        amount: 120_000n,
        expenseDate: new Date(Date.UTC(2026, 10, 3)),
        splitType: "EQUAL",
        createdById: CREATOR_ID,
        paidBy: { id: "rafi", name: "Rafi" },
        createdBy: { id: CREATOR_ID, name: "Creator" },
        participants: [],
      },
    ]);

    const expenses = await listExpensesForGroup(GROUP_ID, ACTOR_ID);

    expect(expenses[0].canManage).toBe(true);
  });

  it("rejects a non-member", async () => {
    prismaMock.groupMember.findFirst.mockResolvedValue(null);

    await expect(
      listExpensesForGroup(GROUP_ID, ACTOR_ID),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(prismaMock.expense.findMany).not.toHaveBeenCalled();
  });
});

describe("getExpenseForMember", () => {
  function mockExpenseDetail(createdById = CREATOR_ID) {
    prismaMock.expense.findFirst.mockResolvedValue({
      id: EXPENSE_ID,
      groupId: GROUP_ID,
      description: "Dinner",
      amount: 120_000n,
      expenseDate: new Date(Date.UTC(2026, 10, 3)),
      splitType: "EQUAL",
      createdAt: new Date(Date.UTC(2026, 10, 3, 12, 0, 0)),
      updatedAt: new Date(Date.UTC(2026, 10, 3, 12, 0, 0)),
      createdById,
      group: { name: "Flat 3B" },
      paidBy: { id: "rafi", name: "Rafi", email: "rafi@example.com" },
      createdBy: {
        id: createdById,
        name: "Creator",
        email: "creator@example.com",
      },
      participants: [
        {
          userId: "rafi",
          shareAmount: 40_000n,
          splitValue: null,
          user: { name: "Rafi", email: "rafi@example.com" },
        },
        {
          userId: "nusrat",
          shareAmount: 40_000n,
          splitValue: null,
          user: { name: "Nusrat", email: "nusrat@example.com" },
        },
        {
          userId: "karim",
          shareAmount: 40_000n,
          splitValue: null,
          user: { name: "Karim", email: "karim@example.com" },
        },
      ],
    });
  }

  it("returns full details with safe decimal amounts", async () => {
    mockMembership("MEMBER");
    mockExpenseDetail(CREATOR_ID);

    const expense = await getExpenseForMember(
      GROUP_ID,
      EXPENSE_ID,
      CREATOR_ID,
    );

    expect(expense.amount).toBe("1200.00");
    expect(expense.groupName).toBe("Flat 3B");
    expect(expense.participants[0].shareAmount).toBe("400.00");
    expect(expense.canManage).toBe(true);
  });

  it("does not expose an expense from another group", async () => {
    mockMembership("ADMIN");
    prismaMock.expense.findFirst.mockResolvedValue(null);

    await expect(
      getExpenseForMember(GROUP_ID, EXPENSE_ID, ACTOR_ID),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(prismaMock.expense.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: EXPENSE_ID, groupId: GROUP_ID },
      }),
    );
  });

  it("rejects a non-member before reading expense data", async () => {
    prismaMock.groupMember.findFirst.mockResolvedValue(null);

    await expect(
      getExpenseForMember(GROUP_ID, EXPENSE_ID, ACTOR_ID),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(prismaMock.expense.findFirst).not.toHaveBeenCalled();
  });
});
