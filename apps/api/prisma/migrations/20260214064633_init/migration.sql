-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateEnum
CREATE TYPE "sex_type" AS ENUM ('UNKNOWN', 'MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "task_type" AS ENUM ('SMS', 'EMAIL', 'PUSH');

-- CreateEnum
CREATE TYPE "task_status" AS ENUM ('SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "file_bucket_vendor" AS ENUM ('oss', 'us3', 'qiniu', 's3', 'gcs', 'tos', 'tencent', 'ksyun');

-- CreateEnum
CREATE TYPE "file_env_type" AS ENUM ('dev', 'test', 'prod', 'produs', 'prodap');

-- CreateEnum
CREATE TYPE "bot_status" AS ENUM ('draft', 'created', 'starting', 'running', 'stopped', 'error');

-- CreateEnum
CREATE TYPE "health_status" AS ENUM ('HEALTHY', 'UNHEALTHY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "model_type" AS ENUM ('llm', 'text-embedding', 'speech2text', 'tts', 'moderation', 'rerank', 'image', 'video');

-- CreateEnum
CREATE TYPE "operate_type" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'START', 'STOP', 'EXPORT', 'IMPORT');

-- CreateEnum
CREATE TYPE "operate_target" AS ENUM ('BOT', 'PROVIDER_KEY', 'USER', 'PERSONA_TEMPLATE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "plugin_category" AS ENUM ('BROWSER', 'FILESYSTEM', 'DATABASE', 'API', 'COMMUNICATION', 'DEVELOPMENT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "channel_connection_status" AS ENUM ('DISCONNECTED', 'CONNECTING', 'CONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "model_routing_type" AS ENUM ('FUNCTION_ROUTE', 'LOAD_BALANCE', 'FAILOVER');

-- CreateTable
CREATE TABLE "u_user_info" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "nickname" VARCHAR(255) NOT NULL DEFAULT '',
    "code" VARCHAR(255),
    "avatar_file_id" UUID,
    "sex" "sex_type" NOT NULL DEFAULT 'UNKNOWN',
    "locale" VARCHAR(20),
    "is_anonymity" BOOLEAN NOT NULL DEFAULT false,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "device_id" VARCHAR(255),
    "wechat_openid" VARCHAR(255),
    "wechat_union_id" VARCHAR(255),
    "google_sub" VARCHAR(255),
    "discord_id" VARCHAR(255),
    "mobile" VARCHAR(40),
    "email" VARCHAR(255),

    CONSTRAINT "u_user_info_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b_persona_template" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" VARCHAR(255) NOT NULL,
    "emoji" VARCHAR(10),
    "avatar_file_id" UUID,
    "tagline" VARCHAR(500) NOT NULL,
    "soul_markdown" TEXT NOT NULL,
    "soul_preview" VARCHAR(500),
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "locale" VARCHAR(10) NOT NULL DEFAULT 'en',
    "created_by_id" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "b_persona_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "u_wechat_auth" (
    "openid" VARCHAR(255) NOT NULL,
    "session_key" TEXT,
    "refresh_token" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6)
);

-- CreateTable
CREATE TABLE "u_google_auth" (
    "sub" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "verified_email" BOOLEAN NOT NULL DEFAULT true,
    "at_hash" VARCHAR(255),
    "name" VARCHAR(255),
    "picture" TEXT,
    "given_name" VARCHAR(255),
    "family_name" VARCHAR(255),
    "exp" INTEGER NOT NULL,
    "iat" INTEGER NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6)
);

-- CreateTable
CREATE TABLE "u_discord_auth" (
    "discord_id" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "verified_email" BOOLEAN NOT NULL DEFAULT true,
    "name" VARCHAR(255),
    "access_token" TEXT,
    "refresh_token" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6)
);

-- CreateTable
CREATE TABLE "u_mobile_auth" (
    "mobile" VARCHAR(40) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6)
);

-- CreateTable
CREATE TABLE "u_email_auth" (
    "email" VARCHAR(255) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6)
);

