DO $$ BEGIN
    CREATE TYPE "StudentAcademicMembershipStatus" AS ENUM ('ACTIVE', 'PROMOTED', 'GRADUATED', 'MOVED', 'DROPPED_OUT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "PromotionAction" AS ENUM ('PROMOTE', 'GRADUATE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "PromotionRunStatus" AS ENUM ('COMMITTED', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "promotion_runs" (
    "id" SERIAL NOT NULL,
    "sourceAcademicYearId" INTEGER NOT NULL,
    "targetAcademicYearId" INTEGER NOT NULL,
    "createdById" INTEGER,
    "status" "PromotionRunStatus" NOT NULL DEFAULT 'COMMITTED',
    "activateTargetYear" BOOLEAN NOT NULL DEFAULT false,
    "totalClasses" INTEGER NOT NULL DEFAULT 0,
    "totalStudents" INTEGER NOT NULL DEFAULT 0,
    "promotedStudents" INTEGER NOT NULL DEFAULT 0,
    "graduatedStudents" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB,
    "committedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "promotion_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "promotion_runs_sourceAcademicYearId_fkey" FOREIGN KEY ("sourceAcademicYearId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "promotion_runs_targetAcademicYearId_fkey" FOREIGN KEY ("targetAcademicYearId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "promotion_runs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "student_academic_memberships" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "academicYearId" INTEGER NOT NULL,
    "classId" INTEGER,
    "status" "StudentAcademicMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "promotionRunId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "student_academic_memberships_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "student_academic_memberships_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "student_academic_memberships_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "student_academic_memberships_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "student_academic_memberships_promotionRunId_fkey" FOREIGN KEY ("promotionRunId") REFERENCES "promotion_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "promotion_class_mappings" (
    "id" SERIAL NOT NULL,
    "sourceAcademicYearId" INTEGER NOT NULL,
    "targetAcademicYearId" INTEGER NOT NULL,
    "sourceClassId" INTEGER NOT NULL,
    "targetClassId" INTEGER,
    "action" "PromotionAction" NOT NULL,
    "sourceLevel" TEXT NOT NULL,
    "targetLevel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "promotion_class_mappings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "promotion_class_mappings_sourceAcademicYearId_fkey" FOREIGN KEY ("sourceAcademicYearId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "promotion_class_mappings_targetAcademicYearId_fkey" FOREIGN KEY ("targetAcademicYearId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "promotion_class_mappings_sourceClassId_fkey" FOREIGN KEY ("sourceClassId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "promotion_class_mappings_targetClassId_fkey" FOREIGN KEY ("targetClassId") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "promotion_run_items" (
    "id" SERIAL NOT NULL,
    "promotionRunId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "sourceClassId" INTEGER NOT NULL,
    "targetClassId" INTEGER,
    "action" "PromotionAction" NOT NULL,
    "beforeStudentStatus" "StudentStatus",
    "afterStudentStatus" "StudentStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "promotion_run_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "promotion_run_items_promotionRunId_fkey" FOREIGN KEY ("promotionRunId") REFERENCES "promotion_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "promotion_run_items_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "promotion_run_items_sourceClassId_fkey" FOREIGN KEY ("sourceClassId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "promotion_run_items_targetClassId_fkey" FOREIGN KEY ("targetClassId") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "student_academic_memberships_studentId_academicYearId_key"
ON "student_academic_memberships"("studentId", "academicYearId");

CREATE INDEX IF NOT EXISTS "student_academic_memberships_academicYearId_classId_idx"
ON "student_academic_memberships"("academicYearId", "classId");

CREATE INDEX IF NOT EXISTS "student_academic_memberships_studentId_isCurrent_idx"
ON "student_academic_memberships"("studentId", "isCurrent");

CREATE UNIQUE INDEX IF NOT EXISTS "promotion_class_mappings_sourceAcademicYearId_targetAcademicYearId_sourceClassId_key"
ON "promotion_class_mappings"("sourceAcademicYearId", "targetAcademicYearId", "sourceClassId");

CREATE INDEX IF NOT EXISTS "promotion_class_mappings_targetAcademicYearId_targetClassId_idx"
ON "promotion_class_mappings"("targetAcademicYearId", "targetClassId");

CREATE INDEX IF NOT EXISTS "promotion_runs_sourceAcademicYearId_targetAcademicYearId_createdAt_idx"
ON "promotion_runs"("sourceAcademicYearId", "targetAcademicYearId", "createdAt");

CREATE INDEX IF NOT EXISTS "promotion_run_items_promotionRunId_action_idx"
ON "promotion_run_items"("promotionRunId", "action");

CREATE INDEX IF NOT EXISTS "promotion_run_items_studentId_promotionRunId_idx"
ON "promotion_run_items"("studentId", "promotionRunId");
