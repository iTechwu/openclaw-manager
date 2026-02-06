-- Remove deprecated fields from b_bot table
-- These fields are now derived from BotProviderKey and BotChannel tables:
-- - ai_provider: derived from BotProviderKey (isPrimary=true) -> ProviderKey.vendor
-- - model: derived from BotProviderKey (isPrimary=true) -> primaryModel
-- - channel_type: derived from BotChannel (isEnabled=true) -> channelType

-- Drop the deprecated columns
ALTER TABLE "b_bot" DROP COLUMN IF EXISTS "ai_provider";
ALTER TABLE "b_bot" DROP COLUMN IF EXISTS "model";
ALTER TABLE "b_bot" DROP COLUMN IF EXISTS "channel_type";
