CREATE TABLE IF NOT EXISTS "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" INTEGER NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "refresh_token_expires_at" TIMESTAMP(3) NOT NULL,
    "absolute_expires_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "revoke_reason" TEXT,
    "client_platform" TEXT,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "webmail_authenticated_at" TIMESTAMP(3),
    "webmail_mailbox_identity" TEXT,
    "webmail_mode" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id")
        REFERENCES "users"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "auth_sessions_user_revoked_idx"
    ON "auth_sessions"("user_id", "revoked_at");

CREATE INDEX IF NOT EXISTS "auth_sessions_refresh_hash_idx"
    ON "auth_sessions"("refresh_token_hash");
