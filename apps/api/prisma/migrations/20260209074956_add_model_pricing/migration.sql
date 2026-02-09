-- CreateTable
CREATE TABLE "b_model_pricing" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "model" VARCHAR(100) NOT NULL,
    "vendor" VARCHAR(50) NOT NULL,
    "input_price" DECIMAL(10,6) NOT NULL,
    "output_price" DECIMAL(10,6) NOT NULL,
    "display_name" VARCHAR(255),
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "price_updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "b_model_pricing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "b_model_pricing_model_key" ON "b_model_pricing"("model");

-- CreateIndex
CREATE INDEX "b_model_pricing_vendor_idx" ON "b_model_pricing"("vendor");

-- CreateIndex
CREATE INDEX "b_model_pricing_is_enabled_idx" ON "b_model_pricing"("is_enabled");

-- CreateIndex
CREATE INDEX "b_model_pricing_is_deleted_idx" ON "b_model_pricing"("is_deleted");
