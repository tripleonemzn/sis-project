CREATE TABLE IF NOT EXISTS "library_loan_policy" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "finePerDay" INTEGER NOT NULL DEFAULT 1000,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "library_loan_policy_pkey" PRIMARY KEY ("id")
);

INSERT INTO "library_loan_policy" ("id", "finePerDay", "createdAt", "updatedAt")
VALUES (1, 1000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
