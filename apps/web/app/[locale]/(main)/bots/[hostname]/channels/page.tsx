'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import {
  botChannelApi,
  channelApi,
  botChannelClient,
} from '@/lib/api/contracts/client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Skeleton,
  Switch,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Input,
  Label,
} from '@repo/ui';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Wifi,
  WifiOff,
  AlertCircle,
  Loader2,
  MessageSquare,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { toast } from 'sonner';
import type {
  BotChannelItem,
  ChannelConnectionStatus,
  ChannelDefinition,
} from '@repo/contracts';
import {
  ChannelIcon,
  channelColors,
} from '@/lib/config/channels/channel-icons';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQueryOptions = any;

/**
 * 连接状态配置
 */
const connectionStatusConfig: Record<
  ChannelConnectionStatus,
  {
    label: string;
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
  }
> = {
  DISCONNECTED: { label: '未连接', variant: 'secondary' },
  CONNECTING: { label: '连接中', variant: 'outline' },
  CONNECTED: { label: '已连接', variant: 'default' },
  ERROR: { label: '错误', variant: 'destructive' },
};

/**
 * 渠道卡片组件 - openclaw.ai 风格
 */
function ChannelCard({
  channel,
  channelDefinitions,
  onToggle,
  onConnect,
  onDisconnect,
  onDelete,
  isConnecting,
}: {
  channel: BotChannelItem;
  channelDefinitions: ChannelDefinition[];
  onToggle: (channelId: string, enabled: boolean) => void;
  onConnect: (channelId: string) => void;
  onDisconnect: (channelId: string) => void;
  onDelete: (channelId: string) => void;
  isConnecting: boolean;
}) {
  const definition = channelDefinitions.find(
    (d) => d.id === channel.channelType,
  );
  const statusConfig = connectionStatusConfig[channel.connectionStatus];
  const accentColor = channelColors[channel.channelType] || '#6B7280';

  return (
    <Card
      className="group relative overflow-hidden transition-all hover:shadow-lg"
      style={{ '--accent': accentColor } as React.CSSProperties}
    >
      {/* 顶部彩色边框 */}
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{ backgroundColor: accentColor }}
      />
      <CardHeader className="pb-3 pt-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {/* 渠道图标 - 圆形背景 */}
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full"
              style={{ backgroundColor: `${accentColor}20` }}
            >
              <ChannelIcon channelId={channel.channelType} size={28} />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">
                {channel.name}
              </CardTitle>
              <CardDescription className="text-xs">
                {definition?.label || channel.channelType}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
            <Switch
              checked={channel.isEnabled}
              onCheckedChange={(checked) => onToggle(channel.id, checked)}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {channel.lastError && (
          <div className="mb-3 flex items-center gap-2 rounded-md bg-red-50 p-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
            <AlertCircle className="h-4 w-4" />
            <span className="line-clamp-1">{channel.lastError}</span>
          </div>
        )}
        {channel.lastConnectedAt && (
          <p className="text-muted-foreground mb-3 text-xs">
            上次连接: {new Date(channel.lastConnectedAt).toLocaleString()}
          </p>
        )}
        <div className="flex justify-end gap-2">
          {channel.connectionStatus === 'CONNECTED' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDisconnect(channel.id)}
              disabled={isConnecting}
            >
              <WifiOff className="mr-1 h-3 w-3" />
              断开
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onConnect(channel.id)}
              disabled={
                isConnecting || channel.connectionStatus === 'CONNECTING'
              }
            >
              {isConnecting || channel.connectionStatus === 'CONNECTING' ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Wifi className="mr-1 h-3 w-3" />
              )}
              连接
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(channel.id)}
          >
            <Trash2 className="mr-1 h-3 w-3" />
            删除
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * 骨架屏
 */
function ChannelCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div>
              <Skeleton className="mb-1 h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
          <Skeleton className="h-6 w-16" />
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="mb-3 h-4 w-full" />
        <div className="flex justify-end gap-2">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-16" />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * 添加渠道对话框 - openclaw.ai 风格
 */
function AddChannelDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
  channelDefinitions,
  popularChannels,
  otherChannels,
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    channelType: string;
    name: string;
    credentials: Record<string, string>;
    config?: Record<string, unknown>;
  }) => void;
  isSubmitting: boolean;
  channelDefinitions: ChannelDefinition[];
  popularChannels: ChannelDefinition[];
  otherChannels: ChannelDefinition[];
  locale: string;
}) {
  const [selectedChannelType, setSelectedChannelType] = useState<string>('');
  const [name, setName] = useState('');
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [showMoreChannels, setShowMoreChannels] = useState(false);

  const selectedDefinition = useMemo(
    () => channelDefinitions.find((d) => d.id === selectedChannelType),
    [channelDefinitions, selectedChannelType],
  );

  const handleSubmit = () => {
    if (!selectedChannelType || !name.trim()) {
      toast.error(
        locale === 'zh-CN'
          ? '请选择渠道类型并填写名称'
          : 'Please select a channel type and enter a name',
      );
      return;
    }

    // 验证必填字段
    const missingFields: string[] = [];
    for (const field of selectedDefinition?.credentialFields || []) {
      if (field.required && !credentials[field.key]?.trim()) {
        missingFields.push(field.label);
      }
    }

    if (missingFields.length > 0) {
      toast.error(
        locale === 'zh-CN'
          ? `请填写必填字段: ${missingFields.join(', ')}`
          : `Please fill in required fields: ${missingFields.join(', ')}`,
      );
      return;
    }

    onSubmit({
      channelType: selectedChannelType,
      name: name.trim(),
      credentials,
      config: {},
    });
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSelectedChannelType('');
      setName('');
      setCredentials({});
      setShowMoreChannels(false);
    }
    onOpenChange(newOpen);
  };

  const handleCredentialChange = (key: string, value: string) => {
    setCredentials((prev) => ({ ...prev, [key]: value }));
  };

  const handleSelectChannel = (channelId: string) => {
    setSelectedChannelType(channelId);
    setCredentials({});
  };

  const renderChannelButton = (def: ChannelDefinition) => {
    const accentColor = channelColors[def.id] || '#6B7280';
    const isSelected = selectedChannelType === def.id;
    return (
      <button
        key={def.id}
        type="button"
        onClick={() => handleSelectChannel(def.id)}
        className={`
          relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all
          hover:shadow-md hover:scale-[1.02]
          ${
            isSelected
              ? 'border-primary bg-primary/5 shadow-md'
              : 'border-border hover:border-primary/50'
          }
        `}
        style={
          {
            '--accent': accentColor,
          } as React.CSSProperties
        }
      >
        {/* 选中指示器 */}
        {isSelected && (
          <div
            className="absolute top-0 left-0 right-0 h-1 rounded-t-lg"
            style={{ backgroundColor: accentColor }}
          />
        )}
        {/* 图标 */}
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full"
          style={{ backgroundColor: `${accentColor}20` }}
        >
          <ChannelIcon channelId={def.id} size={28} />
        </div>
        {/* 名称 */}
        <span className="text-sm font-medium text-center">{def.label}</span>
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {locale === 'zh-CN' ? '添加渠道' : 'Add Channel'}
          </DialogTitle>
          <DialogDescription>
            {locale === 'zh-CN'
              ? '选择渠道类型并配置凭证以接收和回复消息'
              : 'Select a channel type and configure credentials to receive and reply to messages'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          {/* 推荐渠道 */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">
              {locale === 'zh-CN' ? '推荐渠道' : 'Recommended Channels'}
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {popularChannels.map(renderChannelButton)}
            </div>
          </div>

          {/* 更多渠道 - 可折叠 */}
          {otherChannels.length > 0 && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowMoreChannels(!showMoreChannels)}
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {showMoreChannels ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                {locale === 'zh-CN'
                  ? `更多渠道 (${otherChannels.length})`
                  : `More Channels (${otherChannels.length})`}
              </button>
              {showMoreChannels && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {otherChannels.map(renderChannelButton)}
                </div>
              )}
            </div>
          )}

          {/* 渠道配置表单 */}
          {selectedDefinition && (
            <div className="space-y-4 border-t pt-4">
              {/* 渠道名称 */}
              <div className="space-y-2">
                <Label htmlFor="name">
                  {locale === 'zh-CN' ? '渠道名称' : 'Channel Name'} *
                </Label>
                <Input
                  id="name"
                  placeholder={
                    locale === 'zh-CN' ? '例如：我的机器人' : 'e.g., My Bot'
                  }
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              {/* 动态凭证字段 */}
              {selectedDefinition.credentialFields.map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={field.key}>
                    {field.label} {field.required && '*'}
                  </Label>
                  <Input
                    id={field.key}
                    type={field.fieldType === 'password' ? 'password' : 'text'}
                    placeholder={field.placeholder}
                    value={credentials[field.key] || ''}
                    onChange={(e) =>
                      handleCredentialChange(field.key, e.target.value)
                    }
                  />
                </div>
              ))}

              {/* 帮助链接 */}
              {selectedDefinition.helpUrl && (
                <div className="text-muted-foreground flex items-center gap-1 text-xs">
                  <ExternalLink className="h-3 w-3" />
                  <a
                    href={selectedDefinition.helpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {selectedDefinition.helpText ||
                      (locale === 'zh-CN'
                        ? '查看帮助文档'
                        : 'View documentation')}
                  </a>
                </div>
              )}

              {/* Token 提示 */}
              {selectedDefinition.tokenHint && (
                <p className="text-muted-foreground text-xs bg-muted/50 p-3 rounded-lg">
                  💡 {selectedDefinition.tokenHint}
                </p>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {locale === 'zh-CN' ? '取消' : 'Cancel'}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedChannelType}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {locale === 'zh-CN' ? '添加' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Bot 渠道管理页面
 */
export default function BotChannelsPage() {
  const params = useParams<{ hostname: string }>();
  const hostname = params.hostname;
  const locale = useLocale();
  const queryClient = useQueryClient();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [connectingChannelId, setConnectingChannelId] = useState<string | null>(
    null,
  );

  // 获取渠道定义列表（传递 locale 参数）
  const { data: channelDefsResponse } = channelApi.list.useQuery(
    ['channel-definitions', locale],
    { query: { locale } },
    { staleTime: 1000 * 60 * 10 } as AnyQueryOptions, // 10 minutes
  );

  const channelDefinitions = channelDefsResponse?.body?.data?.channels || [];
  const popularChannels =
    channelDefsResponse?.body?.data?.popularChannels || [];
  const otherChannels = channelDefsResponse?.body?.data?.otherChannels || [];

  // 获取渠道列表
  const { data: channelsResponse, isLoading } = botChannelApi.list.useQuery(
    ['bot-channels', hostname],
    { params: { hostname } },
    { enabled: !!hostname } as AnyQueryOptions,
  );

  const channels = channelsResponse?.body?.data?.list || [];

  // 添加渠道
  const handleAddChannel = async (data: {
    channelType: string;
    name: string;
    credentials: Record<string, string>;
    config?: Record<string, unknown>;
  }) => {
    setIsSubmitting(true);
    try {
      const response = await botChannelClient.create({
        params: { hostname },
        body: data,
      });
      if (response.status === 201) {
        toast.success('渠道添加成功');
        queryClient.invalidateQueries({ queryKey: ['bot-channels', hostname] });
        setIsAddDialogOpen(false);
      }
    } catch (error) {
      toast.error('添加失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 切换渠道启用状态
  const handleToggle = async (channelId: string, enabled: boolean) => {
    try {
      const response = await botChannelClient.update({
        params: { hostname, channelId },
        body: { isEnabled: enabled },
      });
      if (response.status === 200) {
        toast.success(enabled ? '渠道已启用' : '渠道已禁用');
        queryClient.invalidateQueries({ queryKey: ['bot-channels', hostname] });
      }
    } catch (error) {
      toast.error('操作失败');
    }
  };

  // 连接渠道
  const handleConnect = async (channelId: string) => {
    setConnectingChannelId(channelId);
    try {
      const response = await botChannelClient.connection({
        params: { hostname, channelId },
        body: { action: 'connect' },
      });
      if (response.status === 200) {
        const result = response.body?.data;
        if (result?.connectionStatus === 'CONNECTED') {
          toast.success('渠道连接成功');
        } else if (result?.connectionStatus === 'ERROR') {
          toast.error(result?.lastError || '连接失败');
        }
        queryClient.invalidateQueries({ queryKey: ['bot-channels', hostname] });
      }
    } catch (error) {
      toast.error('连接失败');
    } finally {
      setConnectingChannelId(null);
    }
  };

  // 断开渠道
  const handleDisconnect = async (channelId: string) => {
    try {
      const response = await botChannelClient.connection({
        params: { hostname, channelId },
        body: { action: 'disconnect' },
      });
      if (response.status === 200) {
        toast.success('渠道已断开');
        queryClient.invalidateQueries({ queryKey: ['bot-channels', hostname] });
      }
    } catch (error) {
      toast.error('断开失败');
    }
  };

  // 删除渠道
  const handleDelete = async (channelId: string) => {
    if (!confirm('确定要删除此渠道吗？')) return;

    try {
      const response = await botChannelClient.delete({
        params: { hostname, channelId },
      });
      if (response.status === 200) {
        toast.success('渠道已删除');
        queryClient.invalidateQueries({ queryKey: ['bot-channels', hostname] });
      }
    } catch (error) {
      toast.error('删除失败');
    }
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/bots"
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">渠道管理</h1>
            <p className="text-muted-foreground text-sm">{hostname}</p>
          </div>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          添加渠道
        </Button>
      </div>

      {/* 渠道列表 */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <ChannelCardSkeleton key={i} />
          ))}
        </div>
      ) : channels.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="text-muted-foreground mx-auto mb-4 h-12 w-12 opacity-50" />
            <p className="text-muted-foreground mb-4">尚未配置任何渠道</p>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              添加第一个渠道
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {channels.map((channel) => (
            <ChannelCard
              key={channel.id}
              channel={channel}
              channelDefinitions={channelDefinitions}
              onToggle={handleToggle}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onDelete={handleDelete}
              isConnecting={connectingChannelId === channel.id}
            />
          ))}
        </div>
      )}

      {/* 添加渠道对话框 */}
      <AddChannelDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onSubmit={handleAddChannel}
        isSubmitting={isSubmitting}
        channelDefinitions={channelDefinitions}
        popularChannels={popularChannels}
        otherChannels={otherChannels}
        locale={locale}
      />
    </div>
  );
}
