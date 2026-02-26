CREATE TABLE "exam_grade_components" (
  "id" SERIAL NOT NULL,
  "academicYearId" INTEGER NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "type" "GradeComponentType" NOT NULL DEFAULT 'CUSTOM',
  "entryMode" "GradeEntryMode" NOT NULL DEFAULT 'SINGLE_SCORE',
  "description" TEXT,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "exam_grade_components_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "exam_grade_components_academicYearId_code_key"
  ON "exam_grade_components"("academicYearId", "code");

CREATE INDEX "exam_grade_components_academicYearId_displayOrder_idx"
  ON "exam_grade_components"("academicYearId", "displayOrder");

ALTER TABLE "exam_grade_components"
  ADD CONSTRAINT "exam_grade_components_academicYearId_fkey"
  FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
