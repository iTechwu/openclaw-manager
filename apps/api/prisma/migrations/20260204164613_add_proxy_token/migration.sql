-- CreateTable
CREATE TABLE "b_proxy_token" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "bot_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "vendor" VARCHAR(50) NOT NULL,
    "key_id" UUID NOT NULL,
    "tags" TEXT[],
    "expires_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "last_used_at" TIMESTAMPTZ(6),
    "request_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "b_proxy_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "b_proxy_token_bot_id_key" ON "b_proxy_token"("bot_id");

-- CreateIndex
CREATE UNIQUE INDEX "b_proxy_token_token_hash_key" ON "b_proxy_token"("token_hash");

-- CreateIndex
CREATE INDEX "b_proxy_token_token_hash_idx" ON "b_proxy_token"("token_hash");

-- CreateIndex
CREATE INDEX "b_proxy_token_bot_id_idx" ON "b_proxy_token"("bot_id");

-- CreateIndex
CREATE INDEX "b_proxy_token_key_id_idx" ON "b_proxy_token"("key_id");

-- CreateIndex
CREATE INDEX "b_proxy_token_vendor_idx" ON "b_proxy_token"("vendor");

-- CreateIndex
CREATE INDEX "b_proxy_token_expires_at_idx" ON "b_proxy_token"("expires_at");

-- CreateIndex
CREATE INDEX "b_proxy_token_revoked_at_idx" ON "b_proxy_token"("revoked_at");

-- AddForeignKey
ALTER TABLE "b_proxy_token" ADD CONSTRAINT "b_proxy_token_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "b_bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b_proxy_token" ADD CONSTRAINT "b_proxy_token_key_id_fkey" FOREIGN KEY ("key_id") REFERENCES "b_provider_key"("id") ON DELETE CASCADE ON UPDATE CASCADE;
