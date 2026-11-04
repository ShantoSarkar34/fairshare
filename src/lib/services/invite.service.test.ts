import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  acceptInvite,
  createInvite,
  INVITE_TTL_DAYS,
} from "@/lib/services/invite.service";

const prismaMock = vi.hoisted(() => ({
  groupMember: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  groupInvite: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
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
const TOKEN = "invite-token";

function inviteRecord() {
  return {
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    group: {
      id: GROUP_ID,
      name: "Flatmates",
      _count: { members: 2 },
    },
  };
}

function activityCall() {
  const call = prismaMock.activity.create.mock.calls[0]?.[0] as
    | {
        data: {
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

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.activity.create.mockResolvedValue({ id: "activity_1" });
  prismaMock.user.findUnique.mockResolvedValue({ name: "Nusrat" });
  prismaMock.$transaction.mockImplementation((callback: unknown) => {
    if (typeof callback !== "function") {
      throw new TypeError("Expected a transaction callback");
    }
    return callback(prismaMock);
  });
});

describe("createInvite activity", () => {
  beforeEach(() => {
    prismaMock.groupMember.findFirst.mockResolvedValue({
      id: "membership_admin",
      role: "ADMIN",
    });
    prismaMock.groupInvite.create.mockResolvedValue({ id: "invite_1" });
  });

  it("logs INVITE_CREATED once without storing the raw token", async () => {
    prismaMock.groupInvite.updateMany.mockResolvedValue({ count: 0 });

    const result = await createInvite(GROUP_ID, ACTOR_ID);

    expect(result.token).toEqual(expect.any(String));
    expect(prismaMock.activity.create).toHaveBeenCalledOnce();

    const activity = activityCall();
    expect(activity).toMatchObject({
      groupId: GROUP_ID,
      actorId: ACTOR_ID,
      type: "INVITE_CREATED",
      entityType: "invite",
      entityId: "invite_1",
    });
    expect(activity.metadata).toHaveProperty("expiresAt");
    expect(activity.metadata).not.toHaveProperty("token");
    expect(JSON.stringify(activity.metadata)).not.toContain(result.token);

    const inviteCall = prismaMock.groupInvite.create.mock.calls[0]?.[0] as {
      data: { tokenHash: string; expiresAt: Date };
    };
    expect(inviteCall.data.tokenHash).not.toBe(result.token);
    expect(inviteCall.data.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + (INVITE_TTL_DAYS - 1) * 24 * 60 * 60 * 1000,
    );
  });

  it("uses INVITE_REGENERATED instead of logging two activities", async () => {
    prismaMock.groupInvite.updateMany.mockResolvedValue({ count: 1 });

    await createInvite(GROUP_ID, ACTOR_ID);

    expect(prismaMock.activity.create).toHaveBeenCalledOnce();
    expect(activityCall().type).toBe("INVITE_REGENERATED");
  });

  it("does not log activity when invite creation fails", async () => {
    prismaMock.groupInvite.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.groupInvite.create.mockRejectedValue(new Error("insert failed"));

    await expect(createInvite(GROUP_ID, ACTOR_ID)).rejects.toThrow(
      "insert failed",
    );

    expect(prismaMock.activity.create).not.toHaveBeenCalled();
  });
});

describe("acceptInvite activity", () => {
  beforeEach(() => {
    prismaMock.groupInvite.findUnique.mockResolvedValue(inviteRecord());
  });

  it("logs INVITE_ACCEPTED once with a name snapshot", async () => {
    prismaMock.groupMember.findUnique.mockResolvedValue(null);
    prismaMock.groupMember.create.mockResolvedValue({ id: "membership_1" });

    await expect(acceptInvite(TOKEN, ACTOR_ID)).resolves.toEqual({
      groupId: GROUP_ID,
    });

    expect(prismaMock.activity.create).toHaveBeenCalledOnce();
    expect(activityCall()).toMatchObject({
      groupId: GROUP_ID,
      actorId: ACTOR_ID,
      type: "INVITE_ACCEPTED",
      entityType: "member",
      entityId: ACTOR_ID,
      metadata: {
        name: "Nusrat",
        viaInvite: true,
        rejoined: false,
      },
    });
  });

  it("marks a reactivated membership as rejoined", async () => {
    prismaMock.groupMember.findUnique.mockResolvedValue({
      id: "membership_old",
      leftAt: new Date(Date.UTC(2026, 0, 1)),
    });
    prismaMock.groupMember.update.mockResolvedValue({ id: "membership_old" });

    await acceptInvite(TOKEN, ACTOR_ID);

    expect(prismaMock.activity.create).toHaveBeenCalledOnce();
    expect(activityCall().metadata).toMatchObject({
      viaInvite: true,
      rejoined: true,
    });
  });

  it("does not log activity when joining fails", async () => {
    prismaMock.groupMember.findUnique.mockResolvedValue(null);
    prismaMock.groupMember.create.mockRejectedValue(new Error("insert failed"));

    await expect(acceptInvite(TOKEN, ACTOR_ID)).rejects.toThrow("insert failed");

    expect(prismaMock.activity.create).not.toHaveBeenCalled();
  });
});
