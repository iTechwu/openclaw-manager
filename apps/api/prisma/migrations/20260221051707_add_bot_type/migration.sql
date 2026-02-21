-- CreateEnum
CREATE TYPE "bot_type" AS ENUM ('GATEWAY', 'TOOL_SANDBOX', 'BROWSER_SANDBOX');

-- AlterTable
ALTER TABLE "b_bot" ADD COLUMN     "bot_type" "bot_type" NOT NULL DEFAULT 'GATEWAY';

-- CreateIndex
CREATE INDEX "b_bot_bot_type_idx" ON "b_bot"("bot_type");
