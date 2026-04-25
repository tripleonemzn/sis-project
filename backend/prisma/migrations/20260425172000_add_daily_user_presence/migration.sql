-- CreateTable
CREATE TABLE "daily_user_presences" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "userId" INTEGER NOT NULL,
    "academicYearId" INTEGER NOT NULL,
    "role" "Role" NOT NULL,
    "ptkType" TEXT,
    "status" "AttendanceStatus" NOT NULL,
    "note" TEXT,
    "checkInTime" TIMESTAMP(3),
    "checkOutTime" TIMESTAMP(3),
    "checkInSource" "DailyPresenceCaptureSource",
    "checkOutSource" "DailyPresenceCaptureSource",
    "checkInReason" TEXT,
    "checkOutReason" TEXT,
    "checkInActorId" INTEGER,
    "checkOutActorId" INTEGER,
    "checkInLateMinutes" INTEGER NOT NULL DEFAULT 0,
    "checkOutEarlyMinutes" INTEGER NOT NULL DEFAULT 0,
    "scheduleBasis" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_user_presences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_user_presence_events" (
    "id" SERIAL NOT NULL,
    "dailyUserPresenceId" INTEGER,
    "userId" INTEGER NOT NULL,
    "academicYearId" INTEGER NOT NULL,
    "role" "Role" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "eventType" "DailyPresenceEventType" NOT NULL,
    "source" "DailyPresenceCaptureSource" NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "gateLabel" TEXT,
    "actorId" INTEGER,
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "scheduleBasis" JSONB,

    CONSTRAINT "daily_user_presence_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_user_presences_userId_academicYearId_date_key" ON "daily_user_presences"("userId", "academicYearId", "date");

-- CreateIndex
CREATE INDEX "daily_user_presences_academicYearId_date_role_idx" ON "daily_user_presences"("academicYearId", "date", "role");

-- CreateIndex
CREATE INDEX "daily_user_presences_userId_date_idx" ON "daily_user_presences"("userId", "date");

-- CreateIndex
CREATE INDEX "daily_user_presence_events_academicYearId_date_recordedAt_idx" ON "daily_user_presence_events"("academicYearId", "date", "recordedAt");

-- CreateIndex
CREATE INDEX "daily_user_presence_events_userId_date_recordedAt_idx" ON "daily_user_presence_events"("userId", "date", "recordedAt");

-- CreateIndex
CREATE INDEX "daily_user_presence_events_role_recordedAt_idx" ON "daily_user_presence_events"("role", "recordedAt");

-- AddForeignKey
ALTER TABLE "daily_user_presences" ADD CONSTRAINT "daily_user_presences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_user_presences" ADD CONSTRAINT "daily_user_presences_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_user_presences" ADD CONSTRAINT "daily_user_presences_checkInActorId_fkey" FOREIGN KEY ("checkInActorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_user_presences" ADD CONSTRAINT "daily_user_presences_checkOutActorId_fkey" FOREIGN KEY ("checkOutActorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_user_presence_events" ADD CONSTRAINT "daily_user_presence_events_dailyUserPresenceId_fkey" FOREIGN KEY ("dailyUserPresenceId") REFERENCES "daily_user_presences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_user_presence_events" ADD CONSTRAINT "daily_user_presence_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_user_presence_events" ADD CONSTRAINT "daily_user_presence_events_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_user_presence_events" ADD CONSTRAINT "daily_user_presence_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
