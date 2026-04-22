DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'CommitteeAssignmentMemberType'
  ) THEN
    CREATE TYPE "CommitteeAssignmentMemberType" AS ENUM ('INTERNAL_USER', 'EXTERNAL_MEMBER');
  END IF;
END
$$;

ALTER TABLE "committee_assignments"
  ADD COLUMN IF NOT EXISTS "memberType" "CommitteeAssignmentMemberType" NOT NULL DEFAULT 'INTERNAL_USER',
  ADD COLUMN IF NOT EXISTS "externalName" TEXT,
  ADD COLUMN IF NOT EXISTS "externalInstitution" TEXT;

ALTER TABLE "committee_assignments"
  ALTER COLUMN "userId" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "committee_assignments_memberType_idx"
  ON "committee_assignments" ("memberType");
