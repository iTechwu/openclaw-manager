import type { ChannelDefinition } from './types';

// Popular channels
export const feishu: ChannelDefinition = {
  id: 'feishu',
  label: '飞书/Lark',
  icon: '🪶',
  popular: true,
  tokenHint: '从飞书开放平台获取 Bot App ID 和 App Secret',
  tokenPlaceholder: 'cli_xxx...',
  credentials: [
    {
      key: 'appId',
      label: 'App ID',
      placeholder: 'cli_xxx...',
      type: 'text',
      required: true,
    },
    {
      key: 'appSecret',
      label: 'App Secret',
      placeholder: 'xxx...',
      type: 'password',
      required: true,
    },
  ],
  helpUrl:
    'https://open.feishu.cn/document/home/develop-a-bot-in-5-minutes/create-an-app',
  helpText: '飞书开放平台 - 创建应用',
};

export const telegram: ChannelDefinition = {
  id: 'telegram',
  label: 'Telegram',
  icon: 'TG',
  popular: true,
  tokenHint: 'Get this from @BotFather on Telegram',
  tokenPlaceholder: '123456:ABC-DEF...',
  credentials: [
    {
      key: 'botToken',
      label: 'Bot Token',
      placeholder: '123456:ABC-DEF...',
      type: 'password',
      required: true,
    },
  ],
  helpUrl: 'https://core.telegram.org/bots/tutorial#obtain-your-bot-token',
  helpText: 'Telegram Bot API - 获取 Bot Token',
};

export const discord: ChannelDefinition = {
  id: 'discord',
  label: 'Discord',
  icon: 'DC',
  popular: true,
  tokenHint: 'Get this from Discord Developer Portal',
  tokenPlaceholder: 'MTA2...',
  credentials: [
    {
      key: 'botToken',
      label: 'Bot Token',
      placeholder: 'MTA2...',
      type: 'password',
      required: true,
    },
    {
      key: 'applicationId',
      label: 'Application ID',
      placeholder: '123456789...',
      type: 'text',
      required: true,
    },
  ],
  helpUrl: 'https://discord.com/developers/docs/getting-started',
  helpText: 'Discord Developer Portal - 创建 Bot',
};

export const slack: ChannelDefinition = {
  id: 'slack',
  label: 'Slack',
  icon: 'SL',
  popular: true,
  tokenHint: 'Bot User OAuth Token from Slack App settings',
  tokenPlaceholder: 'xoxb-...',
  credentials: [
    {
      key: 'botToken',
      label: 'Bot Token',
      placeholder: 'xoxb-...',
      type: 'password',
      required: true,
    },
    {
      key: 'appToken',
      label: 'App Token',
      placeholder: 'xapp-...',
      type: 'password',
      required: false,
    },
    {
      key: 'signingSecret',
      label: 'Signing Secret',
      placeholder: 'xxx...',
      type: 'password',
      required: true,
    },
  ],
  helpUrl: 'https://api.slack.com/start/quickstart',
  helpText: 'Slack API - 创建 App',
};

export const signal: ChannelDefinition = {
  id: 'signal',
  label: 'Signal',
  icon: 'SG',
  popular: false,
  tokenHint: 'Signal API credentials',
  tokenPlaceholder: 'signal-...',
  credentials: [
    {
      key: 'phoneNumber',
      label: 'Phone Number',
      placeholder: '+1234567890',
      type: 'text',
      required: true,
    },
    {
      key: 'apiKey',
      label: 'API Key',
      placeholder: 'xxx...',
      type: 'password',
      required: true,
    },
  ],
  helpUrl: 'https://signal.org/docs/',
  helpText: 'Signal - API 文档',
};

export const whatsapp: ChannelDefinition = {
  id: 'whatsapp',
  label: 'WhatsApp',
  icon: 'WA',
  popular: true,
  tokenHint: 'WhatsApp Business API access token',
  tokenPlaceholder: 'EAAx...',
  credentials: [
    {
      key: 'accessToken',
      label: 'Access Token',
      placeholder: 'EAAx...',
      type: 'password',
      required: true,
    },
    {
      key: 'phoneNumberId',
      label: 'Phone Number ID',
      placeholder: '123456789...',
      type: 'text',
      required: true,
    },
    {
      key: 'businessAccountId',
      label: 'Business Account ID',
      placeholder: '123456789...',
      type: 'text',
      required: true,
    },
  ],
  helpUrl:
    'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',
  helpText: 'WhatsApp Cloud API - 快速入门',
};

