-- AlterTable
ALTER TABLE "b_skill" ADD COLUMN     "file_count" INTEGER,
ADD COLUMN     "files" JSONB,
ADD COLUMN     "files_synced_at" TIMESTAMPTZ(6),
ADD COLUMN     "has_init_script" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "has_references" BOOLEAN NOT NULL DEFAULT false;
