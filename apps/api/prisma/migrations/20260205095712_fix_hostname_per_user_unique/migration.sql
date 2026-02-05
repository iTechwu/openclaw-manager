-- Fix: Change hostname unique constraint from global to per-user
-- This allows different users to create bots with the same hostname

-- DropIndex: Remove global hostname unique constraint
DROP INDEX IF EXISTS "b_bot_hostname_active_unique";

-- CreateIndex: Per-user unique index for hostname (hostname + created_by_id)
-- This ensures hostname uniqueness within each user's scope, not globally
CREATE UNIQUE INDEX "b_bot_hostname_user_active_unique"
  ON "b_bot" ("hostname", "created_by_id")
  WHERE "is_deleted" = false;

-- Note: proxy_token_hash remains globally unique as it's a security token
-- that should never collide across all users
