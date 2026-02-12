/**
 * OpenClaw Skill Sync Client
 *
 * 职责：
 * - 从 GitHub 仓库同步 OpenClaw 技能库
 * - 解析 README.md 提取技能信息
 * - 支持增量同步和全量同步
 * - 支持本地文件缓存（GitHub 不可用时的降级方案）
 */
import { Injectable, Inject } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

/**
 * 解析后的技能信息
 */
export interface ParsedSkill {
  /** 技能 slug（唯一标识） */
  slug: string;
  /** 技能名称 */
  name: string;
  /** 技能描述 */
  description: string;
  /** 技能分类 */
  category: string;
  /** 技能作者 */
  author: string;
  /** GitHub 源 URL */
  sourceUrl: string;
}

/**
 * SKILL.md 解析后的内容
 */
export interface SkillDefinition {
  /** 技能名称 */
  name: string;
  /** 版本号 */
  version: string;
  /** 描述 */
  description: string;
  /** 主页 URL */
  homepage?: string;
  /** 仓库 URL */
  repository?: string;
  /** 是否用户可调用 */
  userInvocable?: boolean;
  /** 标签列表 */
  tags?: string[];
  /** 元数据 */
  metadata?: Record<string, unknown>;
  /** 完整的 Markdown 内容 */
  content: string;
  /** 原始 YAML frontmatter */
  frontmatter: Record<string, unknown>;
  /** GitHub 源 URL */
  sourceUrl: string;
}

/**
 * 同步结果
 */
export interface SyncResult {
  /** 总技能数 */
  total: number;
  /** 新增数量 */
  added: number;
  /** 更新数量 */
  updated: number;
  /** 跳过数量 */
  skipped: number;
  /** 错误数量 */
  errors: number;
  /** 同步时间 */
  syncedAt: Date;
}

/**
 * 分类映射（将 README 中的分类名转换为 slug）
 */
const CATEGORY_MAP: Record<string, string> = {
  'Coding Agents & IDEs': 'coding-agents',
  'Git & GitHub': 'git-github',
  Moltbook: 'moltbook',
  'Web & Frontend Development': 'web-frontend',
  'DevOps & Cloud': 'devops-cloud',
  'Browser & Automation': 'browser-automation',
  'Image & Video Generation': 'image-video-gen',
  'Apple Apps & Services': 'apple-apps',
  'Search & Research': 'search-research',
  'Clawdbot Tools': 'clawdbot-tools',
  'CLI Utilities': 'cli-utilities',
  'Marketing & Sales': 'marketing-sales',
  'Productivity & Tasks': 'productivity-tasks',
  'AI & LLMs': 'ai-llms',
  'Data & Analytics': 'data-analytics',
  Finance: 'finance',
  'Media & Streaming': 'media-streaming',
  'Notes & PKM': 'notes-pkm',
  'iOS & macOS Development': 'ios-macos-dev',
  Transportation: 'transportation',
  'Personal Development': 'personal-dev',
  'Health & Fitness': 'health-fitness',
  Communication: 'communication',
  'Speech & Transcription': 'speech-transcription',
  'Smart Home & IoT': 'smart-home-iot',
  'Shopping & E-commerce': 'shopping-ecommerce',
  'Calendar & Scheduling': 'calendar-scheduling',
  'PDF & Documents': 'pdf-documents',
  'Self-Hosted & Automation': 'self-hosted',
  'Security & Passwords': 'security-passwords',
  Gaming: 'gaming',
  'Agent-to-Agent Protocols': 'agent-protocols',
};

/**
 * 分类中文名称映射
 */
