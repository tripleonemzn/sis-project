DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'DailyPresenceEventType'
  ) THEN
    CREATE TYPE "DailyPresenceEventType" AS ENUM ('CHECK_IN', 'CHECK_OUT');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'DailyPresenceCaptureSource'
  ) THEN
    CREATE TYPE "DailyPresenceCaptureSource" AS ENUM (
      'SELF_SCAN',
      'ASSISTED_SCAN',
      'MANUAL_ADJUSTMENT',
      'LEGACY_DAILY'
    );
  END IF;
END
$$;

ALTER TABLE "daily_attendances"
  ADD COLUMN IF NOT EXISTS "checkInTime" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "checkOutTime" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "checkInSource" "DailyPresenceCaptureSource",
  ADD COLUMN IF NOT EXISTS "checkOutSource" "DailyPresenceCaptureSource",
  ADD COLUMN IF NOT EXISTS "checkInReason" TEXT,
  ADD COLUMN IF NOT EXISTS "checkOutReason" TEXT,
  ADD COLUMN IF NOT EXISTS "checkInActorId" INTEGER,
  ADD COLUMN IF NOT EXISTS "checkOutActorId" INTEGER,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'daily_attendances_checkInActorId_fkey'
  ) THEN
    ALTER TABLE "daily_attendances"
      ADD CONSTRAINT "daily_attendances_checkInActorId_fkey"
      FOREIGN KEY ("checkInActorId") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'daily_attendances_checkOutActorId_fkey'
  ) THEN
    ALTER TABLE "daily_attendances"
      ADD CONSTRAINT "daily_attendances_checkOutActorId_fkey"
      FOREIGN KEY ("checkOutActorId") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "daily_attendances_studentId_date_idx"
  ON "daily_attendances" ("studentId", "date");

CREATE INDEX IF NOT EXISTS "daily_attendances_classId_academicYearId_date_idx"
  ON "daily_attendances" ("classId", "academicYearId", "date");

CREATE TABLE IF NOT EXISTS "daily_presence_events" (
  "id" SERIAL NOT NULL,
  "dailyAttendanceId" INTEGER,
  "studentId" INTEGER NOT NULL,
  "classId" INTEGER NOT NULL,
  "academicYearId" INTEGER NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "eventType" "DailyPresenceEventType" NOT NULL,
  "source" "DailyPresenceCaptureSource" NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reason" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "gateLabel" TEXT,
  "actorId" INTEGER,

  CONSTRAINT "daily_presence_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "daily_presence_events_dailyAttendanceId_fkey"
    FOREIGN KEY ("dailyAttendanceId") REFERENCES "daily_attendances"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "daily_presence_events_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "daily_presence_events_classId_fkey"
    FOREIGN KEY ("classId") REFERENCES "classes"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "daily_presence_events_academicYearId_fkey"
    FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "daily_presence_events_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "daily_presence_events_academicYearId_date_recordedAt_idx"
  ON "daily_presence_events" ("academicYearId", "date", "recordedAt");

CREATE INDEX IF NOT EXISTS "daily_presence_events_studentId_date_recordedAt_idx"
  ON "daily_presence_events" ("studentId", "date", "recordedAt");

CREATE INDEX IF NOT EXISTS "daily_presence_events_source_recordedAt_idx"
  ON "daily_presence_events" ("source", "recordedAt");
