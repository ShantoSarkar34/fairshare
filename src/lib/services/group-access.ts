import "server-only";

import { prisma } from "@/lib/db/prisma";
import { ForbiddenError, NotFoundError } from "@/lib/errors";

/**
 * Returns the user's ACTIVE membership of the group, or null.
 * "Active" means leftAt is null. Removed or departed members have no access.
 */
export async function getActiveMembership(groupId: string, userId: string) {
  return prisma.groupMember.findFirst({
    where: { groupId, userId, leftAt: null },
    select: { id: true, role: true },
  });
}

/**
 * Throws NotFoundError (not Forbidden) for non-members, so a stranger cannot
 * tell the difference between "group exists but is not mine" and "no such group".
 */
export async function requireMembership(groupId: string, userId: string) {
  const membership = await getActiveMembership(groupId, userId);
  if (!membership) {
    throw new NotFoundError("Group not found");
  }
  return membership;
}

/** Requires an active membership with the ADMIN role. */
export async function requireAdmin(groupId: string, userId: string) {
  const membership = await requireMembership(groupId, userId);
  if (membership.role !== "ADMIN") {
    throw new ForbiddenError("Only group admins can do this");
  }
  return membership;
}
