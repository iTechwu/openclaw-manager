-- AlterTable
ALTER TABLE "b_model_catalog" RENAME CONSTRAINT "b_model_pricing_pkey" TO "b_model_catalog_pkey";

-- RenameIndex
ALTER INDEX "b_complexity_routing_model_mapping_config_level_catalog_key" RENAME TO "b_complexity_routing_model_mapping_complexity_config_id_com_key";
