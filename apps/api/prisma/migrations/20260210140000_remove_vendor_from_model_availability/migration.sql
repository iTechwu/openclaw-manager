-- Remove vendor column from b_model_availability table
-- Vendor information is now derived from the related ProviderKey

-- DropIndex
DROP INDEX IF EXISTS "b_model_availability_vendor_model_idx";

-- AlterTable
ALTER TABLE "b_model_availability" DROP COLUMN IF EXISTS "vendor";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "b_model_availability_model_idx" ON "b_model_availability"("model");