export const matrix: ChannelDefinition = {
  id: 'matrix',
  label: 'Matrix',
  icon: 'MX',
  popular: false,
  tokenHint: 'Matrix access token for your bot user',
  tokenPlaceholder: 'syt_...',
  credentials: [
    {
      key: 'homeserverUrl',
      label: 'Homeserver URL',
      placeholder: 'https://matrix.org',
      type: 'text',
      required: true,
    },
    {
      key: 'accessToken',
      label: 'Access Token',
      placeholder: 'syt_...',
      type: 'password',
      required: true,
    },
    {
      key: 'userId',
      label: 'User ID',
      placeholder: '@bot:matrix.org',
      type: 'text',
      required: true,
    },
  ],
  helpUrl: 'https://matrix.org/docs/develop/',
  helpText: 'Matrix - 开发文档',
};

export const nostr: ChannelDefinition = {
  id: 'nostr',
  label: 'Nostr',
  icon: 'NS',
  popular: false,
  tokenHint: 'Nostr private key (nsec)',
  tokenPlaceholder: 'nsec1...',
  credentials: [
    {
      key: 'privateKey',
      label: 'Private Key (nsec)',
      placeholder: 'nsec1...',
      type: 'password',
      required: true,
    },
    {
      key: 'relays',
      label: 'Relay URLs',
      placeholder: 'wss://relay.damus.io',
      type: 'text',
      required: false,
    },
  ],
  helpUrl: 'https://nostr.com/',
  helpText: 'Nostr - 协议文档',
};

export const twitter: ChannelDefinition = {
  id: 'twitter',
  label: 'Twitter/X',
  icon: 'X',
  popular: false,
  tokenHint: 'Twitter API Bearer Token from Developer Portal',
  tokenPlaceholder: 'AAAAAAA...',
  credentials: [
    {
      key: 'apiKey',
      label: 'API Key',
      placeholder: 'xxx...',
      type: 'password',
      required: true,
    },
    {
      key: 'apiSecret',
      label: 'API Secret',
      placeholder: 'xxx...',
      type: 'password',
      required: true,
    },
    {
      key: 'accessToken',
      label: 'Access Token',
      placeholder: 'xxx...',
      type: 'password',
      required: true,
    },
    {
      key: 'accessTokenSecret',
      label: 'Access Token Secret',
      placeholder: 'xxx...',
      type: 'password',
      required: true,
    },
  ],
  helpUrl:
    'https://developer.twitter.com/en/docs/twitter-api/getting-started/getting-access-to-the-twitter-api',
  helpText: 'Twitter Developer - API 访问',
};

export const facebook: ChannelDefinition = {
  id: 'facebook',
  label: 'Facebook Messenger',
  icon: 'FB',
  popular: false,
  tokenHint: 'Facebook Page Access Token',
  tokenPlaceholder: 'EAAx...',
  credentials: [
    {
      key: 'pageAccessToken',
      label: 'Page Access Token',
      placeholder: 'EAAx...',
      type: 'password',
      required: true,
    },
    {
      key: 'appSecret',
      label: 'App Secret',
      placeholder: 'xxx...',
      type: 'password',
      required: true,
    },
    {
      key: 'verifyToken',
      label: 'Verify Token',
      placeholder: 'your_verify_token',
      type: 'text',
      required: true,
    },
  ],
  helpUrl:
    'https://developers.facebook.com/docs/messenger-platform/getting-started',
  helpText: 'Facebook Messenger - 快速入门',
};

