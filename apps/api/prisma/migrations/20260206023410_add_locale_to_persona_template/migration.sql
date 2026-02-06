-- AlterTable
ALTER TABLE "b_persona_template" ADD COLUMN     "locale" VARCHAR(10) NOT NULL DEFAULT 'en';

-- CreateIndex
CREATE INDEX "b_persona_template_locale_idx" ON "b_persona_template"("locale");
