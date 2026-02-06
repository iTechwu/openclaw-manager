/**
 * 飞书 API 类型定义
 */

// 飞书凭证配置
export interface FeishuCredentials {
  appId: string;
  appSecret: string;
}

// 飞书渠道配置
export interface FeishuChannelConfig {
  requireMention?: boolean; // 群聊是否需要 @机器人
  replyInThread?: boolean; // 是否在话题中回复
  showTyping?: boolean; // 是否显示"正在输入"
  domain?: 'feishu' | 'lark'; // 飞书或 Lark 国际版
}

// 飞书 Tenant Access Token 响应
export interface TenantAccessTokenResponse {
  code: number;
  msg: string;
  tenant_access_token?: string;
  expire?: number;
}

// 飞书消息事件
export interface FeishuMessageEvent {
  schema: string;
  header: {
    event_id: string;
    event_type: string;
    create_time: string;
    token: string;
    app_id: string;
    tenant_key: string;
  };
  event: {
    sender: {
      sender_id: {
        union_id: string;
        user_id: string;
        open_id: string;
      };
      sender_type: string;
      tenant_key: string;
    };
    message: {
      message_id: string;
      root_id?: string;
      parent_id?: string;
      create_time: string;
      update_time?: string;
      chat_id: string;
      chat_type: 'p2p' | 'group';
      message_type: string;
      content: string;
      mentions?: Array<{
        key: string;
        id: {
          union_id: string;
          user_id: string;
          open_id: string;
        };
        name: string;
        tenant_key: string;
      }>;
    };
  };
}

// 飞书发送消息请求
export interface FeishuSendMessageRequest {
  receive_id: string;
  msg_type:
    | 'text'
    | 'post'
    | 'image'
    | 'interactive'
    | 'share_chat'
    | 'share_user'
    | 'audio'
    | 'media'
    | 'file'
    | 'sticker';
  content: string;
  uuid?: string;
}

// 飞书发送消息响应
export interface FeishuSendMessageResponse {
  code: number;
  msg: string;
  data?: {
    message_id: string;
    root_id?: string;
    parent_id?: string;
    msg_type: string;
    create_time: string;
    update_time?: string;
    deleted: boolean;
    updated: boolean;
    chat_id: string;
    sender: {
      id: string;
      id_type: string;
      sender_type: string;
      tenant_key: string;
    };
    body: {
      content: string;
    };
  };
}

// WebSocket 长连接消息
export interface FeishuWsMessage {
  type: 'event' | 'card' | 'pong';
  data?: FeishuMessageEvent;
}

// 消息处理回调
export type FeishuMessageHandler = (event: FeishuMessageEvent) => Promise<void>;

// 卡片交互事件处理回调
export type FeishuCardActionHandler = (
  event: FeishuCardActionEvent,
) => Promise<FeishuCardActionResponse | void>;

// 连接状态回调
export interface FeishuConnectionCallbacks {
  onConnect?: () => void;
  onDisconnect?: (reason?: string) => void;
  onReconnect?: (attempt: number) => void;
  onError?: (error: Error) => void;
}

// 卡片消息内容
export interface FeishuCardContent {
  config?: {
    wide_screen_mode?: boolean;
    enable_forward?: boolean;
  };
  header?: {
    title: {
      tag: 'plain_text' | 'lark_md';
      content: string;
    };
    template?:
      | 'blue'
      | 'wathet'
      | 'turquoise'
      | 'green'
      | 'yellow'
      | 'orange'
      | 'red'
      | 'carmine'
      | 'violet'
      | 'purple'
      | 'indigo'
      | 'grey';
  };
  elements: FeishuCardElement[];
}

// 卡片元素类型
export type FeishuCardElement =
  | FeishuCardDivElement
  | FeishuCardMarkdownElement
  | FeishuCardActionElement
  | FeishuCardNoteElement
  | FeishuCardHrElement;

export interface FeishuCardDivElement {
  tag: 'div';
  text?: {
    tag: 'plain_text' | 'lark_md';
    content: string;
  };
  fields?: Array<{
    is_short: boolean;
    text: {
      tag: 'plain_text' | 'lark_md';
      content: string;
    };
  }>;
}

export interface FeishuCardMarkdownElement {
  tag: 'markdown';
  content: string;
}

export interface FeishuCardActionElement {
  tag: 'action';
  actions: Array<{
    tag: 'button';
    text: {
      tag: 'plain_text' | 'lark_md';
      content: string;
    };
    type?: 'default' | 'primary' | 'danger';
    value?: Record<string, unknown>;
  }>;
}

export interface FeishuCardNoteElement {
  tag: 'note';
  elements: Array<{
    tag: 'plain_text' | 'lark_md';
    content: string;
  }>;
}

export interface FeishuCardHrElement {
  tag: 'hr';
}

// 卡片交互事件
export interface FeishuCardActionEvent {
  open_id: string;
  user_id?: string;
  open_message_id: string;
  open_chat_id: string;
  tenant_key: string;
  token: string;
  action: {
    value: Record<string, unknown>;
    tag: string;
    option?: string;
    timezone?: string;
  };
}

// 卡片交互响应
export interface FeishuCardActionResponse {
  toast?: {
    type: 'success' | 'info' | 'warning' | 'error';
    content: string;
  };
  card?: FeishuCardContent;
}

// 用户信息
export interface FeishuUserInfo {
  union_id?: string;
  user_id?: string;
  open_id?: string;
  name?: string;
  en_name?: string;
  nickname?: string;
  email?: string;
  mobile?: string;
  avatar?: {
    avatar_72?: string;
    avatar_240?: string;
    avatar_640?: string;
    avatar_origin?: string;
  };
  status?: {
    is_frozen?: boolean;
    is_resigned?: boolean;
    is_activated?: boolean;
  };
}

// 群信息
export interface FeishuChatInfo {
  chat_id: string;
  avatar?: string;
  name?: string;
  description?: string;
  owner_id?: string;
  owner_id_type?: string;
  chat_mode?: string;
  chat_type?: string;
  external?: boolean;
  tenant_key?: string;
}
