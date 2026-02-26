ALTER TABLE "library_book_loans"
ADD COLUMN IF NOT EXISTS "borrowerUserId" INTEGER,
ADD COLUMN IF NOT EXISTS "overdueNotifiedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "library_book_loans_borrowerUserId_idx" ON "library_book_loans"("borrowerUserId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'library_book_loans_borrowerUserId_fkey'
  ) THEN
    ALTER TABLE "library_book_loans"
      ADD CONSTRAINT "library_book_loans_borrowerUserId_fkey"
      FOREIGN KEY ("borrowerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;
