-- CreateEnum
CREATE TYPE "OsisManagementStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');

-- CreateTable
CREATE TABLE "osis_management_periods" (
    "id" SERIAL NOT NULL,
    "academicYearId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "OsisManagementStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "osis_management_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "osis_divisions" (
    "id" SERIAL NOT NULL,
    "periodId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "osis_divisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "osis_positions" (
    "id" SERIAL NOT NULL,
    "periodId" INTEGER NOT NULL,
    "divisionId" INTEGER,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "osis_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "osis_memberships" (
    "id" SERIAL NOT NULL,
    "periodId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "divisionId" INTEGER,
    "positionId" INTEGER NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "osis_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "osis_grade_templates" (
    "id" SERIAL NOT NULL,
    "academicYearId" INTEGER NOT NULL,
    "semester" "Semester" NOT NULL,
    "reportSlot" TEXT NOT NULL,
    "predicate" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "osis_grade_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "osis_assessments" (
    "id" SERIAL NOT NULL,
    "membershipId" INTEGER NOT NULL,
    "academicYearId" INTEGER NOT NULL,
    "semester" "Semester" NOT NULL,
    "reportSlot" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "description" TEXT,
    "gradedById" INTEGER NOT NULL,
    "gradedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "osis_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "osis_management_periods_academicYearId_status_idx" ON "osis_management_periods"("academicYearId", "status");

-- CreateIndex
CREATE INDEX "osis_divisions_period_order_idx" ON "osis_divisions"("periodId", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "osis_divisions_period_code_key" ON "osis_divisions"("periodId", "code");

-- CreateIndex
CREATE INDEX "osis_positions_period_order_idx" ON "osis_positions"("periodId", "displayOrder");

-- CreateIndex
CREATE INDEX "osis_positions_division_idx" ON "osis_positions"("divisionId");

-- CreateIndex
CREATE UNIQUE INDEX "osis_positions_period_code_key" ON "osis_positions"("periodId", "code");

-- CreateIndex
CREATE INDEX "osis_memberships_period_active_idx" ON "osis_memberships"("periodId", "isActive");

-- CreateIndex
CREATE INDEX "osis_memberships_student_idx" ON "osis_memberships"("studentId");

-- CreateIndex
CREATE INDEX "osis_memberships_position_idx" ON "osis_memberships"("positionId");

-- CreateIndex
CREATE UNIQUE INDEX "osis_memberships_period_student_key" ON "osis_memberships"("periodId", "studentId");

-- CreateIndex
CREATE INDEX "osis_grade_templates_scope_idx" ON "osis_grade_templates"("academicYearId", "semester", "reportSlot");

-- CreateIndex
CREATE UNIQUE INDEX "osis_grade_templates_unique_scope" ON "osis_grade_templates"("academicYearId", "semester", "reportSlot", "predicate");

-- CreateIndex
CREATE INDEX "osis_assessments_scope_idx" ON "osis_assessments"("academicYearId", "semester", "reportSlot");

-- CreateIndex
CREATE INDEX "osis_assessments_graded_by_idx" ON "osis_assessments"("gradedById");

-- CreateIndex
CREATE UNIQUE INDEX "osis_assessments_unique_scope" ON "osis_assessments"("membershipId", "academicYearId", "semester", "reportSlot");

-- AddForeignKey
ALTER TABLE "osis_management_periods" ADD CONSTRAINT "osis_management_periods_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osis_management_periods" ADD CONSTRAINT "osis_management_periods_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osis_divisions" ADD CONSTRAINT "osis_divisions_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "osis_management_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osis_positions" ADD CONSTRAINT "osis_positions_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "osis_management_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osis_positions" ADD CONSTRAINT "osis_positions_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "osis_divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osis_memberships" ADD CONSTRAINT "osis_memberships_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "osis_management_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osis_memberships" ADD CONSTRAINT "osis_memberships_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osis_memberships" ADD CONSTRAINT "osis_memberships_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "osis_divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osis_memberships" ADD CONSTRAINT "osis_memberships_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "osis_positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osis_grade_templates" ADD CONSTRAINT "osis_grade_templates_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osis_assessments" ADD CONSTRAINT "osis_assessments_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "osis_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osis_assessments" ADD CONSTRAINT "osis_assessments_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osis_assessments" ADD CONSTRAINT "osis_assessments_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
