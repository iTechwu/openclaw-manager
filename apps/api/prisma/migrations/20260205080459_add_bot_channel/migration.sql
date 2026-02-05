-- CreateEnum
CREATE TYPE "channel_connection_status" AS ENUM ('DISCONNECTED', 'CONNECTING', 'CONNECTED', 'ERROR');

-- CreateTable
CREATE TABLE "b_bot_channel" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "bot_id" UUID NOT NULL,
    "channel_type" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "credentials_encrypted" BYTEA NOT NULL,
    "config" JSONB,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "connection_status" "channel_connection_status" NOT NULL DEFAULT 'DISCONNECTED',
    "last_connected_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "b_bot_channel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "b_bot_channel_bot_id_idx" ON "b_bot_channel"("bot_id");

-- CreateIndex
CREATE INDEX "b_bot_channel_channel_type_idx" ON "b_bot_channel"("channel_type");

-- CreateIndex
CREATE INDEX "b_bot_channel_is_enabled_idx" ON "b_bot_channel"("is_enabled");

-- CreateIndex
CREATE INDEX "b_bot_channel_connection_status_idx" ON "b_bot_channel"("connection_status");

-- CreateIndex
CREATE INDEX "b_bot_channel_is_deleted_idx" ON "b_bot_channel"("is_deleted");

-- CreateIndex
CREATE UNIQUE INDEX "b_bot_channel_bot_id_channel_type_name_key" ON "b_bot_channel"("bot_id", "channel_type", "name");

-- AddForeignKey
ALTER TABLE "b_bot_channel" ADD CONSTRAINT "b_bot_channel_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "b_bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
