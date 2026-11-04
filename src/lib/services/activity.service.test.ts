import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotFoundError, ValidationError } from "@/lib/errors";
import { getGroupActivityPage } from "@/lib/services/activity.service";

const prismaMock = vi.hoisted(() => ({
  groupMember: {
    findFirst: vi.fn(),
  },
  activity: {
    findMany: vi.fn(),
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

const GROUP_ID = "group_1";
const USER_ID = "user_member";

function row(
  index: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: `activity_${index}`,
    type: "EXPENSE_CREATED",
    entityType: "expense",
    entityId: `expense_${index}`,
    metadata: { expense: { description: `Expense ${index}` } },
    createdAt: new Date(Date.UTC(2026, 10, 4, 12, 0, 21 - index)),
    actor: { id: "user_actor", name: "Rafi" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.groupMember.findFirst.mockResolvedValue({
    id: "membership_1",
    role: "MEMBER",
  });
  prismaMock.activity.findMany.mockResolvedValue([]);
});

describe("getGroupActivityPage authorization", () => {
  it("rejects an unauthenticated/unknown user as a missing group", async () => {
    prismaMock.groupMember.findFirst.mockResolvedValue(null);

    await expect(
      getGroupActivityPage(GROUP_ID, "stranger", { limit: 10 }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(prismaMock.activity.findMany).not.toHaveBeenCalled();
  });

  it("queries only the requested group after membership is verified", async () => {
    await getGroupActivityPage(GROUP_ID, USER_ID, { limit: 10 });

    expect(prismaMock.groupMember.findFirst).toHaveBeenCalledWith({
      where: { groupId: GROUP_ID, userId: USER_ID, leftAt: null },
      select: { id: true, role: true },
    });
    expect(prismaMock.activity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { groupId: GROUP_ID },
      }),
    );
  });

  it("prevents crossing from a member group into another group", async () => {
    const otherGroupId = "group_other";
    prismaMock.groupMember.findFirst.mockImplementation(
      async (args: { where: { groupId: string } }) =>
        args.where.groupId === GROUP_ID
          ? { id: "membership_1", role: "MEMBER" }
          : null,
    );

    await expect(
      getGroupActivityPage(otherGroupId, USER_ID, { limit: 10 }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(prismaMock.activity.findMany).not.toHaveBeenCalled();
  });
});

describe("getGroupActivityPage retrieval", () => {
  it("returns newest-first activity with actor and server-formatted time", async () => {
    prismaMock.activity.findMany.mockResolvedValue([row(0), row(1)]);

    const page = await getGroupActivityPage(GROUP_ID, USER_ID, { limit: 10 });

    expect(prismaMock.activity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 11,
      }),
    );
    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({
      id: "activity_0",
      action: "EXPENSE_CREATED",
      actor: { id: "user_actor", name: "Rafi" },
      entityType: "expense",
      entityId: "expense_0",
    });
    expect(page.items[0].createdAtLabel).toEqual(expect.any(String));
    expect(page.nextCursor).toBeNull();
    expect(page.hasMore).toBe(false);
  });

  it("caps the page, sets a cursor, and fetches the next page with a keyset filter", async () => {
    const firstPageRows = Array.from({ length: 21 }, (_, index) => row(index));
    prismaMock.activity.findMany.mockResolvedValueOnce(firstPageRows);

    const firstPage = await getGroupActivityPage(GROUP_ID, USER_ID, {
      limit: 20,
    });

    expect(firstPage.items).toHaveLength(20);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.nextCursor).toEqual(expect.any(String));

    prismaMock.activity.findMany.mockResolvedValueOnce([
      row(20, { id: "activity_20" }),
    ]);

    const secondPage = await getGroupActivityPage(GROUP_ID, USER_ID, {
      limit: 20,
      cursor: firstPage.nextCursor ?? undefined,
    });

    expect(secondPage.items).toHaveLength(1);

    const secondQuery = prismaMock.activity.findMany.mock.calls[1]?.[0] as {
      where: {
        groupId: string;
        OR: Array<{
          createdAt?: { lt: Date };
          id?: { lt: string };
        }>;
      };
      take: number;
    };

    expect(secondQuery.where.groupId).toBe(GROUP_ID);
    expect(secondQuery.where.OR).toHaveLength(2);
    expect(secondQuery.where.OR[0]?.createdAt?.lt).toEqual(
      firstPageRows[19].createdAt,
    );
    expect(secondQuery.where.OR[1]?.id?.lt).toBe("activity_19");
    expect(secondQuery.take).toBe(21);
  });

  it("returns an empty page when the group has no activity", async () => {
    const page = await getGroupActivityPage(GROUP_ID, USER_ID);

    expect(page).toEqual({
      items: [],
      nextCursor: null,
      hasMore: false,
    });
  });

  it("keeps deleted entities readable and tolerates a deleted actor", async () => {
    prismaMock.activity.findMany.mockResolvedValue([
      row(0, {
        type: "EXPENSE_DELETED",
        actor: null,
        entityId: "deleted_expense",
        metadata: {
          expense: {
            description: "Deleted dinner",
            amount: "1200.00",
          },
        },
      }),
    ]);

    const page = await getGroupActivityPage(GROUP_ID, USER_ID, { limit: 10 });

    expect(page.items[0].actor).toBeNull();
    expect(page.items[0].entityId).toBe("deleted_expense");
    expect(page.items[0].metadata).toMatchObject({
      expense: { description: "Deleted dinner", amount: "1200.00" },
    });
  });

  it("strips sensitive keys from stored metadata before returning it", async () => {
    prismaMock.activity.findMany.mockResolvedValue([
      row(0, {
        metadata: {
          name: "Safe",
          token: "do-not-expose",
          nested: { password: "secret", safe: "visible" },
        },
      }),
    ]);

    const page = await getGroupActivityPage(GROUP_ID, USER_ID, { limit: 10 });

    expect(page.items[0].metadata).toEqual({
      name: "Safe",
      nested: { safe: "visible" },
    });
  });

  it("rejects invalid pagination before querying activity", async () => {
    await expect(
      getGroupActivityPage(GROUP_ID, USER_ID, { limit: 51 }),
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      getGroupActivityPage(GROUP_ID, USER_ID, { cursor: "not-a-cursor" }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(prismaMock.activity.findMany).not.toHaveBeenCalled();
  });
});
