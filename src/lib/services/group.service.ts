import "server-only";

import { prisma } from "@/lib/db/prisma";
import { NotFoundError } from "@/lib/errors";
import { requireMembership } from "@/lib/services/group-access";
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

    await tx.activity.create({
      data: {
        groupId: group.id,
        actorId: userId,
        type: "GROUP_CREATED",
        entityType: "group",
        entityId: group.id,
        metadata: { name: input.name },
      },
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
