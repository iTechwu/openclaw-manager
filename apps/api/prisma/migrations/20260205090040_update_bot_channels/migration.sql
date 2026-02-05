-- AlterTable
ALTER TABLE "b_channel_definition" ADD COLUMN     "popular_locales" TEXT[] DEFAULT ARRAY[]::TEXT[];
