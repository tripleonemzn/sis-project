-- CreateEnum
CREATE TYPE "ExtracurricularCategory" AS ENUM ('EXTRACURRICULAR', 'OSIS');

-- AlterTable
ALTER TABLE "ekstrakurikulers"
ADD COLUMN "category" "ExtracurricularCategory" NOT NULL DEFAULT 'EXTRACURRICULAR';

-- Backfill legacy OSIS records based on existing name convention.
UPDATE "ekstrakurikulers"
SET "category" = 'OSIS'
WHERE UPPER(COALESCE("name", '')) LIKE '%OSIS%';
