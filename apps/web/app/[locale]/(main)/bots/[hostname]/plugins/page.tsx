'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { botPluginApi, pluginApi } from '@/lib/api/contracts/client';
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
} from '@repo/ui';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Settings,
  Globe,
  Database,
  Code,
  MessageSquare,
  Wrench,
  Puzzle,
  FolderOpen,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { toast } from 'sonner';
import type { PluginCategory, BotPluginItem, PluginItem } from '@repo/contracts';

/**
 * 分类图标映射
 */
const categoryIcons: Record<PluginCategory, React.ElementType> = {
  BROWSER: Globe,
  FILESYSTEM: FolderOpen,
  DATABASE: Database,
  API: Code,
  COMMUNICATION: MessageSquare,
  DEVELOPMENT: Wrench,
  CUSTOM: Puzzle,
};

/**
 * 分类标签映射
 */
const categoryLabels: Record<PluginCategory, string> = {
  BROWSER: '浏览器',
  FILESYSTEM: '文件系统',
  DATABASE: '数据库',
  API: 'API',
  COMMUNICATION: '通讯',
  DEVELOPMENT: '开发工具',
  CUSTOM: '自定义',
};

/**
 * 已安装插件卡片
 */
function InstalledPluginCard({
  botPlugin,
  hostname,
  onToggle,
  onUninstall,
}: {
  botPlugin: BotPluginItem;
  hostname: string;
  onToggle: (pluginId: string, enabled: boolean) => void;
  onUninstall: (pluginId: string) => void;
}) {
  const { plugin } = botPlugin;
  const CategoryIcon = categoryIcons[plugin.category];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {plugin.iconEmoji ? (
              <span className="text-2xl">{plugin.iconEmoji}</span>
            ) : plugin.iconUrl ? (
              <img
                src={plugin.iconUrl}
                alt={plugin.name}
                className="h-8 w-8 rounded"
              />
            ) : (
              <div className="bg-muted flex h-8 w-8 items-center justify-center rounded">
                <CategoryIcon className="h-4 w-4" />
              </div>
            )}
            <div>
              <CardTitle className="text-base">{plugin.name}</CardTitle>
              <CardDescription className="text-xs">
                v{plugin.version}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={botPlugin.isEnabled}
              onCheckedChange={(checked) => onToggle(plugin.id, checked)}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground mb-3 line-clamp-2 text-sm">
          {plugin.description || '暂无描述'}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" disabled>
            <Settings className="mr-1 h-3 w-3" />
            配置
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onUninstall(plugin.id)}
          >
            <Trash2 className="mr-1 h-3 w-3" />
            卸载
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * 可安装插件卡片
 */
function AvailablePluginCard({
  plugin,
  onInstall,
  isInstalling,
}: {
  plugin: PluginItem;
  onInstall: (pluginId: string) => void;
  isInstalling: boolean;
}) {
  const CategoryIcon = categoryIcons[plugin.category];

  return (
    <Card className="hover:border-primary/50 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {plugin.iconEmoji ? (
              <span className="text-2xl">{plugin.iconEmoji}</span>
            ) : plugin.iconUrl ? (
              <img
                src={plugin.iconUrl}
                alt={plugin.name}
                className="h-8 w-8 rounded"
              />
            ) : (
              <div className="bg-muted flex h-8 w-8 items-center justify-center rounded">
                <CategoryIcon className="h-4 w-4" />
              </div>
            )}
            <div>
              <CardTitle className="text-base">{plugin.name}</CardTitle>
              <CardDescription className="text-xs">
                v{plugin.version}
                {plugin.author && ` · ${plugin.author}`}
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">
            {categoryLabels[plugin.category]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground mb-3 line-clamp-2 text-sm">
          {plugin.description || '暂无描述'}
        </p>
        <Button
          size="sm"
          className="w-full"
          onClick={() => onInstall(plugin.id)}
          disabled={isInstalling}
        >
          <Plus className="mr-1 h-3 w-3" />
          安装
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * 骨架屏
 */
function PluginCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded" />
            <div>
              <Skeleton className="mb-1 h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="mb-3 h-10 w-full" />
        <Skeleton className="h-8 w-full" />
      </CardContent>
    </Card>
  );
}

/**
 * Bot 插件管理页面
 */