-- CreateTable
CREATE TABLE "risk_detection_record" (
    "id" VARCHAR(255) NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "data" JSONB,
    "status" INTEGER NOT NULL DEFAULT 0,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "risk_detection_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_task_queue" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "task_type" "task_type" NOT NULL,
    "status" "task_status" NOT NULL,
    "recipient" VARCHAR(255) NOT NULL,
    "template_code" VARCHAR(100),
    "template_data" JSONB,
    "content" TEXT,
    "subject" VARCHAR(500),
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "processed_at" TIMESTAMPTZ(6) NOT NULL,
    "error_message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "system_task_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "f_file_source" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "is_uploaded" BOOLEAN NOT NULL DEFAULT false,
    "bucket" VARCHAR(255) NOT NULL,
    "key" VARCHAR(255) NOT NULL,
    "hash" VARCHAR(255),
    "thumb_img" VARCHAR(255),
    "fsize" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mime_type" VARCHAR(255) NOT NULL DEFAULT '',
    "type" INTEGER NOT NULL DEFAULT 0,
    "end_user" VARCHAR(255),
    "status" INTEGER NOT NULL DEFAULT 0,
    "sha256" VARCHAR(255),
    "parts" INTEGER[],
    "ext" VARCHAR(255) NOT NULL DEFAULT '',
    "expire_at" TIMESTAMPTZ(6),
    "transition_to_ia_at" TIMESTAMPTZ(6),
    "transition_to_archive_at" TIMESTAMPTZ(6),
    "transition_to_deep_archive_at" TIMESTAMPTZ(6),
    "transition_to_archive_ir_at" TIMESTAMPTZ(6),
    "env" "file_env_type" NOT NULL DEFAULT 'prod',
    "vendor" "file_bucket_vendor" NOT NULL DEFAULT 'us3',
    "region" TEXT NOT NULL DEFAULT 'cn-beijing',
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "f_file_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "country_code" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "continent" VARCHAR(10) NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "country_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b_bot" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" VARCHAR(255) NOT NULL,
    "hostname" VARCHAR(64) NOT NULL,
    "container_id" VARCHAR(255),
    "port" INTEGER,
    "gateway_token" VARCHAR(255),
    "proxy_token_hash" VARCHAR(64),
    "tags" TEXT[],
    "status" "bot_status" NOT NULL DEFAULT 'created',
    "created_by_id" UUID NOT NULL,
    "persona_template_id" UUID,
    "emoji" VARCHAR(10),
    "avatar_file_id" UUID,
    "soul_markdown" TEXT,
    "pending_config" JSONB,
    "health_status" "health_status" NOT NULL DEFAULT 'UNKNOWN',
    "last_health_check" TIMESTAMPTZ(6),
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "b_bot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b_provider_key" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "vendor" VARCHAR(50) NOT NULL,
    "api_type" VARCHAR(50),
    "secret_encrypted" BYTEA NOT NULL,
    "label" VARCHAR(255) NOT NULL,
    "tag" VARCHAR(100),
    "base_url" VARCHAR(500),
    "metadata" JSONB,
    "created_by_id" UUID NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "b_provider_key_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b_bot_model" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "bot_id" UUID NOT NULL,
    "model_id" VARCHAR(100) NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "b_bot_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b_model_availability" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "model" VARCHAR(100) NOT NULL,
    "provider_key_id" UUID NOT NULL,
    "model_catalog_id" UUID NOT NULL,
    "model_type" "model_type" NOT NULL DEFAULT 'llm',
    "is_available" BOOLEAN NOT NULL DEFAULT false,
    "last_verified_at" TIMESTAMPTZ(6) NOT NULL,
    "error_message" TEXT,
    "vendor_priority" INTEGER NOT NULL DEFAULT 0,
    "health_score" INTEGER NOT NULL DEFAULT 100,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "b_model_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b_model_capability_tag" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "model_catalog_id" UUID NOT NULL,
    "capability_tag_id" UUID NOT NULL,
    "match_source" VARCHAR(20) NOT NULL DEFAULT 'pattern',
    "confidence" INTEGER NOT NULL DEFAULT 100,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "b_model_capability_tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b_usage_log" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "bot_id" UUID NOT NULL,
    "vendor" VARCHAR(50) NOT NULL,
    "provider_key_id" UUID,
    "status_code" INTEGER,
    "request_tokens" INTEGER,
    "response_tokens" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "model" VARCHAR(100),
    "endpoint" VARCHAR(255),
    "duration_ms" INTEGER,
    "error_message" TEXT,
    "thinking_tokens" INTEGER,
    "cache_read_tokens" INTEGER,
    "cache_write_tokens" INTEGER,
    "protocol_type" VARCHAR(50),
    "input_cost" DECIMAL(10,6),
    "output_cost" DECIMAL(10,6),
    "thinking_cost" DECIMAL(10,6),
    "cache_cost" DECIMAL(10,6),
    "total_cost" DECIMAL(10,6),
    "fallback_used" BOOLEAN,
    "fallback_level" INTEGER,
    "original_model" VARCHAR(100),

    CONSTRAINT "b_usage_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b_proxy_token" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "bot_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "vendor" VARCHAR(50) NOT NULL,
    "key_id" UUID NOT NULL,
    "tags" TEXT[],
    "expires_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "last_used_at" TIMESTAMPTZ(6),
    "request_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "b_proxy_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "type" VARCHAR(50) NOT NULL,
    "title" VARCHAR(255),
    "content" JSONB NOT NULL,
    "sender_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_recipient" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "message_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "message_recipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operate_log" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "operate_type" "operate_type" NOT NULL,
    "target" "operate_target" NOT NULL,
    "target_id" UUID,
    "target_name" VARCHAR(255),
    "detail" JSONB,
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operate_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b_channel_definition" (
    "id" VARCHAR(50) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "icon" VARCHAR(10) NOT NULL,
    "popular" BOOLEAN NOT NULL DEFAULT false,
    "popular_locales" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "token_hint" VARCHAR(500) NOT NULL,
    "token_placeholder" VARCHAR(255) NOT NULL,
    "help_url" VARCHAR(500),
    "help_text" VARCHAR(255),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "b_channel_definition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b_channel_credential_field" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "channel_id" VARCHAR(50) NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "placeholder" VARCHAR(255) NOT NULL,
    "field_type" VARCHAR(20) NOT NULL DEFAULT 'text',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "b_channel_credential_field_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b_plugin" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "version" VARCHAR(20) NOT NULL,
    "author" VARCHAR(100),
    "category" "plugin_category" NOT NULL,
    "region" VARCHAR(20) NOT NULL DEFAULT 'global',
    "config_schema" JSONB,
    "default_config" JSONB,
    "mcp_config" JSONB,
    "is_official" BOOLEAN NOT NULL DEFAULT false,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "download_url" VARCHAR(500),
    "icon_emoji" VARCHAR(10),
    "icon_url" VARCHAR(500),
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "b_plugin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b_bot_plugin" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "bot_id" UUID NOT NULL,
    "plugin_id" UUID NOT NULL,
    "config" JSONB,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "b_bot_plugin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b_skill_type" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "slug" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "name_zh" VARCHAR(200),
    "description" TEXT,
    "description_zh" TEXT,
    "icon" VARCHAR(50),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "b_skill_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b_skill" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" VARCHAR(100) NOT NULL,
    "name_zh" VARCHAR(200),
    "slug" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "description_zh" TEXT,
    "version" VARCHAR(20) NOT NULL DEFAULT '1.0.0',
    "latest_version" VARCHAR(20),
    "skill_type_id" UUID,
    "definition" JSONB NOT NULL,
    "examples" JSONB,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "source" VARCHAR(50),
    "source_url" VARCHAR(500),
    "author" VARCHAR(100),
    "last_synced_at" TIMESTAMPTZ(6),
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "b_skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b_bot_skill" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "bot_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "config" JSONB,
    "installed_version" VARCHAR(20),
    "file_count" INTEGER,
    "script_executed" BOOLEAN NOT NULL DEFAULT false,
    "has_references" BOOLEAN NOT NULL DEFAULT false,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "b_bot_skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b_model_catalog" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "model" VARCHAR(100) NOT NULL,
    "vendor" VARCHAR(50) NOT NULL,
    "display_name" VARCHAR(255),
    "description" TEXT,
    "input_price" DECIMAL(10,6) NOT NULL,
    "output_price" DECIMAL(10,6) NOT NULL,
    "cache_read_price" DECIMAL(10,6),
    "cache_write_price" DECIMAL(10,6),
    "thinking_price" DECIMAL(10,6),
    "reasoning_score" INTEGER NOT NULL DEFAULT 50,
    "coding_score" INTEGER NOT NULL DEFAULT 50,
    "creativity_score" INTEGER NOT NULL DEFAULT 50,
    "speed_score" INTEGER NOT NULL DEFAULT 50,
    "context_length" INTEGER NOT NULL DEFAULT 128,
    "supports_extended_thinking" BOOLEAN NOT NULL DEFAULT false,
    "supports_cache_control" BOOLEAN NOT NULL DEFAULT false,
    "supports_vision" BOOLEAN NOT NULL DEFAULT false,
    "supports_function_calling" BOOLEAN NOT NULL DEFAULT true,
    "supports_streaming" BOOLEAN NOT NULL DEFAULT true,
    "recommended_scenarios" JSONB,
    "data_source" VARCHAR(20) NOT NULL DEFAULT 'manual',
    "source_url" VARCHAR(500),
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_deprecated" BOOLEAN NOT NULL DEFAULT false,
    "deprecation_date" TIMESTAMPTZ(6),
    "price_updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "metadata" JSONB,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "b_model_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b_bot_model_routing" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "bot_id" UUID NOT NULL,
    "routing_type" "model_routing_type" NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "config" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "b_bot_model_routing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b_bot_channel" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "bot_id" UUID NOT NULL,
    "channel_type" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "credentials_encrypted" BYTEA NOT NULL,
    "config" JSONB,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "connection_status" "channel_connection_status" NOT NULL DEFAULT 'DISCONNECTED',
    "last_connected_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "b_bot_channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b_capability_tag" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tag_id" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(50) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 50,
    "required_protocol" VARCHAR(50),
    "required_skills" JSONB,
    "required_models" JSONB,
    "requires_extended_thinking" BOOLEAN NOT NULL DEFAULT false,
    "requires_cache_control" BOOLEAN NOT NULL DEFAULT false,
    "requires_vision" BOOLEAN NOT NULL DEFAULT false,
    "max_cost_per_m_token" DECIMAL(10,6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_builtin" BOOLEAN NOT NULL DEFAULT false,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "b_capability_tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b_fallback_chain" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "chain_id" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "models" JSONB,
    "trigger_status_codes" JSONB NOT NULL DEFAULT '[429, 500, 502, 503, 504]',
    "trigger_error_types" JSONB NOT NULL DEFAULT '["rate_limit", "overloaded", "timeout"]',
    "trigger_timeout_ms" INTEGER NOT NULL DEFAULT 60000,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "retry_delay_ms" INTEGER NOT NULL DEFAULT 2000,
    "preserve_protocol" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_builtin" BOOLEAN NOT NULL DEFAULT false,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "b_fallback_chain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b_cost_strategy" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "strategy_id" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "cost_weight" DECIMAL(3,2) NOT NULL DEFAULT 0.5,
    "performance_weight" DECIMAL(3,2) NOT NULL DEFAULT 0.3,
    "capability_weight" DECIMAL(3,2) NOT NULL DEFAULT 0.2,
    "max_cost_per_request" DECIMAL(10,6),
    "max_latency_ms" INTEGER,
    "min_capability_score" INTEGER,
    "scenario_weights" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_builtin" BOOLEAN NOT NULL DEFAULT false,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "b_cost_strategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b_bot_routing_config" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "bot_id" UUID NOT NULL,
    "routing_enabled" BOOLEAN NOT NULL DEFAULT true,
    "routing_mode" VARCHAR(20) NOT NULL DEFAULT 'auto',
    "fallback_enabled" BOOLEAN NOT NULL DEFAULT true,
    "fallback_chain_id" VARCHAR(50),
    "cost_control_enabled" BOOLEAN NOT NULL DEFAULT false,
    "cost_strategy_id" VARCHAR(50),
    "daily_budget" DECIMAL(10,2),
    "monthly_budget" DECIMAL(10,2),
    "alert_threshold" DECIMAL(3,2) DEFAULT 0.8,
    "auto_downgrade" BOOLEAN NOT NULL DEFAULT false,
    "downgrade_model" VARCHAR(100),
    "complexity_routing_enabled" BOOLEAN NOT NULL DEFAULT false,
    "complexity_routing_config_id" VARCHAR(50),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "b_bot_routing_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b_complexity_routing_config" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "config_id" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "models" JSONB,
    "classifier_model" VARCHAR(100) NOT NULL DEFAULT 'deepseek-v3-250324',
    "classifier_vendor" VARCHAR(50) NOT NULL DEFAULT 'deepseek',
    "tool_min_complexity" VARCHAR(20),
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_builtin" BOOLEAN NOT NULL DEFAULT false,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "b_complexity_routing_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b_fallback_chain_model" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "fallback_chain_id" UUID NOT NULL,
    "model_catalog_id" UUID NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "protocol_override" VARCHAR(50),
    "features_override" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "b_fallback_chain_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b_complexity_routing_model_mapping" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "complexity_config_id" UUID NOT NULL,
    "complexity_level" VARCHAR(20) NOT NULL,
    "model_catalog_id" UUID NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "b_complexity_routing_model_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "u_user_info_code_key" ON "u_user_info"("code");

-- CreateIndex
CREATE UNIQUE INDEX "u_user_info_device_id_key" ON "u_user_info"("device_id");

-- CreateIndex
CREATE UNIQUE INDEX "u_user_info_wechat_openid_key" ON "u_user_info"("wechat_openid");

-- CreateIndex
CREATE UNIQUE INDEX "u_user_info_wechat_union_id_key" ON "u_user_info"("wechat_union_id");

-- CreateIndex
CREATE UNIQUE INDEX "u_user_info_google_sub_key" ON "u_user_info"("google_sub");

-- CreateIndex
CREATE UNIQUE INDEX "u_user_info_discord_id_key" ON "u_user_info"("discord_id");

-- CreateIndex
CREATE UNIQUE INDEX "u_user_info_mobile_key" ON "u_user_info"("mobile");

-- CreateIndex
CREATE UNIQUE INDEX "u_user_info_email_key" ON "u_user_info"("email");

-- CreateIndex
CREATE INDEX "u_user_info_code_idx" ON "u_user_info"("code");

-- CreateIndex
CREATE INDEX "u_user_info_is_deleted_is_admin_idx" ON "u_user_info"("is_deleted", "is_admin");

-- CreateIndex
CREATE INDEX "u_user_info_created_at_idx" ON "u_user_info"("created_at" DESC);

-- CreateIndex
CREATE INDEX "u_user_info_nickname_idx" ON "u_user_info"("nickname");

-- CreateIndex
CREATE INDEX "u_user_info_avatar_file_id_idx" ON "u_user_info"("avatar_file_id");

-- CreateIndex
CREATE INDEX "u_user_info_device_id_idx" ON "u_user_info"("device_id");

-- CreateIndex
CREATE INDEX "u_user_info_wechat_openid_idx" ON "u_user_info"("wechat_openid");

-- CreateIndex
CREATE INDEX "u_user_info_google_sub_idx" ON "u_user_info"("google_sub");

-- CreateIndex
CREATE INDEX "u_user_info_discord_id_idx" ON "u_user_info"("discord_id");

-- CreateIndex
CREATE INDEX "u_user_info_mobile_idx" ON "u_user_info"("mobile");

-- CreateIndex
CREATE INDEX "u_user_info_email_idx" ON "u_user_info"("email");

-- CreateIndex
CREATE INDEX "b_persona_template_is_system_idx" ON "b_persona_template"("is_system");

-- CreateIndex
CREATE INDEX "b_persona_template_created_by_id_idx" ON "b_persona_template"("created_by_id");

-- CreateIndex
CREATE INDEX "b_persona_template_avatar_file_id_idx" ON "b_persona_template"("avatar_file_id");

-- CreateIndex
CREATE INDEX "b_persona_template_is_deleted_idx" ON "b_persona_template"("is_deleted");

-- CreateIndex
CREATE INDEX "b_persona_template_locale_idx" ON "b_persona_template"("locale");

-- CreateIndex
CREATE INDEX "b_persona_template_created_at_idx" ON "b_persona_template"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "u_wechat_auth_openid_key" ON "u_wechat_auth"("openid");

-- CreateIndex
CREATE INDEX "u_wechat_auth_openid_idx" ON "u_wechat_auth"("openid");

-- CreateIndex
CREATE UNIQUE INDEX "u_google_auth_sub_key" ON "u_google_auth"("sub");

-- CreateIndex
CREATE INDEX "u_google_auth_sub_idx" ON "u_google_auth"("sub");

-- CreateIndex
CREATE INDEX "u_google_auth_email_idx" ON "u_google_auth"("email");

-- CreateIndex
CREATE UNIQUE INDEX "u_discord_auth_discord_id_key" ON "u_discord_auth"("discord_id");

-- CreateIndex
CREATE INDEX "u_discord_auth_discord_id_idx" ON "u_discord_auth"("discord_id");

-- CreateIndex
CREATE INDEX "u_discord_auth_email_idx" ON "u_discord_auth"("email");

-- CreateIndex
CREATE UNIQUE INDEX "u_mobile_auth_mobile_key" ON "u_mobile_auth"("mobile");

-- CreateIndex
CREATE INDEX "u_mobile_auth_mobile_idx" ON "u_mobile_auth"("mobile");

-- CreateIndex
CREATE UNIQUE INDEX "u_email_auth_email_key" ON "u_email_auth"("email");

-- CreateIndex
CREATE INDEX "u_email_auth_email_idx" ON "u_email_auth"("email");

-- CreateIndex
CREATE INDEX "risk_detection_record_action_idx" ON "risk_detection_record"("action");

-- CreateIndex
CREATE INDEX "risk_detection_record_status_idx" ON "risk_detection_record"("status");

-- CreateIndex
CREATE INDEX "risk_detection_record_created_at_idx" ON "risk_detection_record"("created_at" DESC);

-- CreateIndex
CREATE INDEX "system_task_queue_task_type_status_idx" ON "system_task_queue"("task_type", "status");

-- CreateIndex
CREATE INDEX "system_task_queue_recipient_created_at_idx" ON "system_task_queue"("recipient", "created_at" DESC);

-- CreateIndex
CREATE INDEX "system_task_queue_created_at_idx" ON "system_task_queue"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "f_file_source_key_key" ON "f_file_source"("key");

-- CreateIndex
CREATE INDEX "f_file_source_fsize_sha256_idx" ON "f_file_source"("fsize", "sha256");

-- CreateIndex
CREATE INDEX "f_file_source_is_deleted_idx" ON "f_file_source"("is_deleted");

-- CreateIndex
CREATE INDEX "f_file_source_is_uploaded_idx" ON "f_file_source"("is_uploaded");

-- CreateIndex
CREATE INDEX "f_file_source_bucket_idx" ON "f_file_source"("bucket");

-- CreateIndex
CREATE INDEX "f_file_source_key_idx" ON "f_file_source"("key");

-- CreateIndex
CREATE INDEX "country_code_continent_idx" ON "country_code"("continent");

-- CreateIndex
CREATE INDEX "country_code_code_idx" ON "country_code"("code");

-- CreateIndex
CREATE UNIQUE INDEX "country_code_continent_code_key" ON "country_code"("continent", "code");

-- CreateIndex
CREATE INDEX "b_bot_status_idx" ON "b_bot"("status");

-- CreateIndex
CREATE INDEX "b_bot_hostname_idx" ON "b_bot"("hostname");

-- CreateIndex
CREATE INDEX "b_bot_created_by_id_idx" ON "b_bot"("created_by_id");

-- CreateIndex
CREATE INDEX "b_bot_persona_template_id_idx" ON "b_bot"("persona_template_id");

-- CreateIndex
CREATE INDEX "b_bot_avatar_file_id_idx" ON "b_bot"("avatar_file_id");

-- CreateIndex
CREATE INDEX "b_bot_is_deleted_idx" ON "b_bot"("is_deleted");

-- CreateIndex
CREATE INDEX "b_bot_health_status_idx" ON "b_bot"("health_status");

-- CreateIndex
CREATE INDEX "b_provider_key_vendor_idx" ON "b_provider_key"("vendor");

-- CreateIndex
CREATE INDEX "b_provider_key_api_type_idx" ON "b_provider_key"("api_type");

-- CreateIndex
CREATE INDEX "b_provider_key_tag_idx" ON "b_provider_key"("tag");

-- CreateIndex
CREATE INDEX "b_provider_key_created_by_id_idx" ON "b_provider_key"("created_by_id");

-- CreateIndex
CREATE INDEX "b_provider_key_is_deleted_idx" ON "b_provider_key"("is_deleted");

-- CreateIndex
CREATE UNIQUE INDEX "b_provider_key_created_by_id_label_key" ON "b_provider_key"("created_by_id", "label");

-- CreateIndex
CREATE INDEX "b_bot_model_bot_id_idx" ON "b_bot_model"("bot_id");

-- CreateIndex
CREATE INDEX "b_bot_model_model_id_idx" ON "b_bot_model"("model_id");

-- CreateIndex
CREATE UNIQUE INDEX "b_bot_model_bot_id_model_id_key" ON "b_bot_model"("bot_id", "model_id");

-- CreateIndex
CREATE INDEX "b_model_availability_model_idx" ON "b_model_availability"("model");

-- CreateIndex
CREATE INDEX "b_model_availability_model_catalog_id_idx" ON "b_model_availability"("model_catalog_id");

-- CreateIndex
CREATE INDEX "b_model_availability_model_type_idx" ON "b_model_availability"("model_type");

-- CreateIndex
CREATE INDEX "b_model_availability_is_available_idx" ON "b_model_availability"("is_available");

-- CreateIndex
CREATE UNIQUE INDEX "b_model_availability_provider_key_id_model_key" ON "b_model_availability"("provider_key_id", "model");

-- CreateIndex
CREATE INDEX "b_model_capability_tag_model_catalog_id_idx" ON "b_model_capability_tag"("model_catalog_id");

-- CreateIndex
CREATE INDEX "b_model_capability_tag_capability_tag_id_idx" ON "b_model_capability_tag"("capability_tag_id");

-- CreateIndex
CREATE INDEX "b_model_capability_tag_match_source_idx" ON "b_model_capability_tag"("match_source");

-- CreateIndex
CREATE UNIQUE INDEX "b_model_capability_tag_model_catalog_id_capability_tag_id_key" ON "b_model_capability_tag"("model_catalog_id", "capability_tag_id");

-- CreateIndex
CREATE INDEX "b_usage_log_bot_id_idx" ON "b_usage_log"("bot_id");

-- CreateIndex
CREATE INDEX "b_usage_log_created_at_idx" ON "b_usage_log"("created_at");

-- CreateIndex
CREATE INDEX "b_usage_log_vendor_idx" ON "b_usage_log"("vendor");

-- CreateIndex
CREATE INDEX "b_usage_log_bot_id_created_at_idx" ON "b_usage_log"("bot_id", "created_at");

-- CreateIndex
CREATE INDEX "b_usage_log_bot_id_vendor_created_at_idx" ON "b_usage_log"("bot_id", "vendor", "created_at");

-- CreateIndex
CREATE INDEX "b_usage_log_model_idx" ON "b_usage_log"("model");

-- CreateIndex
CREATE INDEX "b_usage_log_protocol_type_idx" ON "b_usage_log"("protocol_type");

-- CreateIndex
CREATE INDEX "b_usage_log_fallback_used_idx" ON "b_usage_log"("fallback_used");

-- CreateIndex
CREATE UNIQUE INDEX "b_proxy_token_bot_id_key" ON "b_proxy_token"("bot_id");

-- CreateIndex
CREATE UNIQUE INDEX "b_proxy_token_token_hash_key" ON "b_proxy_token"("token_hash");

-- CreateIndex
CREATE INDEX "b_proxy_token_token_hash_idx" ON "b_proxy_token"("token_hash");

-- CreateIndex
CREATE INDEX "b_proxy_token_bot_id_idx" ON "b_proxy_token"("bot_id");

-- CreateIndex
CREATE INDEX "b_proxy_token_key_id_idx" ON "b_proxy_token"("key_id");

-- CreateIndex
CREATE INDEX "b_proxy_token_vendor_idx" ON "b_proxy_token"("vendor");

-- CreateIndex
CREATE INDEX "b_proxy_token_expires_at_idx" ON "b_proxy_token"("expires_at");

-- CreateIndex
CREATE INDEX "b_proxy_token_revoked_at_idx" ON "b_proxy_token"("revoked_at");

-- CreateIndex
CREATE INDEX "message_type_idx" ON "message"("type");

-- CreateIndex
CREATE INDEX "message_sender_id_idx" ON "message"("sender_id");

-- CreateIndex
CREATE INDEX "message_created_at_idx" ON "message"("created_at");

-- CreateIndex
CREATE INDEX "message_is_deleted_idx" ON "message"("is_deleted");

-- CreateIndex
CREATE INDEX "message_recipient_user_id_is_read_idx" ON "message_recipient"("user_id", "is_read");

-- CreateIndex
CREATE INDEX "message_recipient_message_id_idx" ON "message_recipient"("message_id");

-- CreateIndex
CREATE INDEX "message_recipient_is_deleted_idx" ON "message_recipient"("is_deleted");

-- CreateIndex
CREATE INDEX "message_recipient_user_id_is_read_is_deleted_idx" ON "message_recipient"("user_id", "is_read", "is_deleted");

-- CreateIndex
CREATE UNIQUE INDEX "message_recipient_message_id_user_id_key" ON "message_recipient"("message_id", "user_id");

-- CreateIndex
CREATE INDEX "operate_log_user_id_idx" ON "operate_log"("user_id");

-- CreateIndex
CREATE INDEX "operate_log_operate_type_idx" ON "operate_log"("operate_type");

-- CreateIndex
CREATE INDEX "operate_log_target_idx" ON "operate_log"("target");

-- CreateIndex
CREATE INDEX "operate_log_target_id_idx" ON "operate_log"("target_id");

-- CreateIndex
CREATE INDEX "operate_log_created_at_idx" ON "operate_log"("created_at" DESC);

-- CreateIndex
CREATE INDEX "b_channel_definition_popular_idx" ON "b_channel_definition"("popular");

-- CreateIndex
CREATE INDEX "b_channel_definition_sort_order_idx" ON "b_channel_definition"("sort_order");

-- CreateIndex
CREATE INDEX "b_channel_definition_is_deleted_idx" ON "b_channel_definition"("is_deleted");

-- CreateIndex
CREATE INDEX "b_channel_credential_field_channel_id_idx" ON "b_channel_credential_field"("channel_id");

-- CreateIndex
CREATE INDEX "b_channel_credential_field_sort_order_idx" ON "b_channel_credential_field"("sort_order");

-- CreateIndex
CREATE INDEX "b_channel_credential_field_is_deleted_idx" ON "b_channel_credential_field"("is_deleted");

-- CreateIndex
CREATE UNIQUE INDEX "b_channel_credential_field_channel_id_key_key" ON "b_channel_credential_field"("channel_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "b_plugin_slug_key" ON "b_plugin"("slug");

-- CreateIndex
CREATE INDEX "b_plugin_category_idx" ON "b_plugin"("category");

-- CreateIndex
CREATE INDEX "b_plugin_region_idx" ON "b_plugin"("region");

-- CreateIndex
CREATE INDEX "b_plugin_is_official_idx" ON "b_plugin"("is_official");

-- CreateIndex
CREATE INDEX "b_plugin_is_enabled_idx" ON "b_plugin"("is_enabled");

-- CreateIndex
CREATE INDEX "b_plugin_is_deleted_idx" ON "b_plugin"("is_deleted");

-- CreateIndex
CREATE INDEX "b_bot_plugin_bot_id_idx" ON "b_bot_plugin"("bot_id");

-- CreateIndex
CREATE INDEX "b_bot_plugin_plugin_id_idx" ON "b_bot_plugin"("plugin_id");

-- CreateIndex
CREATE INDEX "b_bot_plugin_is_enabled_idx" ON "b_bot_plugin"("is_enabled");

-- CreateIndex
CREATE UNIQUE INDEX "b_bot_plugin_bot_id_plugin_id_key" ON "b_bot_plugin"("bot_id", "plugin_id");

-- CreateIndex
CREATE UNIQUE INDEX "b_skill_type_slug_key" ON "b_skill_type"("slug");

-- CreateIndex
CREATE INDEX "b_skill_type_slug_idx" ON "b_skill_type"("slug");

-- CreateIndex
CREATE INDEX "b_skill_type_sort_order_idx" ON "b_skill_type"("sort_order");

-- CreateIndex
CREATE INDEX "b_skill_type_is_deleted_idx" ON "b_skill_type"("is_deleted");

-- CreateIndex
CREATE INDEX "b_skill_skill_type_id_idx" ON "b_skill"("skill_type_id");

-- CreateIndex
CREATE INDEX "b_skill_is_system_idx" ON "b_skill"("is_system");

-- CreateIndex
CREATE INDEX "b_skill_is_enabled_idx" ON "b_skill"("is_enabled");

-- CreateIndex
CREATE INDEX "b_skill_created_by_id_idx" ON "b_skill"("created_by_id");

-- CreateIndex
CREATE INDEX "b_skill_is_deleted_idx" ON "b_skill"("is_deleted");

-- CreateIndex
CREATE INDEX "b_skill_source_idx" ON "b_skill"("source");

-- CreateIndex
CREATE INDEX "b_skill_last_synced_at_idx" ON "b_skill"("last_synced_at");

-- CreateIndex
CREATE UNIQUE INDEX "b_skill_slug_created_by_id_key" ON "b_skill"("slug", "created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "b_skill_source_slug_key" ON "b_skill"("source", "slug");

-- CreateIndex
CREATE INDEX "b_bot_skill_bot_id_idx" ON "b_bot_skill"("bot_id");

-- CreateIndex
CREATE INDEX "b_bot_skill_skill_id_idx" ON "b_bot_skill"("skill_id");

-- CreateIndex
CREATE INDEX "b_bot_skill_is_enabled_idx" ON "b_bot_skill"("is_enabled");

-- CreateIndex
CREATE UNIQUE INDEX "b_bot_skill_bot_id_skill_id_key" ON "b_bot_skill"("bot_id", "skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "b_model_catalog_model_key" ON "b_model_catalog"("model");

-- CreateIndex
CREATE INDEX "b_model_catalog_vendor_idx" ON "b_model_catalog"("vendor");

-- CreateIndex
CREATE INDEX "b_model_catalog_is_enabled_idx" ON "b_model_catalog"("is_enabled");

-- CreateIndex
CREATE INDEX "b_model_catalog_is_deprecated_idx" ON "b_model_catalog"("is_deprecated");

-- CreateIndex
CREATE INDEX "b_model_catalog_is_deleted_idx" ON "b_model_catalog"("is_deleted");

-- CreateIndex
CREATE INDEX "b_model_catalog_supports_extended_thinking_idx" ON "b_model_catalog"("supports_extended_thinking");

-- CreateIndex
CREATE INDEX "b_model_catalog_supports_cache_control_idx" ON "b_model_catalog"("supports_cache_control");

-- CreateIndex
CREATE INDEX "b_bot_model_routing_bot_id_idx" ON "b_bot_model_routing"("bot_id");

-- CreateIndex
CREATE INDEX "b_bot_model_routing_routing_type_idx" ON "b_bot_model_routing"("routing_type");

-- CreateIndex
CREATE INDEX "b_bot_model_routing_priority_idx" ON "b_bot_model_routing"("priority");

-- CreateIndex
CREATE INDEX "b_bot_model_routing_is_enabled_idx" ON "b_bot_model_routing"("is_enabled");

-- CreateIndex
CREATE INDEX "b_bot_model_routing_is_deleted_idx" ON "b_bot_model_routing"("is_deleted");

-- CreateIndex
CREATE INDEX "b_bot_channel_bot_id_idx" ON "b_bot_channel"("bot_id");

-- CreateIndex
CREATE INDEX "b_bot_channel_channel_type_idx" ON "b_bot_channel"("channel_type");

-- CreateIndex
CREATE INDEX "b_bot_channel_is_enabled_idx" ON "b_bot_channel"("is_enabled");

-- CreateIndex
CREATE INDEX "b_bot_channel_connection_status_idx" ON "b_bot_channel"("connection_status");

-- CreateIndex
CREATE INDEX "b_bot_channel_is_deleted_idx" ON "b_bot_channel"("is_deleted");

-- CreateIndex
CREATE UNIQUE INDEX "b_bot_channel_bot_id_channel_type_name_key" ON "b_bot_channel"("bot_id", "channel_type", "name");

-- CreateIndex
CREATE UNIQUE INDEX "b_capability_tag_tag_id_key" ON "b_capability_tag"("tag_id");

-- CreateIndex
CREATE INDEX "b_capability_tag_category_idx" ON "b_capability_tag"("category");

-- CreateIndex
CREATE INDEX "b_capability_tag_is_active_idx" ON "b_capability_tag"("is_active");

-- CreateIndex
CREATE INDEX "b_capability_tag_is_builtin_idx" ON "b_capability_tag"("is_builtin");

-- CreateIndex
CREATE INDEX "b_capability_tag_is_deleted_idx" ON "b_capability_tag"("is_deleted");

-- CreateIndex
CREATE UNIQUE INDEX "b_fallback_chain_chain_id_key" ON "b_fallback_chain"("chain_id");

-- CreateIndex
CREATE INDEX "b_fallback_chain_is_active_idx" ON "b_fallback_chain"("is_active");

-- CreateIndex
CREATE INDEX "b_fallback_chain_is_builtin_idx" ON "b_fallback_chain"("is_builtin");

-- CreateIndex
CREATE INDEX "b_fallback_chain_is_deleted_idx" ON "b_fallback_chain"("is_deleted");

-- CreateIndex
CREATE UNIQUE INDEX "b_cost_strategy_strategy_id_key" ON "b_cost_strategy"("strategy_id");

-- CreateIndex
CREATE INDEX "b_cost_strategy_is_active_idx" ON "b_cost_strategy"("is_active");

-- CreateIndex
CREATE INDEX "b_cost_strategy_is_builtin_idx" ON "b_cost_strategy"("is_builtin");

-- CreateIndex
CREATE INDEX "b_cost_strategy_is_deleted_idx" ON "b_cost_strategy"("is_deleted");

-- CreateIndex
CREATE UNIQUE INDEX "b_bot_routing_config_bot_id_key" ON "b_bot_routing_config"("bot_id");

-- CreateIndex
CREATE INDEX "b_bot_routing_config_bot_id_idx" ON "b_bot_routing_config"("bot_id");

-- CreateIndex
CREATE INDEX "b_bot_routing_config_routing_enabled_idx" ON "b_bot_routing_config"("routing_enabled");

-- CreateIndex
CREATE INDEX "b_bot_routing_config_cost_control_enabled_idx" ON "b_bot_routing_config"("cost_control_enabled");

-- CreateIndex
CREATE INDEX "b_bot_routing_config_complexity_routing_enabled_idx" ON "b_bot_routing_config"("complexity_routing_enabled");

-- CreateIndex
CREATE UNIQUE INDEX "b_complexity_routing_config_config_id_key" ON "b_complexity_routing_config"("config_id");

-- CreateIndex
CREATE INDEX "b_complexity_routing_config_config_id_idx" ON "b_complexity_routing_config"("config_id");

-- CreateIndex
CREATE INDEX "b_complexity_routing_config_is_enabled_idx" ON "b_complexity_routing_config"("is_enabled");

-- CreateIndex
CREATE INDEX "b_complexity_routing_config_is_deleted_idx" ON "b_complexity_routing_config"("is_deleted");

-- CreateIndex
CREATE INDEX "b_fallback_chain_model_fallback_chain_id_idx" ON "b_fallback_chain_model"("fallback_chain_id");

-- CreateIndex
CREATE INDEX "b_fallback_chain_model_model_catalog_id_idx" ON "b_fallback_chain_model"("model_catalog_id");

-- CreateIndex
CREATE INDEX "b_fallback_chain_model_priority_idx" ON "b_fallback_chain_model"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "b_fallback_chain_model_fallback_chain_id_model_catalog_id_key" ON "b_fallback_chain_model"("fallback_chain_id", "model_catalog_id");

-- CreateIndex
CREATE INDEX "b_complexity_routing_model_mapping_complexity_config_id_idx" ON "b_complexity_routing_model_mapping"("complexity_config_id");

-- CreateIndex
CREATE INDEX "b_complexity_routing_model_mapping_model_catalog_id_idx" ON "b_complexity_routing_model_mapping"("model_catalog_id");

-- CreateIndex
CREATE INDEX "b_complexity_routing_model_mapping_complexity_level_idx" ON "b_complexity_routing_model_mapping"("complexity_level");

-- CreateIndex
CREATE UNIQUE INDEX "b_complexity_routing_model_mapping_complexity_config_id_com_key" ON "b_complexity_routing_model_mapping"("complexity_config_id", "complexity_level", "model_catalog_id");

-- AddForeignKey
ALTER TABLE "u_user_info" ADD CONSTRAINT "u_user_info_avatar_file_id_fkey" FOREIGN KEY ("avatar_file_id") REFERENCES "f_file_source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b_persona_template" ADD CONSTRAINT "b_persona_template_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "u_user_info"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b_persona_template" ADD CONSTRAINT "b_persona_template_avatar_file_id_fkey" FOREIGN KEY ("avatar_file_id") REFERENCES "f_file_source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "u_wechat_auth" ADD CONSTRAINT "u_wechat_auth_openid_fkey" FOREIGN KEY ("openid") REFERENCES "u_user_info"("wechat_openid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "u_google_auth" ADD CONSTRAINT "u_google_auth_sub_fkey" FOREIGN KEY ("sub") REFERENCES "u_user_info"("google_sub") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "u_discord_auth" ADD CONSTRAINT "u_discord_auth_discord_id_fkey" FOREIGN KEY ("discord_id") REFERENCES "u_user_info"("discord_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "u_mobile_auth" ADD CONSTRAINT "u_mobile_auth_mobile_fkey" FOREIGN KEY ("mobile") REFERENCES "u_user_info"("mobile") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "u_email_auth" ADD CONSTRAINT "u_email_auth_email_fkey" FOREIGN KEY ("email") REFERENCES "u_user_info"("email") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b_bot" ADD CONSTRAINT "b_bot_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "u_user_info"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b_bot" ADD CONSTRAINT "b_bot_persona_template_id_fkey" FOREIGN KEY ("persona_template_id") REFERENCES "b_persona_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b_bot" ADD CONSTRAINT "b_bot_avatar_file_id_fkey" FOREIGN KEY ("avatar_file_id") REFERENCES "f_file_source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b_provider_key" ADD CONSTRAINT "b_provider_key_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "u_user_info"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b_bot_model" ADD CONSTRAINT "b_bot_model_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "b_bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b_model_availability" ADD CONSTRAINT "b_model_availability_provider_key_id_fkey" FOREIGN KEY ("provider_key_id") REFERENCES "b_provider_key"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b_model_availability" ADD CONSTRAINT "b_model_availability_model_catalog_id_fkey" FOREIGN KEY ("model_catalog_id") REFERENCES "b_model_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b_model_capability_tag" ADD CONSTRAINT "b_model_capability_tag_model_catalog_id_fkey" FOREIGN KEY ("model_catalog_id") REFERENCES "b_model_catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b_model_capability_tag" ADD CONSTRAINT "b_model_capability_tag_capability_tag_id_fkey" FOREIGN KEY ("capability_tag_id") REFERENCES "b_capability_tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b_usage_log" ADD CONSTRAINT "b_usage_log_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "b_bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b_usage_log" ADD CONSTRAINT "b_usage_log_provider_key_id_fkey" FOREIGN KEY ("provider_key_id") REFERENCES "b_provider_key"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b_proxy_token" ADD CONSTRAINT "b_proxy_token_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "b_bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b_proxy_token" ADD CONSTRAINT "b_proxy_token_key_id_fkey" FOREIGN KEY ("key_id") REFERENCES "b_provider_key"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "u_user_info"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_recipient" ADD CONSTRAINT "message_recipient_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_recipient" ADD CONSTRAINT "message_recipient_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "u_user_info"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operate_log" ADD CONSTRAINT "operate_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "u_user_info"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b_channel_credential_field" ADD CONSTRAINT "b_channel_credential_field_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "b_channel_definition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b_bot_plugin" ADD CONSTRAINT "b_bot_plugin_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "b_bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b_bot_plugin" ADD CONSTRAINT "b_bot_plugin_plugin_id_fkey" FOREIGN KEY ("plugin_id") REFERENCES "b_plugin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b_skill" ADD CONSTRAINT "b_skill_skill_type_id_fkey" FOREIGN KEY ("skill_type_id") REFERENCES "b_skill_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b_bot_skill" ADD CONSTRAINT "b_bot_skill_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "b_bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b_bot_skill" ADD CONSTRAINT "b_bot_skill_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "b_skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b_bot_model_routing" ADD CONSTRAINT "b_bot_model_routing_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "b_bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b_bot_channel" ADD CONSTRAINT "b_bot_channel_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "b_bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b_bot_routing_config" ADD CONSTRAINT "b_bot_routing_config_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "b_bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b_fallback_chain_model" ADD CONSTRAINT "b_fallback_chain_model_fallback_chain_id_fkey" FOREIGN KEY ("fallback_chain_id") REFERENCES "b_fallback_chain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b_fallback_chain_model" ADD CONSTRAINT "b_fallback_chain_model_model_catalog_id_fkey" FOREIGN KEY ("model_catalog_id") REFERENCES "b_model_catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b_complexity_routing_model_mapping" ADD CONSTRAINT "b_complexity_routing_model_mapping_complexity_config_id_fkey" FOREIGN KEY ("complexity_config_id") REFERENCES "b_complexity_routing_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b_complexity_routing_model_mapping" ADD CONSTRAINT "b_complexity_routing_model_mapping_model_catalog_id_fkey" FOREIGN KEY ("model_catalog_id") REFERENCES "b_model_catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
