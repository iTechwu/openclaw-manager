-- AlterTable
ALTER TABLE "b_bot_routing_config" ADD COLUMN     "complexity_routing_config_id" VARCHAR(50),
ADD COLUMN     "complexity_routing_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "b_complexity_routing_config" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "config_id" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "models" JSONB NOT NULL,
    "classifier_model" VARCHAR(100) NOT NULL DEFAULT 'deepseek-v3-250324',
    "classifier_vendor" VARCHAR(50) NOT NULL DEFAULT 'deepseek',
    "tool_min_complexity" VARCHAR(20),
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_builtin" BOOLEAN NOT NULL DEFAULT false,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "b_complexity_routing_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "b_complexity_routing_config_config_id_key" ON "b_complexity_routing_config"("config_id");

-- CreateIndex
CREATE INDEX "b_complexity_routing_config_config_id_idx" ON "b_complexity_routing_config"("config_id");

-- CreateIndex
CREATE INDEX "b_complexity_routing_config_is_enabled_idx" ON "b_complexity_routing_config"("is_enabled");

-- CreateIndex
CREATE INDEX "b_complexity_routing_config_is_deleted_idx" ON "b_complexity_routing_config"("is_deleted");

-- CreateIndex
CREATE INDEX "b_bot_routing_config_complexity_routing_enabled_idx" ON "b_bot_routing_config"("complexity_routing_enabled");
