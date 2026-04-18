ALTER TABLE "exam_program_configs"
ADD COLUMN "studentResultPublishMode" TEXT NOT NULL DEFAULT 'DIRECT',
ADD COLUMN "studentResultPublishAt" TIMESTAMP(3);

UPDATE "exam_program_configs"
SET "studentResultPublishMode" = 'REPORT_DATE'
WHERE UPPER(COALESCE("code", '')) IN ('SBTS', 'SAS', 'SAT');
