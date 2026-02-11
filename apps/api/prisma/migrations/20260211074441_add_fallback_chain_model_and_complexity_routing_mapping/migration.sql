-- AlterTable
ALTER TABLE "b_complexity_routing_config" ALTER COLUMN "models" DROP NOT NULL;

-- AlterTable
ALTER TABLE "b_fallback_chain" ALTER COLUMN "models" DROP NOT NULL;

-- CreateTable
CREATE TABLE "b_fallback_chain_model" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "fallback_chain_id" UUID NOT NULL,
    "model_availability_id" UUID NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "protocol_override" VARCHAR(50),
    "features_override" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "b_fallback_chain_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b_complexity_routing_model_mapping" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "complexity_config_id" UUID NOT NULL,
    "complexity_level" VARCHAR(20) NOT NULL,
    "model_availability_id" UUID NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "b_complexity_routing_model_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "b_fallback_chain_model_fallback_chain_id_idx" ON "b_fallback_chain_model"("fallback_chain_id");

-- CreateIndex
CREATE INDEX "b_fallback_chain_model_model_availability_id_idx" ON "b_fallback_chain_model"("model_availability_id");

-- CreateIndex
CREATE INDEX "b_fallback_chain_model_priority_idx" ON "b_fallback_chain_model"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "b_fallback_chain_model_fallback_chain_id_model_availability_key" ON "b_fallback_chain_model"("fallback_chain_id", "model_availability_id");

-- CreateIndex
CREATE INDEX "b_complexity_routing_model_mapping_complexity_config_id_idx" ON "b_complexity_routing_model_mapping"("complexity_config_id");

-- CreateIndex
CREATE INDEX "b_complexity_routing_model_mapping_model_availability_id_idx" ON "b_complexity_routing_model_mapping"("model_availability_id");

-- CreateIndex
CREATE INDEX "b_complexity_routing_model_mapping_complexity_level_idx" ON "b_complexity_routing_model_mapping"("complexity_level");

-- CreateIndex
CREATE UNIQUE INDEX "b_complexity_routing_model_mapping_complexity_config_id_com_key" ON "b_complexity_routing_model_mapping"("complexity_config_id", "complexity_level", "model_availability_id");

-- AddForeignKey
ALTER TABLE "b_fallback_chain_model" ADD CONSTRAINT "b_fallback_chain_model_fallback_chain_id_fkey" FOREIGN KEY ("fallback_chain_id") REFERENCES "b_fallback_chain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b_fallback_chain_model" ADD CONSTRAINT "b_fallback_chain_model_model_availability_id_fkey" FOREIGN KEY ("model_availability_id") REFERENCES "b_model_availability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b_complexity_routing_model_mapping" ADD CONSTRAINT "b_complexity_routing_model_mapping_complexity_config_id_fkey" FOREIGN KEY ("complexity_config_id") REFERENCES "b_complexity_routing_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b_complexity_routing_model_mapping" ADD CONSTRAINT "b_complexity_routing_model_mapping_model_availability_id_fkey" FOREIGN KEY ("model_availability_id") REFERENCES "b_model_availability"("id") ON DELETE CASCADE ON UPDATE CASCADE;
