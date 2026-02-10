-- CreateTable: SkillType
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

-- CreateIndex
CREATE UNIQUE INDEX "b_skill_type_slug_key" ON "b_skill_type"("slug");
CREATE INDEX "b_skill_type_slug_idx" ON "b_skill_type"("slug");
CREATE INDEX "b_skill_type_sort_order_idx" ON "b_skill_type"("sort_order");
CREATE INDEX "b_skill_type_is_deleted_idx" ON "b_skill_type"("is_deleted");

-- Add skill_type_id column to b_skill
ALTER TABLE "b_skill" ADD COLUMN "skill_type_id" UUID;

-- CreateIndex for skill_type_id
CREATE INDEX "b_skill_skill_type_id_idx" ON "b_skill"("skill_type_id");

-- AddForeignKey
ALTER TABLE "b_skill" ADD CONSTRAINT "b_skill_skill_type_id_fkey"
    FOREIGN KEY ("skill_type_id") REFERENCES "b_skill_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Insert default skill types with Chinese translations
INSERT INTO "b_skill_type" ("id", "slug", "name", "name_zh", "icon", "sort_order", "updated_at") VALUES
(uuid_generate_v4(), 'coding-agents', 'Coding Agents & IDEs', '编程代理与IDE', '💻', 1, NOW()),
(uuid_generate_v4(), 'git-github', 'Git & GitHub', 'Git与GitHub', '🔀', 2, NOW()),
(uuid_generate_v4(), 'moltbook', 'Moltbook', 'Moltbook', '📓', 3, NOW()),
(uuid_generate_v4(), 'web-frontend', 'Web & Frontend Development', 'Web与前端开发', '🌐', 4, NOW()),
(uuid_generate_v4(), 'devops-cloud', 'DevOps & Cloud', 'DevOps与云服务', '☁️', 5, NOW()),
(uuid_generate_v4(), 'browser-automation', 'Browser & Automation', '浏览器与自动化', '🤖', 6, NOW()),
(uuid_generate_v4(), 'image-video-gen', 'Image & Video Generation', '图像与视频生成', '🎨', 7, NOW()),
(uuid_generate_v4(), 'apple-apps', 'Apple Apps & Services', 'Apple应用与服务', '🍎', 8, NOW()),
(uuid_generate_v4(), 'search-research', 'Search & Research', '搜索与研究', '🔍', 9, NOW()),
(uuid_generate_v4(), 'clawdbot-tools', 'Clawdbot Tools', 'Clawdbot工具', '🔧', 10, NOW()),
(uuid_generate_v4(), 'cli-utilities', 'CLI Utilities', '命令行工具', '⌨️', 11, NOW()),
(uuid_generate_v4(), 'marketing-sales', 'Marketing & Sales', '营销与销售', '📈', 12, NOW()),
(uuid_generate_v4(), 'productivity-tasks', 'Productivity & Tasks', '生产力与任务', '✅', 13, NOW()),
(uuid_generate_v4(), 'ai-llms', 'AI & LLMs', 'AI与大语言模型', '🧠', 14, NOW()),
(uuid_generate_v4(), 'data-analytics', 'Data & Analytics', '数据与分析', '📊', 15, NOW()),
(uuid_generate_v4(), 'finance', 'Finance', '金融', '💰', 16, NOW()),
(uuid_generate_v4(), 'media-streaming', 'Media & Streaming', '媒体与流媒体', '🎬', 17, NOW()),
(uuid_generate_v4(), 'notes-pkm', 'Notes & PKM', '笔记与知识管理', '📝', 18, NOW()),
(uuid_generate_v4(), 'ios-macos-dev', 'iOS & macOS Development', 'iOS与macOS开发', '📱', 19, NOW()),
(uuid_generate_v4(), 'transportation', 'Transportation', '交通出行', '🚗', 20, NOW()),
(uuid_generate_v4(), 'personal-dev', 'Personal Development', '个人发展', '🌱', 21, NOW()),
(uuid_generate_v4(), 'health-fitness', 'Health & Fitness', '健康与健身', '💪', 22, NOW()),
(uuid_generate_v4(), 'communication', 'Communication', '通讯', '💬', 23, NOW()),
(uuid_generate_v4(), 'speech-transcription', 'Speech & Transcription', '语音与转录', '🎤', 24, NOW()),
(uuid_generate_v4(), 'smart-home-iot', 'Smart Home & IoT', '智能家居与物联网', '🏠', 25, NOW()),
(uuid_generate_v4(), 'shopping-ecommerce', 'Shopping & E-commerce', '购物与电商', '🛒', 26, NOW()),
(uuid_generate_v4(), 'calendar-scheduling', 'Calendar & Scheduling', '日历与日程', '📅', 27, NOW()),
(uuid_generate_v4(), 'pdf-documents', 'PDF & Documents', 'PDF与文档', '📄', 28, NOW()),
(uuid_generate_v4(), 'self-hosted', 'Self-Hosted & Automation', '自托管与自动化', '🖥️', 29, NOW()),
(uuid_generate_v4(), 'security-passwords', 'Security & Passwords', '安全与密码', '🔐', 30, NOW()),
(uuid_generate_v4(), 'gaming', 'Gaming', '游戏', '🎮', 31, NOW()),
(uuid_generate_v4(), 'agent-protocols', 'Agent-to-Agent Protocols', '代理间协议', '🔗', 32, NOW());

-- Migrate existing skills: Update skill_type_id based on category
UPDATE "b_skill" s
SET "skill_type_id" = st.id
FROM "b_skill_type" st
WHERE s.category = st.slug;

-- Drop old columns that are no longer needed
ALTER TABLE "b_skill" DROP COLUMN IF EXISTS "skill_type";
ALTER TABLE "b_skill" DROP COLUMN IF EXISTS "category";

-- Drop old indexes
DROP INDEX IF EXISTS "b_skill_skill_type_idx";
DROP INDEX IF EXISTS "b_skill_category_idx";
