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
