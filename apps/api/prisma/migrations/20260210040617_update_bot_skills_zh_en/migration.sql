/*
  Warnings:

  - A unique constraint covering the columns `[source,slug]` on the table `b_skill` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "b_skill" ADD COLUMN     "author" VARCHAR(100),
ADD COLUMN     "category" VARCHAR(100),
ADD COLUMN     "description_zh" TEXT,
ADD COLUMN     "last_synced_at" TIMESTAMPTZ(6),
ADD COLUMN     "name_zh" VARCHAR(200),
ADD COLUMN     "source" VARCHAR(50),
ADD COLUMN     "source_url" VARCHAR(500);

-- CreateIndex
CREATE INDEX "b_skill_category_idx" ON "b_skill"("category");

-- CreateIndex
CREATE INDEX "b_skill_source_idx" ON "b_skill"("source");

-- CreateIndex
CREATE INDEX "b_skill_last_synced_at_idx" ON "b_skill"("last_synced_at");

-- CreateIndex
CREATE UNIQUE INDEX "b_skill_source_slug_key" ON "b_skill"("source", "slug");