const CATEGORY_ZH_MAP: Record<string, string> = {
  'coding-agents': '编程代理与IDE',
  'git-github': 'Git与GitHub',
  moltbook: 'Moltbook',
  'web-frontend': 'Web与前端开发',
  'devops-cloud': 'DevOps与云服务',
  'browser-automation': '浏览器与自动化',
  'image-video-gen': '图像与视频生成',
  'apple-apps': 'Apple应用与服务',
  'search-research': '搜索与研究',
  'clawdbot-tools': 'Clawdbot工具',
  'cli-utilities': '命令行工具',
  'marketing-sales': '营销与销售',
  'productivity-tasks': '生产力与任务',
  'ai-llms': 'AI与大语言模型',
  'data-analytics': '数据与分析',
  finance: '金融',
  'media-streaming': '媒体与流媒体',
  'notes-pkm': '笔记与知识管理',
  'ios-macos-dev': 'iOS与macOS开发',
  transportation: '交通出行',
  'personal-dev': '个人发展',
  'health-fitness': '健康与健身',
  communication: '通讯',
  'speech-transcription': '语音与转录',
  'smart-home-iot': '智能家居与物联网',
  'shopping-ecommerce': '购物与电商',
  'calendar-scheduling': '日历与日程',
  'pdf-documents': 'PDF与文档',
  'self-hosted': '自托管与自动化',
  'security-passwords': '安全与密码',
  gaming: '游戏',
  'agent-protocols': '代理间协议',
};

/**
 * 分类图标映射
 */
const CATEGORY_ICON_MAP: Record<string, string> = {
  'coding-agents': '💻',
  'git-github': '🔀',
  moltbook: '📓',
  'web-frontend': '🌐',
  'devops-cloud': '☁️',
  'browser-automation': '🤖',
  'image-video-gen': '🎨',
  'apple-apps': '🍎',
  'search-research': '🔍',
  'clawdbot-tools': '🔧',
  'cli-utilities': '⌨️',
  'marketing-sales': '📈',
  'productivity-tasks': '✅',
  'ai-llms': '🧠',
  'data-analytics': '📊',
  finance: '💰',
  'media-streaming': '🎬',
  'notes-pkm': '📝',
  'ios-macos-dev': '📱',
  transportation: '🚗',
  'personal-dev': '🌱',
  'health-fitness': '💪',
  communication: '💬',
  'speech-transcription': '🎤',
  'smart-home-iot': '🏠',
  'shopping-ecommerce': '🛒',
  'calendar-scheduling': '📅',
  'pdf-documents': '📄',
  'self-hosted': '🖥️',
  'security-passwords': '🔐',
  gaming: '🎮',
  'agent-protocols': '🔗',
};