export const instagram: ChannelDefinition = {
  id: 'instagram',
  label: 'Instagram',
  icon: 'IG',
  popular: false,
  tokenHint: 'Instagram API access token',
  tokenPlaceholder: 'IGQ...',
  credentials: [
    {
      key: 'accessToken',
      label: 'Access Token',
      placeholder: 'IGQ...',
      type: 'password',
      required: true,
    },
    {
      key: 'appSecret',
      label: 'App Secret',
      placeholder: 'xxx...',
      type: 'password',
      required: true,
    },
  ],
  helpUrl: 'https://developers.facebook.com/docs/instagram-api/getting-started',
  helpText: 'Instagram API - 快速入门',
};

export const teams: ChannelDefinition = {
  id: 'teams',
  label: 'Microsoft Teams',
  icon: 'MS',
  popular: false,
  tokenHint: 'Microsoft Bot Framework credentials',
  tokenPlaceholder: 'Bot Framework App ID...',
  credentials: [
    {
      key: 'appId',
      label: 'App ID',
      placeholder: 'xxx-xxx-xxx...',
      type: 'text',
      required: true,
    },
    {
      key: 'appPassword',
      label: 'App Password',
      placeholder: 'xxx...',
      type: 'password',
      required: true,
    },
    {
      key: 'tenantId',
      label: 'Tenant ID',
      placeholder: 'xxx-xxx-xxx...',
      type: 'text',
      required: false,
    },
  ],
  helpUrl:
    'https://learn.microsoft.com/en-us/microsoftteams/platform/bots/how-to/create-a-bot-for-teams',
  helpText: 'Microsoft Teams - 创建 Bot',
};

export const line: ChannelDefinition = {
  id: 'line',
  label: 'LINE',
  icon: 'LN',
  popular: false,
  tokenHint: 'LINE Channel Access Token',
  tokenPlaceholder: 'Bearer token...',
  credentials: [
    {
      key: 'channelAccessToken',
      label: 'Channel Access Token',
      placeholder: 'xxx...',
      type: 'password',
      required: true,
    },
    {
      key: 'channelSecret',
      label: 'Channel Secret',
      placeholder: 'xxx...',
      type: 'password',
      required: true,
    },
  ],
  helpUrl: 'https://developers.line.biz/en/docs/messaging-api/getting-started/',
  helpText: 'LINE Messaging API - 快速入门',
};

export const wechat: ChannelDefinition = {
  id: 'wechat',
  label: 'WeChat',
  icon: 'WC',
  popular: false,
  tokenHint: 'WeChat Official Account access token',
  tokenPlaceholder: 'Access token...',
  credentials: [
    {
      key: 'appId',
      label: 'App ID',
      placeholder: 'wx...',
      type: 'text',
      required: true,
    },
    {
      key: 'appSecret',
      label: 'App Secret',
      placeholder: 'xxx...',
      type: 'password',
      required: true,
    },
    {
      key: 'token',
      label: 'Token',
      placeholder: 'your_token',
      type: 'text',
      required: true,
    },
    {
      key: 'encodingAESKey',
      label: 'Encoding AES Key',
      placeholder: 'xxx...',
      type: 'password',
      required: false,
    },
  ],
  helpUrl:
    'https://developers.weixin.qq.com/doc/offiaccount/Getting_Started/Overview.html',
  helpText: '微信公众平台 - 开发文档',
};

export const viber: ChannelDefinition = {
  id: 'viber',
  label: 'Viber',
  icon: 'VB',
  popular: false,
  tokenHint: 'Viber Bot API authentication token',
  tokenPlaceholder: 'Auth token...',
  credentials: [
    {
      key: 'authToken',
      label: 'Auth Token',
      placeholder: 'xxx...',
      type: 'password',
      required: true,
    },
  ],
  helpUrl: 'https://developers.viber.com/docs/api/rest-bot-api/',
  helpText: 'Viber Bot API - 文档',
};

export const kik: ChannelDefinition = {
  id: 'kik',
  label: 'Kik',
  icon: 'KK',
  popular: false,
  tokenHint: 'Kik Bot API key',
  tokenPlaceholder: 'API key...',
  credentials: [
    {
      key: 'username',
      label: 'Bot Username',
      placeholder: 'your_bot',
      type: 'text',
      required: true,
    },
    {
      key: 'apiKey',
      label: 'API Key',
      placeholder: 'xxx...',
      type: 'password',
      required: true,
    },
  ],
  helpUrl: 'https://dev.kik.com/',
  helpText: 'Kik Developer - 文档',
};

