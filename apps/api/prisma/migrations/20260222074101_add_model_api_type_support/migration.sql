-- AlterTable
ALTER TABLE "b_model_availability" ADD COLUMN     "preferred_api_type" VARCHAR(50),
ADD COLUMN     "supported_api_types" TEXT[] DEFAULT ARRAY['openai']::TEXT[];

-- AlterTable
ALTER TABLE "b_model_catalog" ADD COLUMN     "anthropic_model_id" VARCHAR(100),
ADD COLUMN     "model_layer" VARCHAR(20) NOT NULL DEFAULT 'production',
ADD COLUMN     "recommend_anthropic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recommend_reason" VARCHAR(500),
ADD COLUMN     "supported_api_types" TEXT[] DEFAULT ARRAY['openai']::TEXT[];

-- CreateIndex
CREATE INDEX "b_model_availability_preferred_api_type_idx" ON "b_model_availability"("preferred_api_type");

-- CreateIndex
CREATE INDEX "b_model_catalog_recommend_anthropic_idx" ON "b_model_catalog"("recommend_anthropic");

-- CreateIndex
CREATE INDEX "b_model_catalog_model_layer_idx" ON "b_model_catalog"("model_layer");
