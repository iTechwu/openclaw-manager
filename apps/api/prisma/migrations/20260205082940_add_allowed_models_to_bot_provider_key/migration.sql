-- AlterTable
ALTER TABLE "b_bot_provider_key" ADD COLUMN     "allowed_models" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "primary_model" VARCHAR(100);