export const twitch: ChannelDefinition = {
  id: 'twitch',
  label: 'Twitch',
  icon: 'TW',
  popular: false,
  tokenHint: 'Twitch OAuth token from Developer Console',
  tokenPlaceholder: 'oauth:...',
  credentials: [
    {
      key: 'clientId',
      label: 'Client ID',
      placeholder: 'xxx...',
      type: 'text',
      required: true,
    },
    {
      key: 'clientSecret',
      label: 'Client Secret',
      placeholder: 'xxx...',
      type: 'password',
      required: true,
    },
    {
      key: 'oauthToken',
      label: 'OAuth Token',
      placeholder: 'oauth:xxx...',
      type: 'password',
      required: true,
    },
  ],
  helpUrl: 'https://dev.twitch.tv/docs/irc/',
  helpText: 'Twitch IRC - 文档',
};

export const reddit: ChannelDefinition = {
  id: 'reddit',
  label: 'Reddit',
  icon: 'RD',
  popular: false,
  tokenHint: 'Reddit API credentials (client_id:secret)',
  tokenPlaceholder: 'client_id:client_secret',
  credentials: [
    {
      key: 'clientId',
      label: 'Client ID',
      placeholder: 'xxx...',
      type: 'text',
      required: true,
    },
    {
      key: 'clientSecret',
      label: 'Client Secret',
      placeholder: 'xxx...',
      type: 'password',
      required: true,
    },
    {
      key: 'username',
      label: 'Username',
      placeholder: 'your_bot',
      type: 'text',
      required: true,
    },
    {
      key: 'password',
      label: 'Password',
      placeholder: 'xxx...',
      type: 'password',
      required: true,
    },
  ],
  helpUrl: 'https://www.reddit.com/wiki/api/',
  helpText: 'Reddit API - 文档',
};

export const mastodon: ChannelDefinition = {
  id: 'mastodon',
  label: 'Mastodon',
  icon: 'MD',
  popular: false,
  tokenHint: 'Mastodon access token from your instance',
  tokenPlaceholder: 'Access token...',
  credentials: [
    {
      key: 'instanceUrl',
      label: 'Instance URL',
      placeholder: 'https://mastodon.social',
      type: 'text',
      required: true,
    },
    {
      key: 'accessToken',
      label: 'Access Token',
      placeholder: 'xxx...',
      type: 'password',
      required: true,
    },
  ],
  helpUrl: 'https://docs.joinmastodon.org/client/intro/',
  helpText: 'Mastodon API - 文档',
};

export const bluesky: ChannelDefinition = {
  id: 'bluesky',
  label: 'Bluesky',
  icon: 'BS',
  popular: false,
  tokenHint: 'Bluesky App Password',
  tokenPlaceholder: 'xxxx-xxxx-xxxx-xxxx',
  credentials: [
    {
      key: 'handle',
      label: 'Handle',
      placeholder: 'your.bsky.social',
      type: 'text',
      required: true,
    },
    {
      key: 'appPassword',
      label: 'App Password',
      placeholder: 'xxxx-xxxx-xxxx-xxxx',
      type: 'password',
      required: true,
    },
  ],
  helpUrl: 'https://atproto.com/guides/applications',
  helpText: 'AT Protocol - 应用开发',
};

export const rocketchat: ChannelDefinition = {
  id: 'rocketchat',
  label: 'Rocket.Chat',
  icon: 'RC',
  popular: false,
  tokenHint: 'Rocket.Chat Personal Access Token',
  tokenPlaceholder: 'Token...',
  credentials: [
    {
      key: 'serverUrl',
      label: 'Server URL',
      placeholder: 'https://your.rocket.chat',
      type: 'text',
      required: true,
    },
    {
      key: 'userId',
      label: 'User ID',
      placeholder: 'xxx...',
      type: 'text',
      required: true,
    },
    {
      key: 'authToken',
      label: 'Auth Token',
      placeholder: 'xxx...',
      type: 'password',
      required: true,
    },
  ],
  helpUrl: 'https://developer.rocket.chat/reference/api/rest-api',
  helpText: 'Rocket.Chat API - 文档',
};

