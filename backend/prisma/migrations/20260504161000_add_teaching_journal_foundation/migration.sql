CREATE TYPE "TeachingJournalStatus" AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'REVIEWED'
);

CREATE TYPE "TeachingJournalDeliveryStatus" AS ENUM (
    'COMPLETED',
    'PARTIAL',
    'NOT_DELIVERED',
    'RESCHEDULED'
);

CREATE TYPE "TeachingJournalMode" AS ENUM (
    'REGULAR',
    'SUBSTITUTE',
    'ENRICHMENT',
    'REMEDIAL',
    'ASSESSMENT'
);

CREATE TABLE "teaching_journals" (
    "id" SERIAL NOT NULL,
    "academicYearId" INTEGER NOT NULL,
    "teacherId" INTEGER NOT NULL,
    "reviewerId" INTEGER,
    "teacherAssignmentId" INTEGER NOT NULL,
    "scheduleEntryId" INTEGER NOT NULL,
    "classId" INTEGER NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "journalDate" TIMESTAMP(3) NOT NULL,
    "period" INTEGER NOT NULL,
    "room" TEXT,
    "teachingMode" "TeachingJournalMode" NOT NULL DEFAULT 'REGULAR',
    "deliveryStatus" "TeachingJournalDeliveryStatus" NOT NULL DEFAULT 'COMPLETED',
    "status" "TeachingJournalStatus" NOT NULL DEFAULT 'DRAFT',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "notes" TEXT,
    "obstacles" TEXT,
    "followUpPlan" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teaching_journals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "teaching_journal_references" (
    "id" SERIAL NOT NULL,
    "journalId" INTEGER NOT NULL,
    "sourceProgramCode" TEXT NOT NULL,
    "sourceEntryId" INTEGER,
    "sourceFieldIdentity" TEXT,
    "selectionToken" TEXT,
    "value" TEXT NOT NULL,
    "label" TEXT,
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teaching_journal_references_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "teaching_journals_academicYearId_scheduleEntryId_journalDate_key"
ON "teaching_journals"("academicYearId", "scheduleEntryId", "journalDate");

CREATE INDEX "teaching_journals_teacherId_academicYearId_journalDate_idx"
ON "teaching_journals"("teacherId", "academicYearId", "journalDate");

CREATE INDEX "teaching_journals_teacherAssignmentId_journalDate_idx"
ON "teaching_journals"("teacherAssignmentId", "journalDate");

CREATE INDEX "teaching_journals_classId_subjectId_journalDate_idx"
ON "teaching_journals"("classId", "subjectId", "journalDate");

CREATE INDEX "teaching_journals_status_submittedAt_idx"
ON "teaching_journals"("status", "submittedAt");

CREATE INDEX "teaching_journal_references_journalId_idx"
ON "teaching_journal_references"("journalId");

CREATE INDEX "teaching_journal_references_sourceProgramCode_sourceEntryId_idx"
ON "teaching_journal_references"("sourceProgramCode", "sourceEntryId");

ALTER TABLE "teaching_journals"
ADD CONSTRAINT "teaching_journals_academicYearId_fkey"
FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "teaching_journals"
ADD CONSTRAINT "teaching_journals_teacherId_fkey"
FOREIGN KEY ("teacherId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "teaching_journals"
ADD CONSTRAINT "teaching_journals_reviewerId_fkey"
FOREIGN KEY ("reviewerId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "teaching_journals"
ADD CONSTRAINT "teaching_journals_teacherAssignmentId_fkey"
FOREIGN KEY ("teacherAssignmentId") REFERENCES "teacher_assignments"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "teaching_journals"
ADD CONSTRAINT "teaching_journals_scheduleEntryId_fkey"
FOREIGN KEY ("scheduleEntryId") REFERENCES "schedule_entries"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "teaching_journals"
ADD CONSTRAINT "teaching_journals_classId_fkey"
FOREIGN KEY ("classId") REFERENCES "classes"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "teaching_journals"
ADD CONSTRAINT "teaching_journals_subjectId_fkey"
FOREIGN KEY ("subjectId") REFERENCES "subjects"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "teaching_journal_references"
ADD CONSTRAINT "teaching_journal_references_journalId_fkey"
FOREIGN KEY ("journalId") REFERENCES "teaching_journals"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
