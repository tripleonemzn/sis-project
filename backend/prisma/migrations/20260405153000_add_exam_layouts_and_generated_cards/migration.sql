-- CreateEnum
CREATE TYPE "ExamSittingLayoutCellType" AS ENUM ('SEAT', 'AISLE');

-- CreateEnum
CREATE TYPE "ExamGeneratedCardStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "exam_sitting_layouts" (
    "id" SERIAL NOT NULL,
    "sittingId" INTEGER NOT NULL,
    "rows" INTEGER NOT NULL DEFAULT 1,
    "columns" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "generatedAt" TIMESTAMP(3),
    "generatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_sitting_layouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_sitting_layout_cells" (
    "id" SERIAL NOT NULL,
    "layoutId" INTEGER NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "columnIndex" INTEGER NOT NULL,
    "cellType" "ExamSittingLayoutCellType" NOT NULL DEFAULT 'SEAT',
    "seatLabel" TEXT,
    "studentId" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_sitting_layout_cells_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_generated_cards" (
    "id" SERIAL NOT NULL,
    "academicYearId" INTEGER NOT NULL,
    "programCode" TEXT NOT NULL,
    "semester" "Semester" NOT NULL,
    "studentId" INTEGER NOT NULL,
    "status" "ExamGeneratedCardStatus" NOT NULL DEFAULT 'ACTIVE',
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "generatedById" INTEGER NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "principalName" TEXT NOT NULL,
    "principalBarcodeDataUrl" TEXT,
    "headTuName" TEXT NOT NULL,
    "schoolName" TEXT NOT NULL,
    "headerTitle" TEXT NOT NULL,
    "headerSubtitle" TEXT,
    "studentName" TEXT NOT NULL,
    "studentUsername" TEXT,
    "nis" TEXT,
    "nisn" TEXT,
    "className" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_generated_cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exam_sitting_layouts_sittingId_key" ON "exam_sitting_layouts"("sittingId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_sitting_layout_cells_layoutId_rowIndex_columnIndex_key" ON "exam_sitting_layout_cells"("layoutId", "rowIndex", "columnIndex");

-- CreateIndex
CREATE UNIQUE INDEX "exam_sitting_layout_cells_layoutId_studentId_key" ON "exam_sitting_layout_cells"("layoutId", "studentId");

-- CreateIndex
CREATE INDEX "exam_sitting_layout_cells_layoutId_cellType_idx" ON "exam_sitting_layout_cells"("layoutId", "cellType");

-- CreateIndex
CREATE UNIQUE INDEX "exam_generated_cards_unique_slot_key" ON "exam_generated_cards"("academicYearId", "programCode", "semester", "studentId");

-- CreateIndex
CREATE INDEX "exam_generated_cards_student_status_idx" ON "exam_generated_cards"("studentId", "status", "generatedAt");

-- CreateIndex
CREATE INDEX "exam_generated_cards_program_status_idx" ON "exam_generated_cards"("academicYearId", "programCode", "semester", "status");

-- AddForeignKey
ALTER TABLE "exam_sitting_layouts" ADD CONSTRAINT "exam_sitting_layouts_sittingId_fkey" FOREIGN KEY ("sittingId") REFERENCES "exam_sittings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_sitting_layout_cells" ADD CONSTRAINT "exam_sitting_layout_cells_layoutId_fkey" FOREIGN KEY ("layoutId") REFERENCES "exam_sitting_layouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
