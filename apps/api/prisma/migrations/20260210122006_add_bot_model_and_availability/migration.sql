-- CreateTable
CREATE TABLE "b_bot_model" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "bot_id" UUID NOT NULL,
    "model_id" VARCHAR(100) NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "b_bot_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b_model_availability" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "vendor" VARCHAR(50) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "provider_key_id" UUID NOT NULL,
    "is_available" BOOLEAN NOT NULL DEFAULT false,
    "last_verified_at" TIMESTAMPTZ(6) NOT NULL,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "b_model_availability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "b_bot_model_bot_id_idx" ON "b_bot_model"("bot_id");

-- CreateIndex
CREATE INDEX "b_bot_model_model_id_idx" ON "b_bot_model"("model_id");

-- CreateIndex
CREATE UNIQUE INDEX "b_bot_model_bot_id_model_id_key" ON "b_bot_model"("bot_id", "model_id");

-- CreateIndex
CREATE INDEX "b_model_availability_vendor_model_idx" ON "b_model_availability"("vendor", "model");

-- CreateIndex
CREATE INDEX "b_model_availability_is_available_idx" ON "b_model_availability"("is_available");

-- CreateIndex
CREATE UNIQUE INDEX "b_model_availability_provider_key_id_model_key" ON "b_model_availability"("provider_key_id", "model");

-- AddForeignKey
ALTER TABLE "b_bot_model" ADD CONSTRAINT "b_bot_model_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "b_bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b_model_availability" ADD CONSTRAINT "b_model_availability_provider_key_id_fkey" FOREIGN KEY ("provider_key_id") REFERENCES "b_provider_key"("id") ON DELETE CASCADE ON UPDATE CASCADE;
