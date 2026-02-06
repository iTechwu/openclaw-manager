'use client';

import { useState, useMemo, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import {
  botChannelApi,
  channelApi,
  botChannelClient,
} from '@/lib/api/contracts/client';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Skeleton,
  Input,
  Label,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui';
import {
  Check,
  X,
  Loader2,
  ChevronRight,
  Eye,
  EyeOff,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import type { BotChannelItem, ChannelDefinition } from '@repo/contracts';
import {
  ChannelIcon,
  channelColors,
} from '@/lib/config/channels/channel-icons';
import { cn } from '@repo/ui/lib/utils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQueryOptions = any;

/**
 * 渠道列表项组件
 */
function ChannelListItem({
  channel,
  definition,
  isSelected,
  onClick,
}: {
  channel?: BotChannelItem;
  definition: ChannelDefinition;
  isSelected: boolean;
  onClick: () => void;
}) {
  const isConfigured = !!channel;
  const accentColor = channelColors[definition.id] || '#6B7280';

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left',
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-transparent hover:bg-muted/50',
      )}
    >
      <div
        className="size-10 rounded-lg flex items-center justify-center"
        style={{ backgroundColor: `${accentColor}20` }}
      >
        <ChannelIcon channelId={definition.id} size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{definition.label}</p>
        <div className="flex items-center gap-1 text-xs">
          {isConfigured ? (
            <>
              <Check className="size-3 text-green-500" />
              <span className="text-green-500">已配置</span>
            </>
          ) : (
            <>
              <X className="size-3 text-muted-foreground" />
              <span className="text-muted-foreground">未配置</span>
            </>
          )}
        </div>
      </div>
      <ChevronRight className="size-4 text-muted-foreground" />
    </button>
  );
}

/**
 * 飞书/Lark 渠道的 config 类型
 */
interface FeishuChannelConfig {
  domain: 'feishu' | 'lark';
  requireMention?: boolean;
  replyInThread?: boolean;
  showTyping?: boolean;
}

/**
 * 渠道配置表单组件
 */
