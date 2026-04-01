ALTER TABLE "job_applications"
ADD COLUMN IF NOT EXISTS "partnerReferenceCode" TEXT,
ADD COLUMN IF NOT EXISTS "partnerHandoffNotes" TEXT,
ADD COLUMN IF NOT EXISTS "partnerDecisionNotes" TEXT;
