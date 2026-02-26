CREATE TYPE "ReportComponentSlot" AS ENUM ('NONE', 'FORMATIF', 'SBTS', 'SAS', 'US_THEORY', 'US_PRACTICE');

ALTER TABLE "exam_grade_components"
  ADD COLUMN "reportSlot" "ReportComponentSlot" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "includeInFinalScore" BOOLEAN NOT NULL DEFAULT false;

UPDATE "exam_grade_components"
SET "reportSlot" = CASE
  WHEN code = 'FORMATIVE' THEN 'FORMATIF'::"ReportComponentSlot"
  WHEN code = 'MIDTERM' THEN 'SBTS'::"ReportComponentSlot"
  WHEN code = 'FINAL' THEN 'SAS'::"ReportComponentSlot"
  WHEN code = 'US_THEORY' THEN 'US_THEORY'::"ReportComponentSlot"
  WHEN code = 'US_PRACTICE' THEN 'US_PRACTICE'::"ReportComponentSlot"
  ELSE "reportSlot"
END,
"includeInFinalScore" = CASE
  WHEN code IN ('FORMATIVE', 'MIDTERM', 'FINAL') THEN true
  ELSE "includeInFinalScore"
END;
