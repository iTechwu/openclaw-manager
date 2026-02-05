'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { botChannelApi } from '@/lib/api/contracts/client';
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
  DialogTrigger,
  DialogFooter,
  Input,
  Label,
} from '@repo/ui';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Settings,
  Wifi,
  WifiOff,
  AlertCircle,
  Loader2,
  MessageSquare,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { toast } from 'sonner';
import type {
  BotChannelItem,
  ChannelConnectionStatus,
} from '@repo/contracts';

/**
 * 渠道类型配置
 */
const channelTypeConfig: Record<
  string,
  { label: string; icon: React.ElementType; color: string }
> = {
  feishu: {
    label: '飞书',
    icon: MessageSquare,
    color: 'bg-blue-500',
  },
};

/**
 * 连接状态配置
 */
const connectionStatusConfig: Record<
  ChannelConnectionStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  DISCONNECTED: { label: '未连接', variant: 'secondary' },
  CONNECTING: { label: '连接中', variant: 'outline' },
  CONNECTED: { label: '已连接', variant: 'default' },
  ERROR: { label: '错误', variant: 'destructive' },
};

/**
 * 渠道卡片组件
 */
function ChannelCard({
  channel,
  hostname,
  onToggle,
  onConnect,
  onDisconnect,
  onDelete,
  isConnecting,
}: {
  channel: BotChannelItem;
  hostname: string;
  onToggle: (channelId: string, enabled: boolean) => void;
  onConnect: (channelId: string) => void;
  onDisconnect: (channelId: string) => void;
  onDelete: (channelId: string) => void;
  isConnecting: boolean;
}) {
  const config = channelTypeConfig[channel.channelType] || {
    label: channel.channelType,
    icon: MessageSquare,
    color: 'bg-gray-500',
  };
  const ChannelIcon = config.icon;
  const statusConfig = connectionStatusConfig[channel.connectionStatus];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-lg ${config.color}`}
            >
              <ChannelIcon className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-base">{channel.name}</CardTitle>
              <CardDescription className="text-xs">
                {config.label}
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
 * 添加渠道对话框
 */
function AddChannelDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
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
}) {
  const [name, setName] = useState('');
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [requireMention, setRequireMention] = useState(true);

  const handleSubmit = () => {
    if (!name.trim() || !appId.trim() || !appSecret.trim()) {
      toast.error('请填写所有必填字段');
      return;
    }

    onSubmit({
      channelType: 'feishu',
      name: name.trim(),
      credentials: {
        appId: appId.trim(),
        appSecret: appSecret.trim(),
      },
      config: {
        requireMention,
        replyInThread: false,
        showTyping: true,
        domain: 'feishu',
      },
    });
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setName('');
      setAppId('');
      setAppSecret('');
      setRequireMention(true);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>添加飞书渠道</DialogTitle>
          <DialogDescription>
            配置飞书机器人以接收和回复消息
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">渠道名称 *</Label>
            <Input
              id="name"
              placeholder="例如：我的飞书机器人"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="appId">App ID *</Label>
            <Input
              id="appId"
              placeholder="飞书应用的 App ID"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="appSecret">App Secret *</Label>
            <Input
              id="appSecret"
              type="password"
              placeholder="飞书应用的 App Secret"
              value={appSecret}
              onChange={(e) => setAppSecret(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>需要 @机器人</Label>
              <p className="text-muted-foreground text-xs">
                开启后只响应 @机器人 的消息
              </p>
            </div>
            <Switch
              checked={requireMention}
              onCheckedChange={setRequireMention}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            添加
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
  const queryClient = useQueryClient();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [connectingChannelId, setConnectingChannelId] = useState<string | null>(
    null,
  );

  // 获取渠道列表
  const { data: channelsResponse, isLoading } = botChannelApi.list.useQuery(
    ['bot-channels', hostname],
    { params: { hostname } },
    { enabled: !!hostname },
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
      const response = await botChannelApi.create.mutation({
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
      const response = await botChannelApi.update.mutation({
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
      const response = await botChannelApi.connection.mutation({
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
      const response = await botChannelApi.connection.mutation({
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
      const response = await botChannelApi.delete.mutation({
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
              hostname={hostname}
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
      />
    </div>
  );
}
