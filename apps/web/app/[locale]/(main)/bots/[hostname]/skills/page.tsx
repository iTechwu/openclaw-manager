'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { botSkillApi, skillApi } from '@/lib/api/contracts/client';
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
  Wrench,
  MessageSquare,
  GitBranch,
  Sparkles,
  User,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { toast } from 'sonner';
import type { SkillType, BotSkillItem, SkillItem } from '@repo/contracts';

/**
 * 技能类型图标映射
 */
const skillTypeIcons: Record<SkillType, React.ElementType> = {
  tool: Wrench,
  prompt: MessageSquare,
  workflow: GitBranch,
};

/**
 * 已安装技能卡片
 */
function InstalledSkillCard({
  botSkill,
  hostname,
  onToggle,
  onUninstall,
  t,
}: {
  botSkill: BotSkillItem;
  hostname: string;
  onToggle: (skillId: string, enabled: boolean) => void;
  onUninstall: (skillId: string) => void;
  t: (key: string) => string;
}) {
  const { skill } = botSkill;
  const TypeIcon = skillTypeIcons[skill.skillType];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-muted flex h-8 w-8 items-center justify-center rounded">
              <TypeIcon className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base">{skill.name}</CardTitle>
              <CardDescription className="text-xs">
                v{skill.version}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={botSkill.isEnabled}
              onCheckedChange={(checked) => onToggle(skill.id, checked)}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex gap-1">
          {skill.isSystem ? (
            <Badge variant="secondary" className="text-xs">
              <Sparkles className="mr-1 h-3 w-3" />
              {t('system')}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs">
              <User className="mr-1 h-3 w-3" />
              {t('custom')}
            </Badge>
          )}
          <Badge variant="outline" className="text-xs">
            {t(`types.${skill.skillType}`)}
          </Badge>
        </div>
        <p className="text-muted-foreground mb-3 line-clamp-2 text-sm">
          {skill.description || t('noDescription')}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" disabled>
            <Settings className="mr-1 h-3 w-3" />
            {t('configure')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onUninstall(skill.id)}
          >
            <Trash2 className="mr-1 h-3 w-3" />
            {t('uninstall')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * 可安装技能卡片
 */
function AvailableSkillCard({
  skill,
  onInstall,
  isInstalling,
  t,
}: {
  skill: SkillItem;
  onInstall: (skillId: string) => void;
  isInstalling: boolean;
  t: (key: string) => string;
}) {
  const TypeIcon = skillTypeIcons[skill.skillType];

  return (
    <Card className="hover:border-primary/50 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-muted flex h-8 w-8 items-center justify-center rounded">
              <TypeIcon className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base">{skill.name}</CardTitle>
              <CardDescription className="text-xs">
                v{skill.version}
              </CardDescription>
            </div>
          </div>
          <div className="flex gap-1">
            {skill.isSystem ? (
              <Badge variant="secondary" className="text-xs">
                {t('system')}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs">
                {t('custom')}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground mb-3 line-clamp-2 text-sm">
          {skill.description || t('noDescription')}
        </p>
        <Button
          size="sm"
          className="w-full"
          onClick={() => onInstall(skill.id)}
          disabled={isInstalling}
        >
          <Plus className="mr-1 h-3 w-3" />
          {t('install')}
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * 骨架屏
 */
function SkillCardSkeleton() {
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
 * Bot 技能管理页面
 */
export default function BotSkillsPage() {
  const params = useParams<{ hostname: string }>();
  const hostname = params.hostname;
  const queryClient = useQueryClient();
  const t = useTranslations('botSkills');

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [installingSkillId, setInstallingSkillId] = useState<string | null>(
    null,
  );

  // 获取已安装的技能
  const { data: installedResponse, isLoading: installedLoading } =
    botSkillApi.list.useQuery(
      ['bot-skills', hostname],
      { params: { hostname } },
      { enabled: !!hostname, queryKey: ['bot-skills', hostname] },
    );

  const installedSkills = installedResponse?.body?.data || [];
  const installedSkillIds = new Set(installedSkills.map((s) => s.skillId));

  // 获取所有可用技能
  const { data: availableResponse, isLoading: availableLoading } =
    skillApi.list.useQuery(
      ['skills-available'],
      { query: { limit: 100 } },
      { enabled: isAddDialogOpen, queryKey: ['skills-available'] },
    );

  const availableSkills = (availableResponse?.body?.data?.list || []).filter(
    (s) => !installedSkillIds.has(s.id),
  );

  // 安装技能
  const handleInstall = async (skillId: string) => {
    setInstallingSkillId(skillId);
    try {
      const response = await botSkillApi.install.mutation({
        params: { hostname },
        body: { skillId },
      });
      if (response.status === 200) {
        toast.success(t('installSuccess'));
        queryClient.invalidateQueries({ queryKey: ['bot-skills', hostname] });
        setIsAddDialogOpen(false);
      }
    } catch (error) {
      toast.error(t('installFailed'));
    } finally {
      setInstallingSkillId(null);
    }
  };

  // 切换技能启用状态
  const handleToggle = async (skillId: string, enabled: boolean) => {
    try {
      const response = await botSkillApi.updateConfig.mutation({
        params: { hostname, skillId },
        body: { isEnabled: enabled },
      });
      if (response.status === 200) {
        toast.success(enabled ? t('enabled') : t('disabled'));
        queryClient.invalidateQueries({ queryKey: ['bot-skills', hostname] });
      }
    } catch (error) {
      toast.error(t('operationFailed'));
    }
  };

  // 卸载技能
  const handleUninstall = async (skillId: string) => {
    try {
      const response = await botSkillApi.uninstall.mutation({
        params: { hostname, skillId },
        body: {},
      });
      if (response.status === 200) {
        toast.success(t('uninstallSuccess'));
        queryClient.invalidateQueries({ queryKey: ['bot-skills', hostname] });
      }
    } catch (error) {
      toast.error(t('uninstallFailed'));
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
            <h1 className="text-2xl font-bold">{t('title')}</h1>
            <p className="text-muted-foreground text-sm">{hostname}</p>
          </div>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {t('addSkill')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[80vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('addSkill')}</DialogTitle>
              <DialogDescription>{t('addSkillDescription')}</DialogDescription>
            </DialogHeader>
            {availableLoading ? (
              <div className="grid gap-4 md:grid-cols-2">
                {[1, 2, 3, 4].map((i) => (
                  <SkillCardSkeleton key={i} />
                ))}
              </div>
            ) : availableSkills.length === 0 ? (
              <div className="text-muted-foreground py-8 text-center">
                <Wrench className="mx-auto mb-4 h-12 w-12 opacity-50" />
                <p>{t('noAvailableSkills')}</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {availableSkills.map((skill) => (
                  <AvailableSkillCard
                    key={skill.id}
                    skill={skill}
                    onInstall={handleInstall}
                    isInstalling={installingSkillId === skill.id}
                    t={t}
                  />
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* 已安装技能列表 */}
      {installedLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <SkillCardSkeleton key={i} />
          ))}
        </div>
      ) : installedSkills.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Wrench className="text-muted-foreground mx-auto mb-4 h-12 w-12 opacity-50" />
            <p className="text-muted-foreground mb-4">{t('noInstalledSkills')}</p>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('addFirstSkill')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {installedSkills.map((botSkill) => (
            <InstalledSkillCard
              key={botSkill.id}
              botSkill={botSkill}
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
