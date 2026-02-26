DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LibraryBorrowerStatus') THEN
    CREATE TYPE "LibraryBorrowerStatus" AS ENUM ('TEACHER', 'STUDENT');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LibraryReturnStatus') THEN
    CREATE TYPE "LibraryReturnStatus" AS ENUM ('RETURNED', 'NOT_RETURNED');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "library_book_loans" (
  "id" SERIAL NOT NULL,
  "borrowDate" TIMESTAMP(3) NOT NULL,
  "borrowerName" TEXT NOT NULL,
  "borrowerStatus" "LibraryBorrowerStatus" NOT NULL,
  "classId" INTEGER,
  "bookTitle" TEXT NOT NULL,
  "publishYear" INTEGER,
  "returnDate" TIMESTAMP(3),
  "returnStatus" "LibraryReturnStatus" NOT NULL DEFAULT 'NOT_RETURNED',
  "phoneNumber" TEXT,
  "createdById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "library_book_loans_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "library_book_loans_borrowDate_idx" ON "library_book_loans"("borrowDate");
CREATE INDEX IF NOT EXISTS "library_book_loans_borrowerStatus_idx" ON "library_book_loans"("borrowerStatus");
CREATE INDEX IF NOT EXISTS "library_book_loans_classId_idx" ON "library_book_loans"("classId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'library_book_loans_classId_fkey'
  ) THEN
    ALTER TABLE "library_book_loans"
      ADD CONSTRAINT "library_book_loans_classId_fkey"
      FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'library_book_loans_createdById_fkey'
  ) THEN
    ALTER TABLE "library_book_loans"
      ADD CONSTRAINT "library_book_loans_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;