export const mattermost: ChannelDefinition = {
  id: 'mattermost',
  label: 'Mattermost',
  icon: 'MM',
  popular: false,
  tokenHint: 'Mattermost Bot Access Token',
  tokenPlaceholder: 'Bot token...',
  credentials: [
    {
      key: 'serverUrl',
      label: 'Server URL',
      placeholder: 'https://your.mattermost.com',
      type: 'text',
      required: true,
    },
    {
      key: 'botToken',
      label: 'Bot Token',
      placeholder: 'xxx...',
      type: 'password',
      required: true,
    },
  ],
  helpUrl:
    'https://developers.mattermost.com/integrate/reference/bot-accounts/',
  helpText: 'Mattermost - Bot 账户',
};

export const zulip: ChannelDefinition = {
  id: 'zulip',
  label: 'Zulip',
  icon: 'ZU',
  popular: false,
  tokenHint: 'Zulip Bot API key',
  tokenPlaceholder: 'API key...',
  credentials: [
    {
      key: 'siteUrl',
      label: 'Site URL',
      placeholder: 'https://your.zulipchat.com',
      type: 'text',
      required: true,
    },
    {
      key: 'botEmail',
      label: 'Bot Email',
      placeholder: 'bot@your.zulipchat.com',
      type: 'text',
      required: true,
    },
    {
      key: 'apiKey',
      label: 'API Key',
      placeholder: 'xxx...',
      type: 'password',
      required: true,
    },
  ],
  helpUrl: 'https://zulip.com/api/running-bots',
  helpText: 'Zulip - Bot 开发',
};

export const irc: ChannelDefinition = {
  id: 'irc',
  label: 'IRC',
  icon: 'IR',
  popular: false,
  tokenHint: 'IRC server password (optional)',
  tokenPlaceholder: 'Password (optional)...',
  credentials: [
    {
      key: 'server',
      label: 'Server',
      placeholder: 'irc.libera.chat',
      type: 'text',
      required: true,
    },
    {
      key: 'port',
      label: 'Port',
      placeholder: '6697',
      type: 'text',
      required: true,
    },
    {
      key: 'nickname',
      label: 'Nickname',
      placeholder: 'your_bot',
      type: 'text',
      required: true,
    },
    {
      key: 'password',
      label: 'Password',
      placeholder: 'xxx...',
      type: 'password',
      required: false,
    },
  ],
  helpUrl: 'https://libera.chat/guides/connect',
  helpText: 'IRC - 连接指南',
};

export const xmpp: ChannelDefinition = {
  id: 'xmpp',
  label: 'XMPP/Jabber',
  icon: 'XM',
  popular: false,
  tokenHint: 'XMPP password for bot account',
  tokenPlaceholder: 'Password...',
  credentials: [
    {
      key: 'jid',
      label: 'JID',
      placeholder: 'bot@xmpp.org',
      type: 'text',
      required: true,
    },
    {
      key: 'password',
      label: 'Password',
      placeholder: 'xxx...',
      type: 'password',
      required: true,
    },
    {
      key: 'host',
      label: 'Host',
      placeholder: 'xmpp.org',
      type: 'text',
      required: false,
    },
  ],
  helpUrl: 'https://xmpp.org/getting-started/',
  helpText: 'XMPP - 入门指南',
};

export const sms: ChannelDefinition = {
  id: 'sms',
  label: 'SMS (Twilio)',
  icon: 'SM',
  popular: false,
  tokenHint: 'Twilio Auth Token',
  tokenPlaceholder: 'Auth token...',
  credentials: [
    {
      key: 'accountSid',
      label: 'Account SID',
      placeholder: 'ACxxx...',
      type: 'text',
      required: true,
    },
    {
      key: 'authToken',
      label: 'Auth Token',
      placeholder: 'xxx...',
      type: 'password',
      required: true,
    },
    {
      key: 'phoneNumber',
      label: 'Phone Number',
      placeholder: '+1234567890',
      type: 'text',
      required: true,
    },
  ],
  helpUrl: 'https://www.twilio.com/docs/sms/quickstart',
  helpText: 'Twilio SMS - 快速入门',
};

