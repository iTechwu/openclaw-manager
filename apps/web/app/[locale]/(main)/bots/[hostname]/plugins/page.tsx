'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
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
import type {
  PluginCategory,
  BotPluginItem,
  PluginItem,
} from '@repo/contracts';

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
 * 已安装插件卡片
 */
function InstalledPluginCard({
  botPlugin,
  hostname,
  onToggle,
  onUninstall,
  t,
}: {
  botPlugin: BotPluginItem;
  hostname: string;
  onToggle: (pluginId: string, enabled: boolean) => void;
  onUninstall: (pluginId: string) => void;
  t: (key: string) => string;
}) {
  const { plugin } = botPlugin;
  const CategoryIcon = categoryIcons[plugin.category] ?? Puzzle;

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
          {plugin.description || t('noDescription')}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" disabled>
            <Settings className="mr-1 h-3 w-3" />
            {t('botPlugins.configure')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onUninstall(plugin.id)}
          >
            <Trash2 className="mr-1 h-3 w-3" />
            {t('botPlugins.uninstall')}
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
  t,
}: {
  plugin: PluginItem;
  onInstall: (pluginId: string) => void;
  isInstalling: boolean;
  t: (key: string) => string;
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
            {t(`categories.${plugin.category}`)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground mb-3 line-clamp-2 text-sm">
          {plugin.description || t('noDescription')}
        </p>
        <Button
          size="sm"
          className="w-full"
          onClick={() => onInstall(plugin.id)}
          disabled={isInstalling}
        >
          <Plus className="mr-1 h-3 w-3" />
          {t('botPlugins.install')}
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
  const t = useTranslations('plugins');

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
        toast.success(t('botPlugins.installSuccess'));
        queryClient.invalidateQueries({ queryKey: ['bot-plugins', hostname] });
        setIsAddDialogOpen(false);
      }
    } catch (error) {
      toast.error(t('botPlugins.installFailed'));
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
        toast.success(
          enabled
            ? t('botPlugins.enableSuccess')
            : t('botPlugins.disableSuccess'),
        );
        queryClient.invalidateQueries({ queryKey: ['bot-plugins', hostname] });
      }
    } catch (error) {
      toast.error(t('botPlugins.toggleFailed'));
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
        toast.success(t('botPlugins.uninstallSuccess'));
        queryClient.invalidateQueries({ queryKey: ['bot-plugins', hostname] });
      }
    } catch (error) {
      toast.error(t('botPlugins.uninstallFailed'));
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
            <h1 className="text-2xl font-bold">{t('botPlugins.title')}</h1>
            <p className="text-muted-foreground text-sm">{hostname}</p>
          </div>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {t('botPlugins.addPlugin')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('botPlugins.addDialogTitle')}</DialogTitle>
              <DialogDescription>
                {t('botPlugins.addDialogDescription')}
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
                <p>{t('botPlugins.noAvailable')}</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {availablePlugins.map((plugin) => (
                  <AvailablePluginCard
                    key={plugin.id}
                    plugin={plugin}
                    onInstall={handleInstall}
                    isInstalling={installingPluginId === plugin.id}
                    t={t}
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
            <p className="text-muted-foreground mb-4">
              {t('botPlugins.noInstalled')}
            </p>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('botPlugins.addFirst')}
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
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}
