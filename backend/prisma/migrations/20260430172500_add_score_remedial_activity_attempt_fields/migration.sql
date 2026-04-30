ALTER TABLE "student_score_remedials"
    ADD COLUMN "activityAnswers" JSONB,
    ADD COLUMN "activityStartedAt" TIMESTAMP(3),
    ADD COLUMN "activitySubmittedAt" TIMESTAMP(3);

CREATE INDEX "student_score_remedials_activitySubmittedAt_idx"
    ON "student_score_remedials"("activitySubmittedAt");
