-- Migration: Refactor ModelPricing → ModelCatalog
-- 将 ModelPricing 重命名为 ModelCatalog，将路由相关表的外键从 ModelAvailability 改为 ModelCatalog

-- ============================================================================
-- Step 1: 重命名 b_model_pricing → b_model_catalog
-- ============================================================================
ALTER TABLE "b_model_pricing" RENAME TO "b_model_catalog";

-- 重命名相关索引（PostgreSQL 会自动保留索引，但名称需要更新）
ALTER INDEX IF EXISTS "b_model_pricing_model_key" RENAME TO "b_model_catalog_model_key";
ALTER INDEX IF EXISTS "b_model_pricing_vendor_idx" RENAME TO "b_model_catalog_vendor_idx";
ALTER INDEX IF EXISTS "b_model_pricing_is_enabled_idx" RENAME TO "b_model_catalog_is_enabled_idx";
ALTER INDEX IF EXISTS "b_model_pricing_is_deprecated_idx" RENAME TO "b_model_catalog_is_deprecated_idx";
ALTER INDEX IF EXISTS "b_model_pricing_is_deleted_idx" RENAME TO "b_model_catalog_is_deleted_idx";
ALTER INDEX IF EXISTS "b_model_pricing_supports_extended_thinking_idx" RENAME TO "b_model_catalog_supports_extended_thinking_idx";
ALTER INDEX IF EXISTS "b_model_pricing_supports_cache_control_idx" RENAME TO "b_model_catalog_supports_cache_control_idx";

-- ============================================================================
-- Step 2: ModelAvailability - 新增 model_catalog_id, vendor_priority, health_score
-- ============================================================================
ALTER TABLE "b_model_availability"
  ADD COLUMN "model_catalog_id" UUID,
  ADD COLUMN "vendor_priority" INT NOT NULL DEFAULT 0,
  ADD COLUMN "health_score" INT NOT NULL DEFAULT 100;

-- 回填 model_catalog_id（通过 model 字段关联）
UPDATE "b_model_availability" ma
SET "model_catalog_id" = mc."id"
FROM "b_model_catalog" mc
WHERE ma."model" = mc."model";

-- 添加外键约束
ALTER TABLE "b_model_availability"
  ADD CONSTRAINT "b_model_availability_model_catalog_id_fkey"
  FOREIGN KEY ("model_catalog_id") REFERENCES "b_model_catalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 添加索引
CREATE INDEX "b_model_availability_model_catalog_id_idx" ON "b_model_availability"("model_catalog_id");

-- ============================================================================
-- Step 3: ModelCapabilityTag - 新增 model_catalog_id，回填，切换外键
-- ============================================================================
ALTER TABLE "b_model_capability_tag"
  ADD COLUMN "model_catalog_id" UUID;

-- 回填 model_catalog_id（通过 ModelAvailability 关联）
UPDATE "b_model_capability_tag" mct
SET "model_catalog_id" = ma."model_catalog_id"
FROM "b_model_availability" ma
WHERE mct."model_availability_id" = ma."id";

-- 去重：同一模型的多个 vendor 实例可能产生重复的能力标签
-- 保留每个 (model_catalog_id, capability_tag_id) 的第一条记录
DELETE FROM "b_model_capability_tag" t1
USING "b_model_capability_tag" t2
WHERE t1."model_catalog_id" IS NOT NULL
  AND t2."model_catalog_id" IS NOT NULL
  AND t1."model_catalog_id" = t2."model_catalog_id"
  AND t1."capability_tag_id" = t2."capability_tag_id"
  AND t1."created_at" > t2."created_at";

-- 删除无法关联的孤立记录
DELETE FROM "b_model_capability_tag" WHERE "model_catalog_id" IS NULL;

-- 设置 NOT NULL
ALTER TABLE "b_model_capability_tag" ALTER COLUMN "model_catalog_id" SET NOT NULL;

-- 移除旧外键和索引
ALTER TABLE "b_model_capability_tag" DROP CONSTRAINT IF EXISTS "b_model_capability_tag_model_availability_id_fkey";
DROP INDEX IF EXISTS "b_model_capability_tag_model_availability_id_idx";
DROP INDEX IF EXISTS "b_model_capability_tag_model_availability_id_capability_ta_key";

-- 添加新外键和索引
ALTER TABLE "b_model_capability_tag"
  ADD CONSTRAINT "b_model_capability_tag_model_catalog_id_fkey"
  FOREIGN KEY ("model_catalog_id") REFERENCES "b_model_catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "b_model_capability_tag_model_catalog_id_idx" ON "b_model_capability_tag"("model_catalog_id");
CREATE UNIQUE INDEX "b_model_capability_tag_model_catalog_id_capability_tag_id_key" ON "b_model_capability_tag"("model_catalog_id", "capability_tag_id");

-- 移除旧字段
ALTER TABLE "b_model_capability_tag" DROP COLUMN "model_availability_id";

