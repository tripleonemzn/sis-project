ALTER TABLE "users"
ADD COLUMN "webmailMailboxIdentity" TEXT;

CREATE UNIQUE INDEX "users_webmailMailboxIdentity_key"
ON "users"("webmailMailboxIdentity");
