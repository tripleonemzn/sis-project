ALTER TABLE "student_score_remedials"
    ADD COLUMN "activityExamPacketId" INTEGER,
    ADD COLUMN "activitySourceExamPacketId" INTEGER;

CREATE INDEX "student_score_remedials_activityExamPacketId_idx"
    ON "student_score_remedials"("activityExamPacketId");

CREATE INDEX "student_score_remedials_activitySourceExamPacketId_idx"
    ON "student_score_remedials"("activitySourceExamPacketId");
