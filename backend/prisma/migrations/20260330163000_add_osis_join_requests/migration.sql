-- CreateEnum
CREATE TYPE "OsisJoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED');

-- CreateTable
CREATE TABLE "osis_join_requests" (
    "id" SERIAL NOT NULL,
    "academicYearId" INTEGER NOT NULL,
    "ekskulId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "status" "OsisJoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "processedById" INTEGER,
    "membershipId" INTEGER,

    CONSTRAINT "osis_join_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "osis_join_requests_membershipId_key" ON "osis_join_requests"("membershipId");

-- CreateIndex
CREATE INDEX "osis_join_requests_year_status_idx" ON "osis_join_requests"("academicYearId", "status");

-- CreateIndex
CREATE INDEX "osis_join_requests_student_year_idx" ON "osis_join_requests"("studentId", "academicYearId");

-- CreateIndex
CREATE INDEX "osis_join_requests_ekskul_year_idx" ON "osis_join_requests"("ekskulId", "academicYearId");

-- AddForeignKey
ALTER TABLE "osis_join_requests" ADD CONSTRAINT "osis_join_requests_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osis_join_requests" ADD CONSTRAINT "osis_join_requests_ekskulId_fkey" FOREIGN KEY ("ekskulId") REFERENCES "ekstrakurikulers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osis_join_requests" ADD CONSTRAINT "osis_join_requests_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osis_join_requests" ADD CONSTRAINT "osis_join_requests_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osis_join_requests" ADD CONSTRAINT "osis_join_requests_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "osis_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
