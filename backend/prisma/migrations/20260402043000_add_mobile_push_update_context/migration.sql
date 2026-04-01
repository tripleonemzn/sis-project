ALTER TABLE "mobile_push_devices"
ADD COLUMN IF NOT EXISTS "updateChannel" TEXT,
ADD COLUMN IF NOT EXISTS "runtimeVersion" TEXT;

CREATE INDEX IF NOT EXISTS "mobile_push_devices_platform_isEnabled_updateChannel_runtim_idx"
ON "mobile_push_devices"("platform", "isEnabled", "updateChannel", "runtimeVersion");
