/**
 * Channel Definitions Data
 * 渠道定义数据 - 用于数据库 seed
 */

export interface ChannelCredentialFieldData {
  key: string;
  label: string;
  placeholder: string;
  fieldType: 'text' | 'password';
  required: boolean;
  sortOrder: number;
}

export interface ChannelDefinitionData {
  id: string;
  label: string;
  icon: string;
  popular: boolean;
  popularLocales: string[]; // Locales where this channel is popular
  tokenHint: string;
  tokenPlaceholder: string;
  helpUrl?: string;
  helpText?: string;
  sortOrder: number;
  credentials: ChannelCredentialFieldData[];
}

export const CHANNEL_DEFINITIONS: ChannelDefinitionData[] = [
  // 推荐渠道 (Popular channels)
  // - 中文环境推荐: 飞书、微信
  // - 英文环境推荐: 飞书、Telegram、Slack、微信
  {
    id: 'feishu',
    label: '飞书/Lark',
    icon: 'feishu',
    popular: true,
    popularLocales: ['zh-CN', 'zh', 'en'], // 中英文都推荐
    tokenHint: '从飞书开放平台获取 Bot App ID 和 App Secret',
    tokenPlaceholder: 'cli_xxx...',
    helpUrl: 'https://open.feishu.cn/document/home/develop-a-bot-in-5-minutes/create-an-app',
    helpText: '飞书开放平台 - 创建应用',
    sortOrder: 1,
    credentials: [
      { key: 'appId', label: 'App ID', placeholder: 'cli_xxx...', fieldType: 'text', required: true, sortOrder: 1 },
      { key: 'appSecret', label: 'App Secret', placeholder: 'xxx...', fieldType: 'password', required: true, sortOrder: 2 },
    ],
  },
  {
    id: 'telegram',
    label: 'Telegram',
    icon: 'telegram',
    popular: true,
    popularLocales: ['en'], // 仅英文环境推荐
    tokenHint: 'Get this from @BotFather on Telegram',
    tokenPlaceholder: '123456:ABC-DEF...',
    helpUrl: 'https://core.telegram.org/bots/tutorial#obtain-your-bot-token',
    helpText: 'Telegram Bot API - 获取 Bot Token',
    sortOrder: 2,
    credentials: [
      { key: 'botToken', label: 'Bot Token', placeholder: '123456:ABC-DEF...', fieldType: 'password', required: true, sortOrder: 1 },
    ],
  },
  {
    id: 'slack',
    label: 'Slack',
    icon: 'slack',
    popular: true,
    popularLocales: ['en'], // 仅英文环境推荐
    tokenHint: 'Bot User OAuth Token from Slack App settings',
    tokenPlaceholder: 'xoxb-...',
    helpUrl: 'https://api.slack.com/start/quickstart',
    helpText: 'Slack API - 创建 App',
    sortOrder: 3,
    credentials: [
      { key: 'botToken', label: 'Bot Token', placeholder: 'xoxb-...', fieldType: 'password', required: true, sortOrder: 1 },
      { key: 'appToken', label: 'App Token', placeholder: 'xapp-...', fieldType: 'password', required: false, sortOrder: 2 },
      { key: 'signingSecret', label: 'Signing Secret', placeholder: 'xxx...', fieldType: 'password', required: true, sortOrder: 3 },
    ],
  },
  {
    id: 'wechat',
    label: '微信',
    icon: 'wechat',
    popular: true,
    popularLocales: ['zh-CN', 'zh', 'en'], // 中英文都推荐
    tokenHint: '微信公众平台 access token',
    tokenPlaceholder: 'Access token...',
    helpUrl: 'https://developers.weixin.qq.com/doc/offiaccount/Getting_Started/Overview.html',
    helpText: '微信公众平台 - 开发文档',
    sortOrder: 4,
    credentials: [
      { key: 'appId', label: 'App ID', placeholder: 'wx...', fieldType: 'text', required: true, sortOrder: 1 },
      { key: 'appSecret', label: 'App Secret', placeholder: 'xxx...', fieldType: 'password', required: true, sortOrder: 2 },
      { key: 'token', label: 'Token', placeholder: 'your_token', fieldType: 'text', required: true, sortOrder: 3 },
      { key: 'encodingAESKey', label: 'Encoding AES Key', placeholder: 'xxx...', fieldType: 'password', required: false, sortOrder: 4 },
    ],
  },
  // 更多渠道 (Other channels - collapsed by default)
  {
    id: 'discord',
    label: 'Discord',
    icon: 'discord',
    popular: false,
    popularLocales: [], // 不在任何语言环境推荐
    tokenHint: 'Get this from Discord Developer Portal',
    tokenPlaceholder: 'MTA2...',
    helpUrl: 'https://discord.com/developers/docs/getting-started',
    helpText: 'Discord Developer Portal - 创建 Bot',
    sortOrder: 5,
    credentials: [
      { key: 'botToken', label: 'Bot Token', placeholder: 'MTA2...', fieldType: 'password', required: true, sortOrder: 1 },
      { key: 'applicationId', label: 'Application ID', placeholder: '123456789...', fieldType: 'text', required: true, sortOrder: 2 },
    ],
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    icon: 'whatsapp',
    popular: false,
    popularLocales: [],
    tokenHint: 'WhatsApp Business API access token',
    tokenPlaceholder: 'EAAx...',
    helpUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',
    helpText: 'WhatsApp Cloud API - 快速入门',
    sortOrder: 6,
    credentials: [
      { key: 'accessToken', label: 'Access Token', placeholder: 'EAAx...', fieldType: 'password', required: true, sortOrder: 1 },
      { key: 'phoneNumberId', label: 'Phone Number ID', placeholder: '123456789...', fieldType: 'text', required: true, sortOrder: 2 },
      { key: 'businessAccountId', label: 'Business Account ID', placeholder: '123456789...', fieldType: 'text', required: true, sortOrder: 3 },
    ],
  },
  {
    id: 'twitter',
    label: 'Twitter/X',
    icon: 'twitter',
    popular: false,
    popularLocales: [],
    tokenHint: 'Twitter API Bearer Token from Developer Portal',
    tokenPlaceholder: 'AAAAAAA...',
    helpUrl: 'https://developer.twitter.com/en/docs/twitter-api/getting-started/getting-access-to-the-twitter-api',
    helpText: 'Twitter Developer - API 访问',
    sortOrder: 7,
    credentials: [
      { key: 'apiKey', label: 'API Key', placeholder: 'xxx...', fieldType: 'password', required: true, sortOrder: 1 },
      { key: 'apiSecret', label: 'API Secret', placeholder: 'xxx...', fieldType: 'password', required: true, sortOrder: 2 },
      { key: 'accessToken', label: 'Access Token', placeholder: 'xxx...', fieldType: 'password', required: true, sortOrder: 3 },
      { key: 'accessTokenSecret', label: 'Access Token Secret', placeholder: 'xxx...', fieldType: 'password', required: true, sortOrder: 4 },
    ],
  },
  {
    id: 'instagram',
    label: 'Instagram',
    icon: 'instagram',
    popular: false,
    popularLocales: [],
    tokenHint: 'Instagram API access token',
    tokenPlaceholder: 'IGQ...',
    helpUrl: 'https://developers.facebook.com/docs/instagram-api/getting-started',
    helpText: 'Instagram API - 快速入门',
    sortOrder: 8,
    credentials: [
      { key: 'accessToken', label: 'Access Token', placeholder: 'IGQ...', fieldType: 'password', required: true, sortOrder: 1 },
      { key: 'appSecret', label: 'App Secret', placeholder: 'xxx...', fieldType: 'password', required: true, sortOrder: 2 },
    ],
  },
  {
    id: 'teams',
    label: 'Microsoft Teams',
    icon: 'teams',
    popular: false,
    popularLocales: [],
    tokenHint: 'Microsoft Bot Framework credentials',
    tokenPlaceholder: 'Bot Framework App ID...',
    helpUrl: 'https://learn.microsoft.com/en-us/microsoftteams/platform/bots/how-to/create-a-bot-for-teams',
    helpText: 'Microsoft Teams - 创建 Bot',
    sortOrder: 9,
    credentials: [
      { key: 'appId', label: 'App ID', placeholder: 'xxx-xxx-xxx...', fieldType: 'text', required: true, sortOrder: 1 },
      { key: 'appPassword', label: 'App Password', placeholder: 'xxx...', fieldType: 'password', required: true, sortOrder: 2 },
      { key: 'tenantId', label: 'Tenant ID', placeholder: 'xxx-xxx-xxx...', fieldType: 'text', required: false, sortOrder: 3 },
    ],
  },
  {
    id: 'line',
    label: 'LINE',
    icon: 'line',
    popular: false,
    popularLocales: [],
    tokenHint: 'LINE Channel Access Token',
    tokenPlaceholder: 'Bearer token...',
    helpUrl: 'https://developers.line.biz/en/docs/messaging-api/getting-started/',
    helpText: 'LINE Messaging API - 快速入门',
    sortOrder: 10,
    credentials: [
      { key: 'channelAccessToken', label: 'Channel Access Token', placeholder: 'xxx...', fieldType: 'password', required: true, sortOrder: 1 },
      { key: 'channelSecret', label: 'Channel Secret', placeholder: 'xxx...', fieldType: 'password', required: true, sortOrder: 2 },
    ],
  },
  {
    id: 'webchat',
    label: 'Web Chat',
    icon: 'webchat',
    popular: true,
    popularLocales: ['zh-CN', 'zh', 'en'],
    tokenHint: 'Web Chat 嵌入式聊天组件配置',
    tokenPlaceholder: 'API key...',
    helpText: 'Web Chat - 嵌入式网页聊天组件',
    sortOrder: 11,
    credentials: [
      { key: 'apiKey', label: 'API Key', placeholder: 'xxx...', fieldType: 'password', required: false, sortOrder: 1 },
      { key: 'allowedOrigins', label: 'Allowed Origins', placeholder: 'https://example.com', fieldType: 'text', required: false, sortOrder: 2 },
    ],
  },
];
