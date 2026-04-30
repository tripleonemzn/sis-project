-- Backfill existing subject attendance rows as historical records.
-- New audit fields did not exist when these rows were created, so using the lesson date
-- avoids marking all old saved attendance as late input after the migration.
UPDATE "attendances"
SET
  "createdAt" = "date",
  "updatedAt" = "date"
WHERE "createdById" IS NULL
  AND "updatedById" IS NULL;
