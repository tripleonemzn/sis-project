CREATE TABLE IF NOT EXISTS "exam_program_configs" (
  "id" SERIAL NOT NULL,
  "academicYearId" INTEGER NOT NULL,
  "code" "ExamType" NOT NULL,
  "displayLabel" TEXT NOT NULL,
  "shortLabel" TEXT,
  "description" TEXT,
  "fixedSemester" "Semester",
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "showOnTeacherMenu" BOOLEAN NOT NULL DEFAULT true,
  "showOnStudentMenu" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "exam_program_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "exam_program_configs_academicYearId_code_key"
  ON "exam_program_configs"("academicYearId", "code");

CREATE INDEX IF NOT EXISTS "exam_program_configs_academicYearId_displayOrder_idx"
  ON "exam_program_configs"("academicYearId", "displayOrder");

ALTER TABLE "exam_program_configs"
  ADD CONSTRAINT "exam_program_configs_academicYearId_fkey"
  FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
