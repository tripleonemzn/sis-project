-- Alter room categories to support dynamic inventory templates
ALTER TABLE "room_categories"
ADD COLUMN IF NOT EXISTS "inventoryTemplateKey" TEXT DEFAULT 'STANDARD';

UPDATE "room_categories"
SET "inventoryTemplateKey" = 'STANDARD'
WHERE "inventoryTemplateKey" IS NULL;

-- Add flexible attributes payload for room-specific inventory fields
ALTER TABLE "inventory_items"
ADD COLUMN IF NOT EXISTS "attributes" JSONB;