function ChannelConfigForm({
  definition,
  channel,
  onSave,
  saving,
}: {
  definition: ChannelDefinition;
  channel?: BotChannelItem;
  onSave: (
    credentials: Record<string, string> | undefined,
    config?: Record<string, unknown>,
  ) => void;
  saving: boolean;
}) {
  const t = useTranslations('bots.detail.channels');
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>(
    {},
  );
  // 飞书/Lark 渠道的 config 状态
  const [feishuConfig, setFeishuConfig] = useState<FeishuChannelConfig>({
    domain: 'feishu',
    requireMention: true,
    replyInThread: false,
    showTyping: true,
  });
  const accentColor = channelColors[definition.id] || '#6B7280';

  // 判断是否是飞书渠道
  const isFeishuChannel = definition.id === 'feishu';

  // 当 channel 变化时，从已有配置初始化 config 状态
  useEffect(() => {
    if (channel?.config && isFeishuChannel) {
      const existingConfig = channel.config as Record<string, unknown>;
      setFeishuConfig({
        domain: (existingConfig.domain as 'feishu' | 'lark') || 'feishu',
        requireMention: (existingConfig.requireMention as boolean) ?? true,
        replyInThread: (existingConfig.replyInThread as boolean) ?? false,
        showTyping: (existingConfig.showTyping as boolean) ?? true,
      });
    }
  }, [channel, isFeishuChannel]);

  // 当切换渠道类型时，重置表单状态
  useEffect(() => {
    setCredentials({});
    setShowPasswords({});
    if (!isFeishuChannel) {
      setFeishuConfig({
        domain: 'feishu',
        requireMention: true,
        replyInThread: false,
        showTyping: true,
      });
    }
  }, [definition.id, isFeishuChannel]);

  const handleCredentialChange = (key: string, value: string) => {
    setCredentials((prev) => ({ ...prev, [key]: value }));
  };

  const togglePasswordVisibility = (key: string) => {
    setShowPasswords((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = () => {
    // 验证必填字段（如果已配置则不需要重新填写）
    const missingFields: string[] = [];
    const hasExistingCredentials = !!channel?.credentialsMasked;

    for (const field of definition.credentialFields || []) {
      // 如果是新建渠道，必填字段必须填写
      // 如果是更新渠道，只有当用户输入了部分凭证时才验证
      const hasAnyNewCredential = Object.values(credentials).some(
        (v) => v?.trim(),
      );
      if (
        field.required &&
        !credentials[field.key]?.trim() &&
        (!hasExistingCredentials || hasAnyNewCredential)
      ) {
        // 如果已有配置且用户没有输入任何新凭证，则跳过验证
        if (hasExistingCredentials && !hasAnyNewCredential) {
          continue;
        }
        missingFields.push(field.label);
      }
    }

    if (missingFields.length > 0) {
      toast.error(`请填写必填字段: ${missingFields.join(', ')}`);
      return;
    }

    // 根据渠道类型构建 config
    const config: Record<string, unknown> | undefined = isFeishuChannel
      ? { ...feishuConfig }
      : undefined;

    // 如果用户没有输入任何新凭证，则不传递 credentials（保持原有配置）
    const hasAnyNewCredential = Object.values(credentials).some(
      (v) => v?.trim(),
    );
    const credentialsToSave = hasAnyNewCredential ? credentials : undefined;

    onSave(credentialsToSave, config);
  };

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex items-center gap-3">
        <div
          className="size-12 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${accentColor}20` }}
        >
          <ChannelIcon channelId={definition.id} size={28} />
        </div>
        <div>
          <h3 className="text-lg font-semibold">配置 {definition.label}</h3>
          {definition.tokenHint && (
            <p className="text-sm text-muted-foreground">
              {definition.tokenHint}
            </p>
          )}
        </div>
      </div>

      {/* 飞书/Lark 域名选择 */}
      {isFeishuChannel && (
        <div className="space-y-2">
          <Label className="flex items-center gap-1">
            服务区域
            <span className="text-destructive">*</span>
            {channel?.config && (
              <Check className="size-3 text-green-500 ml-1" />
            )}
          </Label>
          <Select
            value={feishuConfig.domain}
            onValueChange={(value: 'feishu' | 'lark') =>
              setFeishuConfig((prev) => ({ ...prev, domain: value }))
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="选择服务区域" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="feishu">
                <div className="flex flex-col items-start">
                  <span>飞书 (中国大陆)</span>
                  <span className="text-xs text-muted-foreground">
                    open.feishu.cn
                  </span>
                </div>
              </SelectItem>
              <SelectItem value="lark">
                <div className="flex flex-col items-start">
                  <span>Lark (海外)</span>
                  <span className="text-xs text-muted-foreground">
                    open.larksuite.com
                  </span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            请根据您的飞书应用所在区域选择对应的服务
          </p>
        </div>
      )}

      {/* 凭证字段 */}
      <div className="space-y-4">
        {definition.credentialFields?.map((field) => {
          // 获取已保存的掩码值
          const maskedValue = channel?.credentialsMasked?.[field.key];
          // 判断是否已配置（有掩码值）
          const isConfigured = !!maskedValue;
          // 判断用户是否输入了新值
          const hasNewValue = !!credentials[field.key];

          return (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={field.key} className="flex items-center gap-1">
                {field.label}
                {field.required && !isConfigured && (
                  <span className="text-destructive">*</span>
                )}
                {(hasNewValue || isConfigured) && (
                  <Check className="size-3 text-green-500 ml-1" />
                )}
              </Label>

              <div className="relative">
                <Input
                  id={field.key}
                  type={
                    field.fieldType === 'password' && !showPasswords[field.key]
                      ? 'password'
                      : 'text'
                  }
                  placeholder={isConfigured ? `已配置: ${maskedValue}` : field.placeholder}
                  value={credentials[field.key] || ''}
                  onChange={(e) =>
                    handleCredentialChange(field.key, e.target.value)
                  }
                />
                {field.fieldType === 'password' && (
                  <button
                    type="button"
                    onClick={() => togglePasswordVisibility(field.key)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPasswords[field.key] ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                )}
              </div>

              {isConfigured && !hasNewValue && (
                <p className="text-xs text-muted-foreground">
                  留空则保持原有配置不变
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* 安全提示 */}
      <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3 text-sm">
        <div className="flex items-start gap-2">
          <ShieldCheck className="size-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
          <p className="text-green-700 dark:text-green-300">
            为保障您的隐私安全，所有敏感凭证数据均采用 AES-256 加密存储，且不会在页面上明文显示。
          </p>
        </div>
      </div>

      {/* 已保存配置提示 */}
      {channel && (
        <div className="rounded-lg bg-muted/50 p-3 text-sm">
          <p className="text-muted-foreground">
            ✓ 此渠道已配置。如需更新凭证，请重新填写上方字段。
            {isFeishuChannel && channel.config && (
              <span className="block mt-1">
                当前服务区域：
                <strong>
                  {(channel.config as Record<string, unknown>).domain === 'lark'
                    ? 'Lark (海外)'
                    : '飞书 (中国大陆)'}
                </strong>
              </span>
            )}
          </p>
        </div>
      )}

      {/* 帮助链接 */}
      {definition.helpUrl && (
        <p className="text-xs text-muted-foreground">
          💡 {definition.helpText || '查看帮助文档'}:{' '}
          <a
            href={definition.helpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            {definition.helpUrl}
          </a>
        </p>
      )}

      {/* 操作按钮 */}
      <div className="flex gap-3">
        <Button
          onClick={handleSubmit}
          disabled={saving}
          className="flex-1"
          style={{ backgroundColor: accentColor }}
        >
          {saving ? (
            <Loader2 className="size-4 mr-2 animate-spin" />
          ) : (
            <Save className="size-4 mr-2" />
          )}
          {t('saveConfig')}
        </Button>
      </div>
    </div>
  );
}

/**
 * Bot 渠道管理页面 - OpenClaw Manager 风格
 */
export default function BotChannelsPage() {
  const params = useParams<{ hostname: string }>();
  const hostname = params.hostname;
  const locale = useLocale();
  const t = useTranslations('bots.detail.channels');
  const queryClient = useQueryClient();

  const [selectedChannelType, setSelectedChannelType] = useState<string | null>(
    null,
  );
  const [saving, setSaving] = useState(false);

  // 获取渠道定义列表
  const { data: channelDefsResponse, isLoading: defsLoading } =
    channelApi.list.useQuery(
      ['channel-definitions', locale],
      { query: { locale } },
      { staleTime: 1000 * 60 * 10 } as AnyQueryOptions,
    );

  const channelDefinitions = useMemo(
    () => channelDefsResponse?.body?.data?.channels || [],
    [channelDefsResponse],
  );

  // 获取已配置的渠道列表
  const { data: channelsResponse, isLoading: channelsLoading } =
    botChannelApi.list.useQuery(
      ['bot-channels', hostname],
      { params: { hostname } },
      { enabled: !!hostname } as AnyQueryOptions,
    );

  const configuredChannels = useMemo(
    () => channelsResponse?.body?.data?.list || [],
    [channelsResponse],
  );

  // 获取选中的渠道定义和配置
  const selectedDefinition = useMemo(
    () => channelDefinitions.find((d) => d.id === selectedChannelType),
    [channelDefinitions, selectedChannelType],
  );

  const selectedChannel = useMemo(
    () => configuredChannels.find((c) => c.channelType === selectedChannelType),
    [configuredChannels, selectedChannelType],
  );

  // 自动选择第一个渠道
  useEffect(() => {
    if (channelDefinitions.length > 0 && !selectedChannelType) {
      setSelectedChannelType(channelDefinitions[0]?.id ?? null);
    }
  }, [channelDefinitions, selectedChannelType]);

  // 保存渠道配置
  const handleSaveConfig = async (
    credentials: Record<string, string> | undefined,
    config?: Record<string, unknown>,
  ) => {
    if (!selectedChannelType) return;

    // 检查是否有新凭证需要验证
    const hasNewCredentials = credentials && Object.values(credentials).some((v) => v?.trim());

    setSaving(true);
    try {
      // 如果有新凭证，先验证凭证是否正确
      if (hasNewCredentials) {
        const validateResponse = await botChannelClient.validateCredentials({
          params: { hostname },
          body: {
            channelType: selectedChannelType,
            credentials,
            config,
          },
        });

        if (
          validateResponse.status === 200 &&
          validateResponse.body.data?.status === 'error'
        ) {
          toast.error(
            `凭证验证失败: ${validateResponse.body.data.message || '请检查凭证是否正确'}`,
          );
          setSaving(false);
          return;
        }

        if (validateResponse.status !== 200) {
          toast.error('凭证验证失败，请检查凭证是否正确');
          setSaving(false);
          return;
        }
      }

      // 验证通过，保存配置
      if (selectedChannel) {
        // 更新现有渠道 - 只有当有新凭证时才传递 credentials
        await botChannelClient.update({
          params: { hostname, channelId: selectedChannel.id },
          body: hasNewCredentials ? { credentials, config } : { config },
        });
      } else {
        // 创建新渠道 - 必须有凭证
        if (!credentials) {
          toast.error('创建渠道需要提供凭证');
          setSaving(false);
          return;
        }
        await botChannelClient.create({
          params: { hostname },
          body: {
            channelType: selectedChannelType,
            name: selectedDefinition?.label || selectedChannelType,
            credentials,
            config,
          },
        });
      }
      toast.success('配置已保存');
      queryClient.invalidateQueries({ queryKey: ['bot-channels', hostname] });
    } catch (error) {
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const isLoading = defsLoading || channelsLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex gap-6">
          <Skeleton className="h-[500px] w-64" />
          <Skeleton className="h-[500px] flex-1" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">{t('description')}</p>
      </div>

      {/* 主内容区 - 左右分栏 */}
      <div className="flex gap-6">
        {/* 左侧：渠道列表 */}
        <Card className="w-64 flex-shrink-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">消息渠道</CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <ScrollArea className="h-[500px]">
              <div className="space-y-1">
                {channelDefinitions.map((definition) => {
                  const channel = configuredChannels.find(
                    (c) => c.channelType === definition.id,
                  );
                  return (
                    <ChannelListItem
                      key={definition.id}
                      definition={definition}
                      channel={channel}
                      isSelected={selectedChannelType === definition.id}
                      onClick={() => setSelectedChannelType(definition.id)}
                    />
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* 右侧：配置表单 */}
        <Card className="flex-1">
          <CardContent className="p-6">
            {selectedDefinition ? (
              <ChannelConfigForm
                definition={selectedDefinition}
                channel={selectedChannel}
                onSave={handleSaveConfig}
                saving={saving}
              />
            ) : (
              <div className="h-[500px] flex items-center justify-center text-muted-foreground">
                {t('selectChannel')}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
