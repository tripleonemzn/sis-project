ALTER TABLE "users"
ADD COLUMN "educationHistories" JSONB;

ALTER TABLE "job_applicant_profiles"
ADD COLUMN "educationHistories" JSONB;
