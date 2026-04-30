CREATE TYPE "ScoreRemedialStatus" AS ENUM (
    'DRAFT',
    'RECORDED',
    'PASSED',
    'STILL_BELOW_KKM',
    'CANCELLED'
);

CREATE TABLE "student_score_remedials" (
    "id" SERIAL NOT NULL,
    "scoreEntryId" INTEGER NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "originalScore" DOUBLE PRECISION NOT NULL,
    "previousEffectiveScore" DOUBLE PRECISION,
    "remedialScore" DOUBLE PRECISION NOT NULL,
    "effectiveScore" DOUBLE PRECISION NOT NULL,
    "kkm" INTEGER NOT NULL,
    "status" "ScoreRemedialStatus" NOT NULL DEFAULT 'RECORDED',
    "note" TEXT,
    "recordedById" INTEGER,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_score_remedials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "student_score_remedials_scoreEntryId_attemptNumber_key"
    ON "student_score_remedials"("scoreEntryId", "attemptNumber");

CREATE INDEX "student_score_remedials_scoreEntryId_status_idx"
    ON "student_score_remedials"("scoreEntryId", "status");

CREATE INDEX "student_score_remedials_recordedById_recordedAt_idx"
    ON "student_score_remedials"("recordedById", "recordedAt");

ALTER TABLE "student_score_remedials"
    ADD CONSTRAINT "student_score_remedials_scoreEntryId_fkey"
    FOREIGN KEY ("scoreEntryId") REFERENCES "student_score_entries"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