export default function BotPluginsPage() {
  const params = useParams<{ hostname: string }>();
  const hostname = params.hostname;
  const queryClient = useQueryClient();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [installingPluginId, setInstallingPluginId] = useState<string | null>(
    null,
  );

  // 获取已安装的插件
  const { data: installedResponse, isLoading: installedLoading } =
    botPluginApi.list.useQuery(
      ['bot-plugins', hostname],
      { params: { hostname } },
      {
        queryKey: ['bot-plugins', hostname],
        enabled: !!hostname,
      },
    );

  const installedPlugins = installedResponse?.body?.data || [];
  const installedPluginIds = new Set(installedPlugins.map((p) => p.pluginId));

  // 获取所有可用插件
  const { data: availableResponse, isLoading: availableLoading } =
    pluginApi.list.useQuery(
      ['plugins-available'],
      { query: { limit: 100 } },
      {
        queryKey: ['plugins-available'],
        enabled: isAddDialogOpen,
      },
    );

  const availablePlugins = (availableResponse?.body?.data?.list || []).filter(
    (p) => !installedPluginIds.has(p.id),
  );

  // 安装插件
  const handleInstall = async (pluginId: string) => {
    setInstallingPluginId(pluginId);
    try {
      const response = await botPluginApi.install.mutation({
        params: { hostname },
        body: { pluginId },
      });
      if (response.status === 200) {
        toast.success('插件安装成功');
        queryClient.invalidateQueries({ queryKey: ['bot-plugins', hostname] });
        setIsAddDialogOpen(false);
      }
    } catch (error) {
      toast.error('安装失败');
    } finally {
      setInstallingPluginId(null);
    }
  };

  // 切换插件启用状态
  const handleToggle = async (pluginId: string, enabled: boolean) => {
    try {
      const response = await botPluginApi.updateConfig.mutation({
        params: { hostname, pluginId },
        body: { isEnabled: enabled },
      });
      if (response.status === 200) {
        toast.success(enabled ? '插件已启用' : '插件已禁用');
        queryClient.invalidateQueries({ queryKey: ['bot-plugins', hostname] });
      }
    } catch (error) {
      toast.error('操作失败');
    }
  };

  // 卸载插件
  const handleUninstall = async (pluginId: string) => {
    try {
      const response = await botPluginApi.uninstall.mutation({
        params: { hostname, pluginId },
        body: {},
      });
      if (response.status === 200) {
        toast.success('插件已卸载');
        queryClient.invalidateQueries({ queryKey: ['bot-plugins', hostname] });
      }
    } catch (error) {
      toast.error('卸载失败');
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
            <h1 className="text-2xl font-bold">插件管理</h1>
            <p className="text-muted-foreground text-sm">{hostname}</p>
          </div>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              添加插件
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>添加插件</DialogTitle>
              <DialogDescription>
                选择要安装到此 Bot 的插件
              </DialogDescription>
            </DialogHeader>
            {availableLoading ? (
              <div className="grid gap-4 md:grid-cols-2">
                {[1, 2, 3, 4].map((i) => (
                  <PluginCardSkeleton key={i} />
                ))}
              </div>
            ) : availablePlugins.length === 0 ? (
              <div className="text-muted-foreground py-8 text-center">
                <Puzzle className="mx-auto mb-4 h-12 w-12 opacity-50" />
                <p>没有可安装的插件</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {availablePlugins.map((plugin) => (
                  <AvailablePluginCard
                    key={plugin.id}
                    plugin={plugin}
                    onInstall={handleInstall}
                    isInstalling={installingPluginId === plugin.id}
                  />
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* 已安装插件列表 */}
      {installedLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <PluginCardSkeleton key={i} />
          ))}
        </div>
      ) : installedPlugins.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Puzzle className="text-muted-foreground mx-auto mb-4 h-12 w-12 opacity-50" />
            <p className="text-muted-foreground mb-4">尚未安装任何插件</p>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              添加第一个插件
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {installedPlugins.map((botPlugin) => (
            <InstalledPluginCard
              key={botPlugin.id}
              botPlugin={botPlugin}
              hostname={hostname}
              onToggle={handleToggle}
              onUninstall={handleUninstall}
            />
          ))}
        </div>
      )}
    </div>
  );
}
