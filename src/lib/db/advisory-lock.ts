import "server-only";

import type { Prisma } from "@/generated/prisma/client";

/**
 * Acquires a transaction-scoped PostgreSQL advisory lock.
 *
 * pg_advisory_xact_lock returns void, which Prisma's pg adapter cannot
 * deserialize. Casting the result to text keeps the lock behavior unchanged
 * while giving the driver a supported column type. The value itself is unused;
 * PostgreSQL releases the lock automatically when the transaction ends.
 */
export async function acquireAdvisoryLock(
  tx: Prisma.TransactionClient,
  key: string,
): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key})::bigint)::text AS locked`;
}
