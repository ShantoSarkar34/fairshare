import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { recordActivity } from "@/lib/services/activity.service";
import { getActiveMembership, requireAdmin } from "@/lib/services/group-access";

export const INVITE_TTL_DAYS = 7;
const INVITE_TTL_MS = INVITE_TTL_DAYS * 24 * 60 * 60 * 1000;
const INVALID_INVITE_MESSAGE = "This invite link is invalid or has expired.";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/**
 * Creates a new invite and revokes all earlier active ones, in one transaction.
 * The raw token is returned ONCE and never stored: only its hash is saved.
 */
export async function createInvite(groupId: string, userId: string) {
  await requireAdmin(groupId, userId);

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  await prisma.$transaction(async (tx) => {
    const revoked = await tx.groupInvite.updateMany({
      where: { groupId, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date() },
    });

    const invite = await tx.groupInvite.create({
      data: {
        groupId,
        tokenHash: hashToken(token),
        createdById: userId,
        expiresAt,
      },
      select: { id: true },
    });

    // Exactly one activity per create operation. A regeneration is represented
    // by its own action instead of logging both "created" and "regenerated".
    await recordActivity(tx, {
      groupId,
      actorId: userId,
      action: revoked.count > 0 ? "INVITE_REGENERATED" : "INVITE_CREATED",
      entityType: "invite",
      entityId: invite.id,
      metadata: { expiresAt: expiresAt.toISOString() },
    });
  });

  return { token, expiresAt };
}

/** Revokes every active invite of the group. Returns how many were revoked. */
export async function revokeInvites(groupId: string, userId: string) {
  await requireAdmin(groupId, userId);

  const result = await prisma.groupInvite.updateMany({
    where: { groupId, revokedAt: null, expiresAt: { gt: new Date() } },
    data: { revokedAt: new Date() },
  });

  return result.count;
}

/** Admin-only: is there an active invite, and when does it expire? */
export async function getInviteSummary(groupId: string, userId: string) {
  await requireAdmin(groupId, userId);

  return prisma.groupInvite.findFirst({
    where: { groupId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { expiresAt: true },
  });
}

async function findValidInvite(token: string) {
  const invite = await prisma.groupInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      revokedAt: true,
      expiresAt: true,
      group: {
        select: {
          id: true,
          name: true,
          _count: { select: { members: { where: { leftAt: null } } } },
        },
      },
    },
  });

  // Same message for unknown, revoked and expired: nothing is revealed.
  if (!invite || invite.revokedAt !== null || invite.expiresAt <= new Date()) {
    throw new NotFoundError(INVALID_INVITE_MESSAGE);
  }

  return invite;
}

/** What the join page shows. Reveals the group name only for a valid token. */
export async function previewInvite(token: string, userId: string) {
  const invite = await findValidInvite(token);
  const membership = await getActiveMembership(invite.group.id, userId);

  return {
    groupId: invite.group.id,
    groupName: invite.group.name,
    memberCount: invite.group._count.members,
    alreadyMember: membership !== null,
  };
}

/** Adds the user to the group. Re-activates a previous membership if there is one. */
export async function acceptInvite(token: string, userId: string) {
  const invite = await findValidInvite(token);
  const groupId = invite.group.id;

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId } },
        select: { id: true, leftAt: true },
      });

      if (existing && existing.leftAt === null) {
        throw new ConflictError("You are already a member of this group.");
      }

      if (existing) {
        await tx.groupMember.update({
          where: { id: existing.id },
          data: { leftAt: null, role: "MEMBER", joinedAt: new Date() },
        });
      } else {
        await tx.groupMember.create({
          data: { groupId, userId, role: "MEMBER" },
        });
      }

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });

      // One event for the join: the invitation was accepted and the member
      // joined. Snapshot the name and whether this re-activated an old row.
      await recordActivity(tx, {
        groupId,
        actorId: userId,
        action: "INVITE_ACCEPTED",
        entityType: "member",
        entityId: userId,
        metadata: {
          name: user?.name ?? "Member",
          viaInvite: true,
          rejoined: existing !== null,
        },
      });
    });
  } catch (error) {
    // Two simultaneous joins can hit the unique constraint.
    if (isUniqueViolation(error)) {
      throw new ConflictError("You are already a member of this group.");
    }
    throw error;
  }

  return { groupId };
}
