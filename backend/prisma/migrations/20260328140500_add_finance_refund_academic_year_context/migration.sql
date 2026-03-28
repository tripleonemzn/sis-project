ALTER TABLE "finance_refunds"
ADD COLUMN IF NOT EXISTS "academicYearId" INTEGER;

DO $$ BEGIN
    ALTER TABLE "finance_refunds"
    ADD CONSTRAINT "finance_refunds_academicYearId_fkey"
    FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "finance_refunds_academicYearId_refundedAt_idx"
ON "finance_refunds"("academicYearId", "refundedAt");
