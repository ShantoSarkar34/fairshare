import "server-only";

import { prisma } from "@/lib/db/prisma";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { recordActivity } from "@/lib/services/activity.service";
import { requireAdmin, requireMembership } from "@/lib/services/group-access";
import type { CreateGroupInput } from "@/lib/validations/group";

/**
 * Creates a group, makes the creator its ADMIN and logs the activity,
 * all in ONE transaction: either everything is saved or nothing is.
 */
export async function createGroup(userId: string, input: CreateGroupInput) {
  return prisma.$transaction(async (tx) => {
    const group = await tx.group.create({
      data: {
        name: input.name,
        description: input.description || null,
        createdById: userId,
        members: { create: { userId, role: "ADMIN" } },
      },
      select: { id: true },
    });

    await recordActivity(tx, {
      groupId: group.id,
      actorId: userId,
      action: "GROUP_CREATED",
      entityType: "group",
      entityId: group.id,
      metadata: { name: input.name },
    });

    return group;
  });
}

/** Groups where the user is an ACTIVE member. */
export async function listGroupsForUser(userId: string) {
  const memberships = await prisma.groupMember.findMany({
    where: { userId, leftAt: null },
    orderBy: { joinedAt: "desc" },
    select: {
      role: true,
      group: {
        select: {
          id: true,
          name: true,
          description: true,
          _count: { select: { members: { where: { leftAt: null } } } },
        },
      },
    },
  });

  return memberships.map((membership) => ({
    id: membership.group.id,
    name: membership.group.name,
    description: membership.group.description,
    role: membership.role,
    memberCount: membership.group._count.members,
  }));
}

/**
 * Group details for a member. Throws NotFoundError if the user is not an
 * active member, BEFORE any group data is read.
 */
export async function getGroupForMember(groupId: string, userId: string) {
  const membership = await requireMembership(groupId, userId);

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
      members: {
        where: { leftAt: null },
        orderBy: { joinedAt: "asc" },
        select: {
          id: true,
          role: true,
          joinedAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  if (!group) {
    throw new NotFoundError("Group not found");
  }

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    createdAt: group.createdAt,
    currentUserRole: membership.role,
    members: group.members.map((member) => ({
      id: member.id,
      userId: member.user.id,
      name: member.user.name,
      email: member.user.email,
      role: member.role,
      joinedAt: member.joinedAt,
    })),
  };
}

/**
 * Admin removes another member. The membership row is kept (leftAt is set),
 * so past expenses and activity stay intact.
 */
export async function removeMember(
  groupId: string,
  actorId: string,
  targetUserId: string,
) {
  await requireAdmin(groupId, actorId);

  // Nobody removes themselves. This also guarantees the group keeps an admin.
  if (targetUserId === actorId) {
    throw new ValidationError("You cannot remove yourself from the group.");
  }

  const target = await prisma.groupMember.findFirst({
    where: { groupId, userId: targetUserId, leftAt: null },
    select: { id: true, user: { select: { name: true } } },
  });

  if (!target) {
    throw new NotFoundError("Member not found in this group.");
  }

  // ---------------------------------------------------------------
  // OPEN ITEM (balances phase): a member whose net balance is not zero
  // must NOT be removable. Add that check HERE before expenses can be
  // created. Today no expenses exist, so every balance is zero.
  // ---------------------------------------------------------------

  await prisma.$transaction(async (tx) => {
    // updateMany with leftAt: null makes a double-click or race a safe no-op.
    const result = await tx.groupMember.updateMany({
      where: { id: target.id, leftAt: null },
      data: { leftAt: new Date() },
    });

    if (result.count === 0) {
      throw new ConflictError("This member was already removed.");
    }

    await recordActivity(tx, {
      groupId,
      actorId,
      action: "MEMBER_REMOVED",
      entityType: "member",
      entityId: targetUserId,
      // Snapshot the name: the activity must still make sense later.
      metadata: { name: target.user.name },
    });
  });
}

/**
 * Permanently deletes the group and, through cascading foreign keys, its
 * members, invites, expenses, settlements and activity log.
 * The caller must be an ADMIN and must type the exact group name.
 */
export async function deleteGroup(
  groupId: string,
  actorId: string,
  confirmName: string,
) {
  await requireAdmin(groupId, actorId);

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { name: true },
  });

  if (!group) {
    throw new NotFoundError("Group not found");
  }

  if (confirmName.trim() !== group.name) {
    throw new ValidationError("The group name you typed does not match.");
  }

  await prisma.group.delete({ where: { id: groupId } });
}
