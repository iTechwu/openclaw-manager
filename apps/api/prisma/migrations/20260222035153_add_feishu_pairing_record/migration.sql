-- CreateEnum
CREATE TYPE "pairing_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "b_feishu_pairing_record" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "bot_id" UUID NOT NULL,
    "bot_channel_id" UUID NOT NULL,
    "code" VARCHAR(8) NOT NULL,
    "feishu_open_id" VARCHAR(100) NOT NULL,
    "status" "pairing_status" NOT NULL DEFAULT 'PENDING',
    "user_name" VARCHAR(255),
    "user_name_en" VARCHAR(255),
    "user_avatar_url" VARCHAR(500),
    "user_email" VARCHAR(255),
    "user_mobile" VARCHAR(50),
    "user_department_id" VARCHAR(100),
    "user_department_name" VARCHAR(255),
    "user_info_raw" JSONB,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "approved_at" TIMESTAMPTZ(6),
    "approved_by_id" UUID,
    "rejected_at" TIMESTAMPTZ(6),
    "rejected_by_id" UUID,
    "last_synced_at" TIMESTAMPTZ(6),
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "b_feishu_pairing_record_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "b_feishu_pairing_record_bot_id_idx" ON "b_feishu_pairing_record"("bot_id");

-- CreateIndex
CREATE INDEX "b_feishu_pairing_record_bot_channel_id_idx" ON "b_feishu_pairing_record"("bot_channel_id");

-- CreateIndex
CREATE INDEX "b_feishu_pairing_record_code_idx" ON "b_feishu_pairing_record"("code");

-- CreateIndex
CREATE INDEX "b_feishu_pairing_record_feishu_open_id_idx" ON "b_feishu_pairing_record"("feishu_open_id");

-- CreateIndex
CREATE INDEX "b_feishu_pairing_record_status_idx" ON "b_feishu_pairing_record"("status");

-- CreateIndex
CREATE INDEX "b_feishu_pairing_record_is_deleted_idx" ON "b_feishu_pairing_record"("is_deleted");

-- CreateIndex
CREATE UNIQUE INDEX "b_feishu_pairing_record_bot_id_code_key" ON "b_feishu_pairing_record"("bot_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "b_feishu_pairing_record_bot_id_feishu_open_id_key" ON "b_feishu_pairing_record"("bot_id", "feishu_open_id");

-- AddForeignKey
ALTER TABLE "b_feishu_pairing_record" ADD CONSTRAINT "b_feishu_pairing_record_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "b_bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b_feishu_pairing_record" ADD CONSTRAINT "b_feishu_pairing_record_bot_channel_id_fkey" FOREIGN KEY ("bot_channel_id") REFERENCES "b_bot_channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
