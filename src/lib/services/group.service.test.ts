import { beforeEach, describe, expect, it, vi } from "vitest";

import { createGroup, removeMember } from "@/lib/services/group.service";

const prismaMock = vi.hoisted(() => ({
  group: {
    create: vi.fn(),
  },
  groupMember: {
    findFirst: vi.fn(),
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
const ACTOR_ID = "user_admin";
const TARGET_ID = "user_target";

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

describe("createGroup activity", () => {
  it("writes GROUP_CREATED in the same transaction as the group", async () => {
    prismaMock.group.create.mockResolvedValue({ id: GROUP_ID });

    await createGroup(ACTOR_ID, {
      name: "Flatmates",
      description: "Shared flat",
    });

    expect(prismaMock.$transaction).toHaveBeenCalledOnce();
    expect(prismaMock.activity.create).toHaveBeenCalledOnce();

    const call = prismaMock.activity.create.mock.calls[0]?.[0] as {
      data: {
        actorId: string | null;
        type: string;
        entityType: string | null;
        entityId: string | null;
        metadata: Record<string, unknown>;
      };
    };

    expect(call.data).toMatchObject({
      groupId: GROUP_ID,
      actorId: ACTOR_ID,
      type: "GROUP_CREATED",
      entityType: "group",
      entityId: GROUP_ID,
      metadata: { name: "Flatmates" },
    });
  });

  it("does not create activity when group creation fails", async () => {
    prismaMock.group.create.mockRejectedValue(new Error("insert failed"));

    await expect(
      createGroup(ACTOR_ID, { name: "Flatmates", description: "" }),
    ).rejects.toThrow("insert failed");

    expect(prismaMock.activity.create).not.toHaveBeenCalled();
  });
});

describe("removeMember activity", () => {
  function mockAdminAndTarget() {
    prismaMock.groupMember.findFirst
      .mockResolvedValueOnce({ id: "membership_admin", role: "ADMIN" })
      .mockResolvedValueOnce({
        id: "membership_target",
        user: { name: "Nusrat" },
      });
    prismaMock.groupMember.updateMany.mockResolvedValue({ count: 1 });
  }

  it("writes MEMBER_REMOVED with a name snapshot", async () => {
    mockAdminAndTarget();

    await removeMember(GROUP_ID, ACTOR_ID, TARGET_ID);

    expect(prismaMock.activity.create).toHaveBeenCalledOnce();
    const call = prismaMock.activity.create.mock.calls[0]?.[0] as {
      data: {
        actorId: string | null;
        type: string;
        entityId: string | null;
        metadata: Record<string, unknown>;
      };
    };

    expect(call.data).toMatchObject({
      groupId: GROUP_ID,
      actorId: ACTOR_ID,
      type: "MEMBER_REMOVED",
      entityType: "member",
      entityId: TARGET_ID,
      metadata: { name: "Nusrat" },
    });
  });

  it("does not create activity when the membership update loses the race", async () => {
    mockAdminAndTarget();
    prismaMock.groupMember.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      removeMember(GROUP_ID, ACTOR_ID, TARGET_ID),
    ).rejects.toThrow("already removed");

    expect(prismaMock.activity.create).not.toHaveBeenCalled();
  });
});