export const email: ChannelDefinition = {
  id: 'email',
  label: 'Email',
  icon: 'EM',
  popular: false,
  tokenHint: 'SMTP/IMAP credentials',
  tokenPlaceholder: 'Password...',
  credentials: [
    {
      key: 'smtpHost',
      label: 'SMTP Host',
      placeholder: 'smtp.gmail.com',
      type: 'text',
      required: true,
    },
    {
      key: 'smtpPort',
      label: 'SMTP Port',
      placeholder: '587',
      type: 'text',
      required: true,
    },
    {
      key: 'imapHost',
      label: 'IMAP Host',
      placeholder: 'imap.gmail.com',
      type: 'text',
      required: true,
    },
    {
      key: 'imapPort',
      label: 'IMAP Port',
      placeholder: '993',
      type: 'text',
      required: true,
    },
    {
      key: 'email',
      label: 'Email',
      placeholder: 'bot@example.com',
      type: 'text',
      required: true,
    },
    {
      key: 'password',
      label: 'Password',
      placeholder: 'xxx...',
      type: 'password',
      required: true,
    },
  ],
  helpUrl: 'https://support.google.com/mail/answer/7126229',
  helpText: 'Gmail IMAP/SMTP - 设置',
};

export const googlechat: ChannelDefinition = {
  id: 'googlechat',
  label: 'Google Chat',
  icon: 'GC',
  popular: false,
  tokenHint: 'Google Cloud service account JSON key',
  tokenPlaceholder: 'Service account key...',
  credentials: [
    {
      key: 'serviceAccountKey',
      label: 'Service Account Key (JSON)',
      placeholder: '{"type": "service_account"...}',
      type: 'password',
      required: true,
    },
    {
      key: 'projectId',
      label: 'Project ID',
      placeholder: 'your-project-id',
      type: 'text',
      required: true,
    },
  ],
  helpUrl: 'https://developers.google.com/chat/quickstart/gcf-app',
  helpText: 'Google Chat API - 快速入门',
};

export const webex: ChannelDefinition = {
  id: 'webex',
  label: 'Webex',
  icon: 'WX',
  popular: false,
  tokenHint: 'Webex Bot Access Token',
  tokenPlaceholder: 'Access token...',
  credentials: [
    {
      key: 'accessToken',
      label: 'Access Token',
      placeholder: 'xxx...',
      type: 'password',
      required: true,
    },
  ],
  helpUrl: 'https://developer.webex.com/docs/bots',
  helpText: 'Webex - Bot 开发',
};

export const web: ChannelDefinition = {
  id: 'web',
  label: 'Web Chat',
  icon: 'WB',
  popular: false,
  tokenHint: 'API key for web widget authentication',
  tokenPlaceholder: 'API key...',
  credentials: [
    {
      key: 'apiKey',
      label: 'API Key',
      placeholder: 'xxx...',
      type: 'password',
      required: true,
    },
    {
      key: 'allowedOrigins',
      label: 'Allowed Origins',
      placeholder: 'https://example.com',
      type: 'text',
      required: false,
    },
  ],
  helpText: 'Web Chat - 配置',
};

export const webhook: ChannelDefinition = {
  id: 'webhook',
  label: 'Webhook',
  icon: 'WH',
  popular: false,
  tokenHint: 'Webhook secret for request validation',
  tokenPlaceholder: 'Secret...',
  credentials: [
    {
      key: 'webhookUrl',
      label: 'Webhook URL',
      placeholder: 'https://your-server.com/webhook',
      type: 'text',
      required: true,
    },
    {
      key: 'secret',
      label: 'Secret',
      placeholder: 'xxx...',
      type: 'password',
      required: false,
    },
  ],
  helpText: 'Webhook - 配置',
};
