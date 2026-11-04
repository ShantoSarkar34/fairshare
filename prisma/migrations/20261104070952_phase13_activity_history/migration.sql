-- Phase 13: activity history and audit trail.
-- Additive only: existing activity rows keep their actor and metadata.

-- Explicit invitation lifecycle actions. MEMBER_JOINED remains for any future
-- direct membership-add flow; invite acceptance is recorded as INVITE_ACCEPTED.
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'INVITE_CREATED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'INVITE_ACCEPTED';

-- System-generated events may have no actor. If a user is deleted, keep the
-- historical activity and clear the reference instead of deleting history.
ALTER TABLE "activities" DROP CONSTRAINT IF EXISTS "activities_actorId_fkey";
ALTER TABLE "activities" ALTER COLUMN "actorId" DROP NOT NULL;
ALTER TABLE "activities" ADD CONSTRAINT "activities_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Supports history lookups by the entity referenced in the (non-FK) snapshot.
CREATE INDEX IF NOT EXISTS "activities_entityType_entityId_idx"
  ON "activities"("entityType", "entityId");
