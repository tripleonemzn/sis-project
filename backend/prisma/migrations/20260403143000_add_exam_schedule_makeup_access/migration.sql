CREATE TABLE "exam_schedule_makeup_accesses" (
    "id" SERIAL NOT NULL,
    "scheduleId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "grantedById" INTEGER NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedById" INTEGER,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_schedule_makeup_accesses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "exam_schedule_makeup_accesses_scheduleId_studentId_key"
ON "exam_schedule_makeup_accesses"("scheduleId", "studentId");

CREATE INDEX "exam_schedule_makeup_accesses_scheduleId_isActive_startTime_idx"
ON "exam_schedule_makeup_accesses"("scheduleId", "isActive", "startTime");

CREATE INDEX "exam_schedule_makeup_accesses_studentId_isActive_endTime_idx"
ON "exam_schedule_makeup_accesses"("studentId", "isActive", "endTime");

ALTER TABLE "exam_schedule_makeup_accesses"
ADD CONSTRAINT "exam_schedule_makeup_accesses_scheduleId_fkey"
FOREIGN KEY ("scheduleId") REFERENCES "exam_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "exam_schedule_makeup_accesses"
ADD CONSTRAINT "exam_schedule_makeup_accesses_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "exam_schedule_makeup_accesses"
ADD CONSTRAINT "exam_schedule_makeup_accesses_grantedById_fkey"
FOREIGN KEY ("grantedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exam_schedule_makeup_accesses"
ADD CONSTRAINT "exam_schedule_makeup_accesses_revokedById_fkey"
FOREIGN KEY ("revokedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
