-- CreateTable
CREATE TABLE "b_channel_definition" (
    "id" VARCHAR(50) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "icon" VARCHAR(10) NOT NULL,
    "popular" BOOLEAN NOT NULL DEFAULT false,
    "token_hint" VARCHAR(500) NOT NULL,
    "token_placeholder" VARCHAR(255) NOT NULL,
    "help_url" VARCHAR(500),
    "help_text" VARCHAR(255),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "b_channel_definition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b_channel_credential_field" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "channel_id" VARCHAR(50) NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "placeholder" VARCHAR(255) NOT NULL,
    "field_type" VARCHAR(20) NOT NULL DEFAULT 'text',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "b_channel_credential_field_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "b_channel_definition_popular_idx" ON "b_channel_definition"("popular");

-- CreateIndex
CREATE INDEX "b_channel_definition_sort_order_idx" ON "b_channel_definition"("sort_order");

-- CreateIndex
CREATE INDEX "b_channel_definition_is_deleted_idx" ON "b_channel_definition"("is_deleted");

-- CreateIndex
CREATE INDEX "b_channel_credential_field_channel_id_idx" ON "b_channel_credential_field"("channel_id");

-- CreateIndex
CREATE INDEX "b_channel_credential_field_sort_order_idx" ON "b_channel_credential_field"("sort_order");

-- CreateIndex
CREATE INDEX "b_channel_credential_field_is_deleted_idx" ON "b_channel_credential_field"("is_deleted");

-- CreateIndex
CREATE UNIQUE INDEX "b_channel_credential_field_channel_id_key_key" ON "b_channel_credential_field"("channel_id", "key");

-- AddForeignKey
ALTER TABLE "b_channel_credential_field" ADD CONSTRAINT "b_channel_credential_field_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "b_channel_definition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
