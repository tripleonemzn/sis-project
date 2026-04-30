CREATE TYPE "ScoreRemedialMethod" AS ENUM (
    'MANUAL_SCORE',
    'ASSIGNMENT',
    'QUESTION_SET'
);

ALTER TABLE "student_score_remedials"
    ADD COLUMN "method" "ScoreRemedialMethod" NOT NULL DEFAULT 'MANUAL_SCORE',
    ADD COLUMN "activityTitle" TEXT,
    ADD COLUMN "activityInstructions" TEXT,
    ADD COLUMN "activityDueAt" TIMESTAMP(3),
    ADD COLUMN "activityReferenceUrl" TEXT;