@Injectable()
export class OpenClawSkillSyncClient {
  private readonly repoUrl =
    'https://raw.githubusercontent.com/VoltAgent/awesome-openclaw-skills/main/README.md';
  private readonly requestTimeout = 60000; // 60 秒超时
  private readonly localCachePath: string;
  private readonly githubToken?: string;
  private readonly githubProxyUrl?: string;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    // 本地缓存文件路径：apps/api/openclaw-skills/README.md
    this.localCachePath = path.resolve(
      __dirname,
      '../../../../../openclaw-skills/README.md',
    );
    // GitHub Token 和代理 URL（可选）
    this.githubToken = this.configService.get<string>('GITHUB_TOKEN');
    this.githubProxyUrl = this.configService.get<string>('GITHUB_PROXY_URL');
  }

  /**
   * 从 GitHub 获取 README 内容，失败时从本地缓存读取
   */
  async fetchReadme(): Promise<string> {
    this.logger.info('OpenClawSkillSyncClient: 开始获取 README');

    try {
      // 尝试从 GitHub 获取
      const content = await this.fetchFromGitHub();

      // 成功获取后，保存到本地缓存
      await this.saveToLocalCache(content);

      return content;
    } catch (error) {
      this.logger.warn(
        'OpenClawSkillSyncClient: GitHub 获取失败，尝试从本地缓存读取',
        {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      );

      // 从本地缓存读取
      return this.readFromLocalCache();
    }
  }

  /**
   * 构建 GitHub 请求的 headers 和 URL
   */
  private getGitHubRequestConfig(url: string): {
    url: string;
    headers: Record<string, string>;
  } {
    const headers: Record<string, string> = {};
    if (this.githubToken) {
      headers['Authorization'] = `token ${this.githubToken}`;
    }
    // 如果配置了代理 URL，替换 GitHub 域名
    let finalUrl = url;
    if (this.githubProxyUrl) {
      finalUrl = url.replace(
        'https://raw.githubusercontent.com',
        this.githubProxyUrl,
      );
    }
    return { url: finalUrl, headers };
  }

  /**
   * 从 GitHub 获取 README 内容
   */
  private async fetchFromGitHub(): Promise<string> {
    const { url, headers } = this.getGitHubRequestConfig(this.repoUrl);
    const response = await firstValueFrom(
      this.httpService.get<string>(url, { headers }).pipe(
        timeout(this.requestTimeout),
        catchError((error) => {
          this.logger.error('OpenClawSkillSyncClient: GitHub 请求失败', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          throw error;
        }),
      ),
    );

    this.logger.info('OpenClawSkillSyncClient: GitHub README 获取成功', {
      contentLength: response.data.length,
    });

    return response.data;
  }

  /**
   * 保存内容到本地缓存
   */
  private async saveToLocalCache(content: string): Promise<void> {
    try {
      // 确保目录存在
      const dir = path.dirname(this.localCachePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.localCachePath, content, 'utf-8');
      this.logger.info('OpenClawSkillSyncClient: 已保存到本地缓存', {
        path: this.localCachePath,
      });
    } catch (error) {
      this.logger.warn('OpenClawSkillSyncClient: 保存本地缓存失败', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // 保存失败不影响主流程
    }
  }

  /**
   * 从本地缓存读取 README 内容
   */
  private readFromLocalCache(): string {
    if (!fs.existsSync(this.localCachePath)) {
      this.logger.error('OpenClawSkillSyncClient: 本地缓存文件不存在', {
        path: this.localCachePath,
      });
      throw new Error(`本地缓存文件不存在: ${this.localCachePath}`);
    }

    const content = fs.readFileSync(this.localCachePath, 'utf-8');
    this.logger.info('OpenClawSkillSyncClient: 从本地缓存读取成功', {
      path: this.localCachePath,
      contentLength: content.length,
    });

    return content;
  }

  /**
   * 解析 README 内容，提取技能信息
   * 只处理 URL 以 SKILL.md 结尾的技能
   * 自动去重：相同 slug 只保留第一个
   */
  parseReadme(content: string): ParsedSkill[] {
    const skillsMap = new Map<string, ParsedSkill>();
    let currentCategory = '';
    let skippedCount = 0;
    let duplicateCount = 0;

    // 按行解析
    const lines = content.split('\n');

    for (const line of lines) {
      // 检测分类标题（<summary><h3>...）
      const categoryMatch = line.match(
        /<summary><h3[^>]*>([^<]+)<\/h3><\/summary>/,
      );
      if (categoryMatch) {
        currentCategory = categoryMatch[1].trim();
        continue;
      }

      // 检测技能条目（- [slug](url) - description）
      const skillMatch = line.match(/^- \[([^\]]+)\]\(([^)]+)\)\s*-\s*(.+)$/);
      if (skillMatch && currentCategory) {
        const [, slug, sourceUrl, description] = skillMatch;

        // 只处理以 SKILL.md 结尾的 URL
        if (!sourceUrl.trim().endsWith('SKILL.md')) {
          skippedCount++;
          continue;
        }

        const trimmedSlug = slug.trim();

        // 检查是否已存在相同 slug（去重）
        if (skillsMap.has(trimmedSlug)) {
          duplicateCount++;
          this.logger.debug('OpenClawSkillSyncClient: 跳过重复 slug', {
            slug: trimmedSlug,
            sourceUrl: sourceUrl.trim(),
          });
          continue;
        }

        // 从 URL 提取作者
        // URL 格式: https://github.com/openclaw/skills/tree/main/skills/{author}/{slug}/SKILL.md
        const authorMatch = sourceUrl.match(
          /\/skills\/([^/]+)\/[^/]+\/SKILL\.md/,
        );
        const author = authorMatch ? authorMatch[1] : 'unknown';

        skillsMap.set(trimmedSlug, {
          slug: trimmedSlug,
          name: this.slugToName(trimmedSlug),
          description: description.trim(),
          category:
            CATEGORY_MAP[currentCategory] || this.slugify(currentCategory),
          author,
          sourceUrl: sourceUrl.trim(),
        });
      }
    }

    const skills = Array.from(skillsMap.values());

    this.logger.info('OpenClawSkillSyncClient: README 解析完成', {
      totalSkills: skills.length,
      skippedSkills: skippedCount,
      duplicateSkills: duplicateCount,
      categories: [...new Set(skills.map((s) => s.category))].length,
    });

    return skills;
  }

  /**
   * 将 slug 转换为可读名称
   */
  private slugToName(slug: string): string {
    return slug
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * 将字符串转换为 slug
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * 获取所有分类（包含中英文名称和图标）
   */
  getCategories(): Array<{
    slug: string;
    name: string;
    nameZh: string;
    icon: string;
  }> {
    return Object.entries(CATEGORY_MAP).map(([name, slug], index) => ({
      slug,
      name,
      nameZh: CATEGORY_ZH_MAP[slug] || name,
      icon: CATEGORY_ICON_MAP[slug] || '📦',
      sortOrder: index + 1,
    }));
  }

  /**
   * 获取单个技能的 SKILL.md 内容
   * 将 GitHub tree URL 转换为 raw URL 并获取内容
   * @param sourceUrl GitHub tree URL (如 https://github.com/openclaw/skills/tree/main/skills/author/slug/SKILL.md)
   */
  async fetchSkillDefinition(sourceUrl: string): Promise<SkillDefinition> {
    this.logger.info('OpenClawSkillSyncClient: 获取 SKILL.md 内容', {
      sourceUrl,
    });

    // 将 tree URL 转换为 raw URL，并应用代理配置
    const rawUrl = this.convertToRawUrl(sourceUrl);
    const { url, headers } = this.getGitHubRequestConfig(rawUrl);

    try {
      const response = await firstValueFrom(
        this.httpService.get<string>(url, { headers }).pipe(
          timeout(this.requestTimeout),
          catchError((error) => {
            this.logger.error('OpenClawSkillSyncClient: 获取 SKILL.md 失败', {
              rawUrl,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
          }),
        ),
      );

      const content = response.data;
      this.logger.info('OpenClawSkillSyncClient: SKILL.md 获取成功', {
        contentLength: content.length,
      });

      // 解析 YAML frontmatter 和 Markdown 内容
      return this.parseSkillMd(content, sourceUrl);
    } catch (error) {
      this.logger.error('OpenClawSkillSyncClient: 获取 SKILL.md 失败', {
        sourceUrl,
        rawUrl,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * 将 GitHub tree URL 转换为 raw URL
   */
  private convertToRawUrl(treeUrl: string): string {
    // https://github.com/openclaw/skills/tree/main/skills/author/slug/SKILL.md
    // -> https://raw.githubusercontent.com/openclaw/skills/main/skills/author/slug/SKILL.md
    return treeUrl
      .replace('github.com', 'raw.githubusercontent.com')
      .replace('/tree/', '/');
  }

  /**
   * 解析 SKILL.md 内容
   * 提取 YAML frontmatter 和 Markdown 内容
   */
  private parseSkillMd(content: string, sourceUrl: string): SkillDefinition {
    // 匹配 YAML frontmatter (--- ... ---)
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

    if (!frontmatterMatch) {
      // 没有 frontmatter，整个内容作为 Markdown
      return {
        name: '',
        version: '1.0.0',
        description: '',
        content: content,
        frontmatter: {},
        sourceUrl,
      };
    }

    const [, yamlContent, markdownContent] = frontmatterMatch;

    // 使用 js-yaml 解析 YAML frontmatter
    let frontmatter: Record<string, unknown> = {};
    try {
      const parsed = yaml.load(yamlContent);
      frontmatter =
        parsed && typeof parsed === 'object'
          ? (parsed as Record<string, unknown>)
          : {};
    } catch (error) {
      this.logger.warn('OpenClawSkillSyncClient: YAML 解析失败，使用空对象', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    return {
      name: (frontmatter.name as string) || '',
      version: String(frontmatter.version || '1.0.0'),
      description: (frontmatter.description as string) || '',
      homepage: frontmatter.homepage as string | undefined,
      repository: frontmatter.repository as string | undefined,
      userInvocable: frontmatter['user-invocable'] as boolean | undefined,
      tags: frontmatter.tags as string[] | undefined,
      metadata: frontmatter.metadata as Record<string, unknown> | undefined,
      content: markdownContent.trim(),
      frontmatter,
      sourceUrl,
    };
  }
}
