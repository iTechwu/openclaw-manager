-- AlterTable
ALTER TABLE "b_bot_skill" ADD COLUMN     "file_count" INTEGER,
ADD COLUMN     "has_references" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "script_executed" BOOLEAN NOT NULL DEFAULT false;
