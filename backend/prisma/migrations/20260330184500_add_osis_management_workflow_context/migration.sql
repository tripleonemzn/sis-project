-- AlterTable
ALTER TABLE "osis_management_periods"
ADD COLUMN "electionPeriodId" INTEGER,
ADD COLUMN "transitionAt" TIMESTAMP(3),
ADD COLUMN "transitionLabel" TEXT,
ADD COLUMN "transitionNotes" TEXT;

-- CreateIndex
CREATE INDEX "osis_management_periods_academicYearId_electionPeriodId_idx"
ON "osis_management_periods"("academicYearId", "electionPeriodId");

-- AddForeignKey
ALTER TABLE "osis_management_periods"
ADD CONSTRAINT "osis_management_periods_electionPeriodId_fkey"
FOREIGN KEY ("electionPeriodId") REFERENCES "osis_election_periods"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
