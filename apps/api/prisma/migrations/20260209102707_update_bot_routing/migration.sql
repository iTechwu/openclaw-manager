-- CreateEnum
CREATE TYPE "model_routing_type" AS ENUM ('FUNCTION_ROUTE', 'LOAD_BALANCE', 'FAILOVER');

-- CreateTable
CREATE TABLE "b_bot_model_routing" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "bot_id" UUID NOT NULL,
    "routing_type" "model_routing_type" NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "config" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "b_bot_model_routing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "b_bot_model_routing_bot_id_idx" ON "b_bot_model_routing"("bot_id");

-- CreateIndex
CREATE INDEX "b_bot_model_routing_routing_type_idx" ON "b_bot_model_routing"("routing_type");

-- CreateIndex
CREATE INDEX "b_bot_model_routing_priority_idx" ON "b_bot_model_routing"("priority");

-- CreateIndex
CREATE INDEX "b_bot_model_routing_is_enabled_idx" ON "b_bot_model_routing"("is_enabled");

-- CreateIndex
CREATE INDEX "b_bot_model_routing_is_deleted_idx" ON "b_bot_model_routing"("is_deleted");

-- AddForeignKey
ALTER TABLE "b_bot_model_routing" ADD CONSTRAINT "b_bot_model_routing_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "b_bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
