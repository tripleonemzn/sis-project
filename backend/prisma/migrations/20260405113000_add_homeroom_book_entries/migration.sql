CREATE TYPE "HomeroomBookEntryType" AS ENUM ('EXAM_FINANCE_EXCEPTION', 'STUDENT_CASE_REPORT');

CREATE TYPE "HomeroomBookStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'CANCELLED');

CREATE TABLE "homeroom_book_entries" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "classId" INTEGER NOT NULL,
    "academicYearId" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "updatedById" INTEGER,
    "entryType" "HomeroomBookEntryType" NOT NULL,
    "status" "HomeroomBookStatus" NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "notes" TEXT,
    "incidentDate" TIMESTAMP(3) NOT NULL,
    "relatedSemester" "Semester",
    "relatedProgramCode" TEXT,
    "visibilityToPrincipal" BOOLEAN NOT NULL DEFAULT true,
    "visibilityToStudentAffairs" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "homeroom_book_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "homeroom_book_attachments" (
    "id" SERIAL NOT NULL,
    "entryId" INTEGER NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "homeroom_book_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "homeroom_book_entries_academicYearId_classId_createdAt_idx"
ON "homeroom_book_entries"("academicYearId", "classId", "createdAt");

CREATE INDEX "homeroom_book_entries_studentId_academicYearId_entryType_status_idx"
ON "homeroom_book_entries"("studentId", "academicYearId", "entryType", "status");

CREATE INDEX "homeroom_book_entries_academicYearId_relatedSemester_relatedProgramCode_entryType_status_idx"
ON "homeroom_book_entries"("academicYearId", "relatedSemester", "relatedProgramCode", "entryType", "status");

CREATE INDEX "homeroom_book_attachments_entryId_createdAt_idx"
ON "homeroom_book_attachments"("entryId", "createdAt");

ALTER TABLE "homeroom_book_entries"
ADD CONSTRAINT "homeroom_book_entries_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "homeroom_book_entries"
ADD CONSTRAINT "homeroom_book_entries_classId_fkey"
FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "homeroom_book_entries"
ADD CONSTRAINT "homeroom_book_entries_academicYearId_fkey"
FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "homeroom_book_entries"
ADD CONSTRAINT "homeroom_book_entries_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "homeroom_book_entries"
ADD CONSTRAINT "homeroom_book_entries_updatedById_fkey"
FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "homeroom_book_attachments"
ADD CONSTRAINT "homeroom_book_attachments_entryId_fkey"
FOREIGN KEY ("entryId") REFERENCES "homeroom_book_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