-- ============================================================================
-- Step 4: FallbackChainModel - 新增 model_catalog_id，回填，切换外键
-- ============================================================================
ALTER TABLE "b_fallback_chain_model"
  ADD COLUMN "model_catalog_id" UUID;

-- 回填 model_catalog_id
UPDATE "b_fallback_chain_model" fcm
SET "model_catalog_id" = ma."model_catalog_id"
FROM "b_model_availability" ma
WHERE fcm."model_availability_id" = ma."id";

-- 删除无法关联的孤立记录
DELETE FROM "b_fallback_chain_model" WHERE "model_catalog_id" IS NULL;

-- 设置 NOT NULL
ALTER TABLE "b_fallback_chain_model" ALTER COLUMN "model_catalog_id" SET NOT NULL;

-- 移除旧外键和索引
ALTER TABLE "b_fallback_chain_model" DROP CONSTRAINT IF EXISTS "b_fallback_chain_model_model_availability_id_fkey";
DROP INDEX IF EXISTS "b_fallback_chain_model_model_availability_id_idx";
DROP INDEX IF EXISTS "b_fallback_chain_model_fallback_chain_id_model_availability_key";

-- 添加新外键和索引
ALTER TABLE "b_fallback_chain_model"
  ADD CONSTRAINT "b_fallback_chain_model_model_catalog_id_fkey"
  FOREIGN KEY ("model_catalog_id") REFERENCES "b_model_catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "b_fallback_chain_model_model_catalog_id_idx" ON "b_fallback_chain_model"("model_catalog_id");
CREATE UNIQUE INDEX "b_fallback_chain_model_fallback_chain_id_model_catalog_id_key" ON "b_fallback_chain_model"("fallback_chain_id", "model_catalog_id");

-- 移除旧字段
ALTER TABLE "b_fallback_chain_model" DROP COLUMN "model_availability_id";

-- ============================================================================
-- Step 5: ComplexityRoutingModelMapping - 新增 model_catalog_id，回填，切换外键
-- ============================================================================
ALTER TABLE "b_complexity_routing_model_mapping"
  ADD COLUMN "model_catalog_id" UUID;

-- 回填 model_catalog_id
UPDATE "b_complexity_routing_model_mapping" crm
SET "model_catalog_id" = ma."model_catalog_id"
FROM "b_model_availability" ma
WHERE crm."model_availability_id" = ma."id";

-- 删除无法关联的孤立记录
DELETE FROM "b_complexity_routing_model_mapping" WHERE "model_catalog_id" IS NULL;

-- 设置 NOT NULL
ALTER TABLE "b_complexity_routing_model_mapping" ALTER COLUMN "model_catalog_id" SET NOT NULL;

-- 移除旧外键和索引
ALTER TABLE "b_complexity_routing_model_mapping" DROP CONSTRAINT IF EXISTS "b_complexity_routing_model_mapping_model_availability_id_fkey";
DROP INDEX IF EXISTS "b_complexity_routing_model_mapping_model_availability_id_idx";
DROP INDEX IF EXISTS "b_complexity_routing_model_mappin_complexity_config_id_comp_key";

-- 添加新外键和索引
ALTER TABLE "b_complexity_routing_model_mapping"
  ADD CONSTRAINT "b_complexity_routing_model_mapping_model_catalog_id_fkey"
  FOREIGN KEY ("model_catalog_id") REFERENCES "b_model_catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "b_complexity_routing_model_mapping_model_catalog_id_idx" ON "b_complexity_routing_model_mapping"("model_catalog_id");
CREATE UNIQUE INDEX "b_complexity_routing_model_mapping_config_level_catalog_key" ON "b_complexity_routing_model_mapping"("complexity_config_id", "complexity_level", "model_catalog_id");

-- 移除旧字段
ALTER TABLE "b_complexity_routing_model_mapping" DROP COLUMN "model_availability_id";

-- ============================================================================
-- Step 6: ModelAvailability - 清理旧字段
-- ============================================================================
-- 移除旧的 model_pricing_id 外键和索引
ALTER TABLE "b_model_availability" DROP CONSTRAINT IF EXISTS "b_model_availability_model_pricing_id_fkey";
DROP INDEX IF EXISTS "b_model_availability_model_pricing_id_idx";
ALTER TABLE "b_model_availability" DROP COLUMN IF EXISTS "model_pricing_id";

-- 移除同步追踪字段
DROP INDEX IF EXISTS "b_model_availability_pricing_synced_idx";
DROP INDEX IF EXISTS "b_model_availability_tags_synced_idx";
ALTER TABLE "b_model_availability" DROP COLUMN IF EXISTS "pricing_synced";
ALTER TABLE "b_model_availability" DROP COLUMN IF EXISTS "pricing_synced_at";
ALTER TABLE "b_model_availability" DROP COLUMN IF EXISTS "tags_synced";
ALTER TABLE "b_model_availability" DROP COLUMN IF EXISTS "tags_synced_at";
