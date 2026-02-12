-- CreateEnum
CREATE TYPE "SubjectCategory" AS ENUM ('UMUM', 'KEJURUAN', 'KOMPETENSI_KEAHLIAN', 'PILIHAN', 'MUATAN_LOKAL');

-- AlterEnum
ALTER TYPE "AdditionalDuty" ADD VALUE 'BP_BK';

-- AlterTable
ALTER TABLE "subjects" ADD COLUMN     "category" "SubjectCategory" NOT NULL DEFAULT 'UMUM';
