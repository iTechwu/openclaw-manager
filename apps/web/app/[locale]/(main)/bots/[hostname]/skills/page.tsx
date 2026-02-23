'use client';

import { useState, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import {
  botSkillApi,
  skillApi,
  skillSyncApi,
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
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@repo/ui';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Settings,
  Wrench,
  Sparkles,
  User,
  Search,
  ChevronLeft,
  Loader2,
  ArrowUpDown,
  ArrowUpCircle,
  CheckSquare,
  X,
  Box,
  RefreshCw,
  FileText,
  Terminal,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { toast } from 'sonner';
import type {
  BotSkillItem,
  SkillItem,
  ContainerSkillItem,
} from '@repo/contracts';
import { useLocalizedFields } from '@/hooks/useLocalizedFields';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useLocale } from 'next-intl';
import { formatDistanceToNow } from 'date-fns';
import { zhCN, enUS } from 'date-fns/locale';

const PAGE_SIZE = 20;

/**
 * 获取技能图标
 */
function getSkillIcon(skill: {
  skillType?: { icon?: string | null } | null;
}): string {
  return skill.skillType?.icon || '📦';
}

/**
 * 已安装技能卡片
 */
function InstalledSkillCard({
  botSkill,
  onToggle,
  onRequestUninstall,
  onConfigure,
  onUpdate,
  isUpdating,
  isContainerBuiltin,
  t,
}: {
  botSkill: BotSkillItem;
  onToggle: (skillId: string, enabled: boolean) => void;
  onRequestUninstall: (skillId: string, name: string) => void;
  onConfigure: (botSkill: BotSkillItem) => void;
  onUpdate: (skillId: string) => void;
  isUpdating: boolean;
  isContainerBuiltin: boolean;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
}) {
  const { skill } = botSkill;
  const { getName, getDescription } = useLocalizedFields();
  const locale = useLocale();
  const skillIcon = getSkillIcon(skill);
  const dateLocale = locale === 'zh-CN' ? zhCN : enUS;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-muted flex h-8 w-8 items-center justify-center rounded text-lg">
              {skillIcon}
            </div>
            <div>
              <CardTitle className="text-base">{getName(skill)}</CardTitle>
              <CardDescription className="text-xs">
                v{botSkill.installedVersion || skill.version}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {botSkill.updateAvailable && (
              <Badge variant="default" className="text-xs">
                <ArrowUpCircle className="mr-1 h-3 w-3" />
                {t('updateAvailable')}
              </Badge>
            )}
            <Switch
              checked={botSkill.isEnabled}
              onCheckedChange={(checked) => onToggle(skill.id, checked)}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex flex-wrap gap-1">
          {skill.source === 'openclaw' && (
            <Badge variant="outline" className="text-xs">
              OpenClaw
            </Badge>
          )}
          {isContainerBuiltin && (
            <Badge variant="secondary" className="text-xs">
              <Box className="mr-1 h-3 w-3" />
              {t('containerBuiltin')}
            </Badge>
          )}
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
          {skill.skillType && (
            <Badge variant="outline" className="text-xs">
              {getName(skill.skillType)}
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground mb-1 line-clamp-2 text-sm">
          {getDescription(skill) || t('noDescription')}
        </p>
        <div className="text-muted-foreground mb-3 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          {skill.author && skill.author !== 'unknown' && (
            <span>by {skill.author}</span>
          )}
          {botSkill.fileCount && botSkill.fileCount > 1 && (
            <span className="inline-flex items-center gap-0.5">
              <FileText className="h-3 w-3" />
              {t('fileCount', { count: botSkill.fileCount })}
            </span>
          )}
          {botSkill.scriptExecuted && (
            <span className="inline-flex items-center gap-0.5">
              <Terminal className="h-3 w-3" />
              {t('hasScript')}
            </span>
          )}
          {botSkill.hasReferences && (
            <span className="inline-flex items-center gap-0.5">
              <FileText className="h-3 w-3" />
              {t('hasReferences')}
            </span>
          )}
          <span>
            {t('lastUpdated')}{' '}
            {formatDistanceToNow(new Date(botSkill.updatedAt), {
              addSuffix: true,
              locale: dateLocale,
            })}
          </span>
        </div>
        <div className="flex justify-end gap-2">
          {botSkill.updateAvailable && (
            <Button
              variant="default"
              size="sm"
              onClick={() => onUpdate(skill.id)}
              disabled={isUpdating}
            >
              {isUpdating ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <ArrowUpCircle className="mr-1 h-3 w-3" />
              )}
              {isUpdating ? t('updating') : t('update')}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onConfigure(botSkill)}
          >
            <Settings className="mr-1 h-3 w-3" />
            {t('configure')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRequestUninstall(skill.id, getName(skill))}
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
 * 可安装技能卡片（支持多选）
 */
function AvailableSkillCard({
  skill,
  onInstall,
  onPreview,
  isInstalling,
  isSelected,
  onSelect,
  batchMode,
  isContainerBuiltin,
  t,
}: {
  skill: SkillItem;
  onInstall: (skillId: string) => void;
  onPreview: (skill: SkillItem) => void;
  isInstalling: boolean;
  isSelected: boolean;
  onSelect: (skillId: string, selected: boolean) => void;
  batchMode: boolean;
  isContainerBuiltin: boolean;
  t: (key: string) => string;
}) {
  const { getName, getDescription } = useLocalizedFields();
  const skillIcon = getSkillIcon(skill);

  return (
    <Card
      className="hover:border-primary/50 cursor-pointer transition-colors"
      onClick={() => onPreview(skill)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {batchMode && (
              <Checkbox
                checked={isSelected}
                onCheckedChange={(checked) => {
                  onSelect(skill.id, !!checked);
                }}
                onClick={(e) => e.stopPropagation()}
              />
            )}
            <div className="bg-muted flex h-8 w-8 items-center justify-center rounded text-lg">
              {skillIcon}
            </div>
            <div>
              <CardTitle className="text-base">{getName(skill)}</CardTitle>
              <CardDescription className="text-xs">
                v{skill.version}
              </CardDescription>
            </div>
          </div>
          <div className="flex gap-1">
            {isContainerBuiltin && (
              <Badge variant="secondary" className="text-xs">
                <Box className="mr-1 h-3 w-3" />
                {t('containerBuiltin')}
              </Badge>
            )}
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
          {getDescription(skill) || t('noDescription')}
        </p>
        {!batchMode && (
          <Button
            size="sm"
            className="w-full"
            onClick={(e) => {
              e.stopPropagation();
              onInstall(skill.id);
            }}
            disabled={isInstalling}
          >
            {isInstalling ? (
              <>
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                {t('installing')}
              </>
            ) : (
              <>
                <Plus className="mr-1 h-3 w-3" />
                {t('install')}
              </>
            )}
          </Button>
        )}
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
 * 技能详情预览
 */
function SkillDetailPreview({
  skill,
  onBack,
  onInstall,
  isInstalling,
  t,
}: {
  skill: SkillItem;
  onBack: () => void;
  onInstall: (skillId: string) => void;
  isInstalling: boolean;
  t: (key: string) => string;
}) {
  const { getName, getDescription } = useLocalizedFields();
  const skillIcon = getSkillIcon(skill);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ChevronLeft className="mr-1 h-4 w-4" />
        {t('backToList')}
      </Button>
      <div className="flex items-start gap-4">
        <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-lg text-2xl">
          {skillIcon}
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold">{getName(skill)}</h3>
          <p className="text-muted-foreground text-sm">
            {getDescription(skill) || t('noDescription')}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-muted-foreground">{t('version')}:</span>{' '}
          <span>v{skill.version}</span>
        </div>
        {skill.author && (
          <div>
            <span className="text-muted-foreground">{t('author')}:</span>{' '}
            <span>{skill.author}</span>
          </div>
        )}
        {skill.source && (
          <div>
            <span className="text-muted-foreground">{t('source')}:</span>{' '}
            <Badge variant="outline" className="ml-1 text-xs">
              {skill.source}
            </Badge>
          </div>
        )}
      </div>
      {skill.skillType && (
        <div className="flex gap-1">
          <Badge variant="secondary">{getName(skill.skillType)}</Badge>
          {skill.isSystem && (
            <Badge variant="secondary">
              <Sparkles className="mr-1 h-3 w-3" />
              {t('system')}
            </Badge>
          )}
        </div>
      )}
      {Array.isArray(skill.definition?.tags) &&
        skill.definition.tags.length > 0 && (
          <div>
            <span className="text-muted-foreground text-sm">{t('tags')}:</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {(skill.definition.tags as string[]).map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}
      {skill.sourceUrl && (
        <a
          href={skill.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline"
        >
          GitHub ↗
        </a>
      )}
      <Button
        className="w-full"
        onClick={() => onInstall(skill.id)}
        disabled={isInstalling}
      >
        {isInstalling ? (
          <>
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            {t('installing')}
          </>
        ) : (
          <>
            <Plus className="mr-1 h-4 w-4" />
            {t('install')}
          </>
        )}
      </Button>
    </div>
  );
}

/**
 * 技能配置对话框
 */
function SkillConfigDialog({
  botSkill,
  open,
  onOpenChange,
  onSave,
  isSaving,
  t,
}: {
  botSkill: BotSkillItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (config: Record<string, unknown>) => void;
  isSaving: boolean;
  t: (key: string) => string;
}) {
  const { getName } = useLocalizedFields();
  const [entries, setEntries] = useState<Array<{ key: string; value: string }>>(
    () => {
      const config = botSkill.config || {};
      const items = Object.entries(config).map(([key, value]) => ({
        key,
        value: typeof value === 'string' ? value : JSON.stringify(value),
      }));
      return items.length > 0 ? items : [{ key: '', value: '' }];
    },
  );

  const handleAdd = () => {
    setEntries((prev) => [...prev, { key: '', value: '' }]);
  };

  const handleRemove = (index: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const handleChange = (index: number, field: 'key' | 'value', val: string) => {
    setEntries((prev) =>
      prev.map((entry, i) =>
        i === index ? { ...entry, [field]: val } : entry,
      ),
    );
  };

  const handleSave = () => {
    const config: Record<string, unknown> = {};
    for (const entry of entries) {
      if (entry.key.trim()) {
        try {
          config[entry.key.trim()] = JSON.parse(entry.value);
        } catch {
          config[entry.key.trim()] = entry.value;
        }
      }
    }
    onSave(config);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t('configTitle')} - {getName(botSkill.skill)}
          </DialogTitle>
          <DialogDescription>{t('configDescription')}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {entries.map((entry, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                placeholder={t('configKey')}
                value={entry.key}
                onChange={(e) => handleChange(index, 'key', e.target.value)}
                className="flex-1"
              />
              <Input
                placeholder={t('configValue')}
                value={entry.value}
                onChange={(e) => handleChange(index, 'value', e.target.value)}
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemove(index)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={handleAdd}>
            <Plus className="mr-1 h-3 w-3" />
            {t('addConfigItem')}
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {t('saveConfig')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 容器内置技能卡片（只读）
 */
function ContainerSkillCard({
  skill,
  t,
}: {
  skill: ContainerSkillItem;
  t: (key: string) => string;
}) {
  return (
    <Card
      className={`border-dashed${skill.enabled === false ? ' opacity-60' : ''}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-muted flex h-8 w-8 items-center justify-center rounded text-lg">
              <Box className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base">{skill.name}</CardTitle>
              {skill.version && (
                <CardDescription className="text-xs">
                  v{skill.version}
                </CardDescription>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {skill.enabled === false && (
              <Badge
                variant="outline"
                className="text-muted-foreground text-xs"
              >
                {t('disabled')}
              </Badge>
            )}
            <Badge variant="secondary" className="text-xs">
              {t('containerBuiltin')}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground line-clamp-2 text-sm">
          {skill.description || t('noDescription')}
        </p>
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
  const { getName } = useLocalizedFields();

  // 基础状态
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [installingSkillId, setInstallingSkillId] = useState<string | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [selectedTypeId, setSelectedTypeId] = useState<string>('all');
  const [previewSkill, setPreviewSkill] = useState<SkillItem | null>(null);
  const [uninstallTarget, setUninstallTarget] = useState<{
    skillId: string;
    name: string;
  } | null>(null);
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [installedSearch, setInstalledSearch] = useState('');
  const [updatingSkillId, setUpdatingSkillId] = useState<string | null>(null);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);

  // 排序状态
  const [sortBy, setSortBy] = useState<'createdAt' | 'name'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);

  // 批量安装状态
  const [batchMode, setBatchMode] = useState(false);
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(
    new Set(),
  );
  const [isBatchInstalling, setIsBatchInstalling] = useState(false);

  // 配置面板状态
  const [configTarget, setConfigTarget] = useState<BotSkillItem | null>(null);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // 获取已安装的技能
  const { data: installedResponse, isLoading: installedLoading } =
    botSkillApi.list.useQuery(
      ['bot-skills', hostname],
      { params: { hostname } },
      { enabled: !!hostname, queryKey: ['bot-skills', hostname] },
    );

  const installedSkills = useMemo(
    () => installedResponse?.body?.data || [],
    [installedResponse],
  );
  const installedSkillIds = useMemo(
    () => new Set(installedSkills.map((s) => s.skillId)),
    [installedSkills],
  );

  // 获取容器内置技能（Docker exec 开销大，设置较长 staleTime）
  const { data: containerResponse, isLoading: containerLoading } =
    botSkillApi.containerSkills.useQuery(
      ['bot-container-skills', hostname],
      { params: { hostname } },
      {
        enabled: !!hostname,
        queryKey: ['bot-container-skills', hostname],
        staleTime: 5 * 60 * 1000, // 5 分钟内不重新请求
        refetchOnWindowFocus: false,
      },
    );

  const containerSkills = useMemo(
    () => containerResponse?.body?.data?.skills || [],
    [containerResponse],
  );
  const containerSource = containerResponse?.body?.data?.source;

  // 容器技能名称集合，用于去重标识
  const containerSkillNames = useMemo(
    () => new Set(containerSkills.map((s) => s.name.toLowerCase())),
    [containerSkills],
  );

  // 已安装技能客户端搜索过滤
  const filteredInstalledSkills = useMemo(() => {
    if (!installedSearch.trim()) return installedSkills;
    const q = installedSearch.toLowerCase();
    return installedSkills.filter((bs) => {
      const s = bs.skill;
      return (
        s.name?.toLowerCase().includes(q) ||
        s.nameZh?.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q) ||
        s.descriptionZh?.toLowerCase().includes(q)
      );
    });
  }, [installedSkills, installedSearch]);

  // 获取技能分类
  const { data: skillTypesResponse } = skillSyncApi.skillTypes.useQuery(
    ['skill-types'],
    {},
    { enabled: isAddDialogOpen, queryKey: ['skill-types'] },
  );
  const skillTypes = skillTypesResponse?.body?.data?.skillTypes || [];

  // 获取可用技能（带搜索、分类筛选、排序、分页）
  const skillListQuery = useMemo(
    () => ({
      limit: PAGE_SIZE,
      page: currentPage,
      sort: sortBy,
      asc: sortOrder,
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(selectedTypeId !== 'all' ? { skillTypeId: selectedTypeId } : {}),
    }),
    [debouncedSearch, selectedTypeId, sortBy, sortOrder, currentPage],
  );

  const { data: availableResponse, isLoading: availableLoading } =
    skillApi.list.useQuery(
      ['skills-available', skillListQuery],
      { query: skillListQuery },
      {
        enabled: isAddDialogOpen,
        queryKey: ['skills-available', skillListQuery],
      },
    );

  const allAvailableSkills = availableResponse?.body?.data?.list || [];
  const totalAvailable = availableResponse?.body?.data?.total || 0;
  const availableSkills = allAvailableSkills.filter(
    (s) => !installedSkillIds.has(s.id),
  );
  const hasMore = currentPage * PAGE_SIZE < totalAvailable;

  // 重置分页（搜索/筛选/排序变化时）
  const resetPage = useCallback(() => setCurrentPage(1), []);

  // 安装技能
  const handleInstall = async (skillId: string) => {
    setInstallingSkillId(skillId);
    try {
      const response = await botSkillApi.install.mutation({
        params: { hostname },
        body: { skillId },
      });
      if (response.status === 200) {
        const skill = response.body.data.skill;
        const msg =
          skill.source === 'openclaw'
            ? t('installSuccessOpenClaw')
            : t('installSuccess');
        toast.success(msg);
        queryClient.invalidateQueries({ queryKey: ['bot-skills', hostname] });
        setIsAddDialogOpen(false);
        setPreviewSkill(null);
      } else if (response.status === 409) {
        toast.warning(t('alreadyInstalled'));
        queryClient.invalidateQueries({ queryKey: ['bot-skills', hostname] });
      } else {
        toast.error(t('installFailed'), {
          action: { label: t('retry'), onClick: () => handleInstall(skillId) },
        });
      }
    } catch {
      toast.error(t('installFailed'), {
        action: { label: t('retry'), onClick: () => handleInstall(skillId) },
      });
    } finally {
      setInstallingSkillId(null);
    }
  };

  // 批量安装
  const handleBatchInstall = async () => {
    if (selectedSkillIds.size === 0) return;
    setIsBatchInstalling(true);
    try {
      const response = await botSkillApi.batchInstall.mutation({
        params: { hostname },
        body: { skillIds: Array.from(selectedSkillIds) },
      });
      if (response.status === 200) {
        const result = response.body.data;
        toast.success(
          t('batchInstallSuccess', {
            installed: result.installed,
            skipped: result.skipped,
            failed: result.failed,
          }),
        );
        queryClient.invalidateQueries({ queryKey: ['bot-skills', hostname] });
        setSelectedSkillIds(new Set());
        setBatchMode(false);
        setIsAddDialogOpen(false);
      } else {
        toast.error(t('installFailed'), {
          action: { label: t('retry'), onClick: () => handleBatchInstall() },
        });
      }
    } catch {
      toast.error(t('installFailed'), {
        action: { label: t('retry'), onClick: () => handleBatchInstall() },
      });
    } finally {
      setIsBatchInstalling(false);
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
    } catch {
      toast.error(t('operationFailed'));
    }
  };

  // 卸载技能
  const handleUninstall = async (skillId: string) => {
    setIsUninstalling(true);
    try {
      const response = await botSkillApi.uninstall.mutation({
        params: { hostname, skillId },
        body: {},
      });
      if (response.status === 200) {
        toast.success(t('uninstallSuccess'));
        queryClient.invalidateQueries({ queryKey: ['bot-skills', hostname] });
      }
    } catch {
      toast.error(t('uninstallFailed'));
    } finally {
      setIsUninstalling(false);
      setUninstallTarget(null);
    }
  };

  // 更新技能版本
  const handleUpdate = async (skillId: string) => {
    setUpdatingSkillId(skillId);
    try {
      const response = await botSkillApi.updateVersion.mutation({
        params: { hostname, skillId },
        body: {},
      });
      if (response.status === 200) {
        const result = response.body.data;
        toast.success(
          t('updateSuccess', {
            previousVersion: result.previousVersion || '?',
            newVersion: result.newVersion,
          }),
        );
        queryClient.invalidateQueries({ queryKey: ['bot-skills', hostname] });
      } else {
        toast.error(t('updateFailed'), {
          action: { label: t('retry'), onClick: () => handleUpdate(skillId) },
        });
      }
    } catch {
      toast.error(t('updateFailed'), {
        action: { label: t('retry'), onClick: () => handleUpdate(skillId) },
      });
    } finally {
      setUpdatingSkillId(null);
    }
  };

  // 批量检查更新
  const handleCheckUpdates = async () => {
    setIsCheckingUpdates(true);
    try {
      const response = await botSkillApi.checkUpdates.mutation({
        params: { hostname },
        body: {},
      });
      if (response.status === 200) {
        const result = response.body.data;
        if (result.updatesAvailable > 0) {
          toast.success(
            t('checkUpdatesResult', {
              updatesAvailable: String(result.updatesAvailable),
            }),
          );
        } else {
          toast.success(t('noUpdatesAvailable'));
        }
        queryClient.invalidateQueries({ queryKey: ['bot-skills', hostname] });
      } else {
        toast.error(t('checkUpdatesFailed'), {
          action: { label: t('retry'), onClick: () => handleCheckUpdates() },
        });
      }
    } catch {
      toast.error(t('checkUpdatesFailed'), {
        action: { label: t('retry'), onClick: () => handleCheckUpdates() },
      });
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  // 保存配置
  const handleSaveConfig = async (config: Record<string, unknown>) => {
    if (!configTarget) return;
    setIsSavingConfig(true);
    try {
      const response = await botSkillApi.updateConfig.mutation({
        params: { hostname, skillId: configTarget.skillId },
        body: { config },
      });
      if (response.status === 200) {
        toast.success(t('configSaved'));
        queryClient.invalidateQueries({ queryKey: ['bot-skills', hostname] });
        setConfigTarget(null);
      } else {
        toast.error(t('configSaveFailed'));
      }
    } catch {
      toast.error(t('configSaveFailed'));
    } finally {
      setIsSavingConfig(false);
    }
  };

  // 批量选择
  const handleSelectSkill = (skillId: string, selected: boolean) => {
    setSelectedSkillIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(skillId);
      else next.delete(skillId);
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedSkillIds(new Set(availableSkills.map((s) => s.id)));
  };

  const handleDeselectAll = () => {
    setSelectedSkillIds(new Set());
  };

  // 重置对话框状态
  const handleDialogOpenChange = (open: boolean) => {
    setIsAddDialogOpen(open);
    if (!open) {
      setSearchQuery('');
      setSelectedTypeId('all');
      setPreviewSkill(null);
      setBatchMode(false);
      setSelectedSkillIds(new Set());
      setCurrentPage(1);
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
        <Dialog open={isAddDialogOpen} onOpenChange={handleDialogOpenChange}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {t('addSkill')}
            </Button>
          </DialogTrigger>
          <DialogContent className="flex max-h-[80vh] max-w-3xl flex-col gap-0 p-0">
            <div className="border-b px-6 pt-6 pb-4">
              <DialogHeader>
                <DialogTitle>{t('addSkill')}</DialogTitle>
                <DialogDescription>
                  {t('addSkillDescription')}
                </DialogDescription>
              </DialogHeader>
              {!previewSkill && (
                <div className="mt-4 space-y-3">
                  {/* 搜索框 + 排序 */}
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                      <Input
                        placeholder={t('searchPlaceholder')}
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          resetPage();
                        }}
                        className="pl-9"
                      />
                    </div>
                    <Select
                      value={`${sortBy}-${sortOrder}`}
                      onValueChange={(val) => {
                        const [field, order] = val.split('-') as [
                          'name' | 'createdAt',
                          'asc' | 'desc',
                        ];
                        setSortBy(field);
                        setSortOrder(order);
                        resetPage();
                      }}
                    >
                      <SelectTrigger className="w-[130px]">
                        <ArrowUpDown className="mr-1 h-3 w-3" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="createdAt-desc">
                          {t('sortByDate')} ↓
                        </SelectItem>
                        <SelectItem value="createdAt-asc">
                          {t('sortByDate')} ↑
                        </SelectItem>
                        <SelectItem value="name-asc">
                          {t('sortByName')} A-Z
                        </SelectItem>
                        <SelectItem value="name-desc">
                          {t('sortByName')} Z-A
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant={batchMode ? 'default' : 'outline'}
                      size="icon"
                      onClick={() => {
                        setBatchMode(!batchMode);
                        setSelectedSkillIds(new Set());
                      }}
                      title={t('batchInstall')}
                    >
                      <CheckSquare className="h-4 w-4" />
                    </Button>
                  </div>
                  {/* 分类筛选 */}
                  {skillTypes.length > 0 && (
                    <Tabs
                      value={selectedTypeId}
                      onValueChange={(val) => {
                        setSelectedTypeId(val);
                        resetPage();
                      }}
                    >
                      <TabsList className="flex w-full justify-start overflow-x-auto">
                        <TabsTrigger value="all" className="shrink-0">
                          {t('allTypes')}
                        </TabsTrigger>
                        {skillTypes.map((type) => (
                          <TabsTrigger
                            key={type.id}
                            value={type.id}
                            className="shrink-0"
                          >
                            {type.icon && (
                              <span className="mr-1">{type.icon}</span>
                            )}
                            {getName(type)}
                            <Badge
                              variant="secondary"
                              className="ml-1 h-5 px-1 text-xs"
                            >
                              {type._count.skills}
                            </Badge>
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>
                  )}
                  {/* 批量操作栏 */}
                  {batchMode && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSelectAll}
                      >
                        {t('selectAll')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleDeselectAll}
                      >
                        {t('deselectAll')}
                      </Button>
                      {selectedSkillIds.size > 0 && (
                        <Button
                          size="sm"
                          onClick={handleBatchInstall}
                          disabled={isBatchInstalling}
                        >
                          {isBatchInstalling && (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          )}
                          {t('batchInstallCount', {
                            count: selectedSkillIds.size,
                          })}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {previewSkill ? (
                <SkillDetailPreview
                  skill={previewSkill}
                  onBack={() => setPreviewSkill(null)}
                  onInstall={handleInstall}
                  isInstalling={installingSkillId === previewSkill.id}
                  t={t}
                />
              ) : availableLoading ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {[1, 2, 3, 4].map((i) => (
                    <SkillCardSkeleton key={i} />
                  ))}
                </div>
              ) : availableSkills.length === 0 ? (
                <div className="text-muted-foreground py-8 text-center">
                  <Wrench className="mx-auto mb-4 h-12 w-12 opacity-50" />
                  <p>
                    {searchQuery || selectedTypeId !== 'all'
                      ? t('noSearchResults')
                      : t('noAvailableSkills')}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    {availableSkills.map((skill) => (
                      <AvailableSkillCard
                        key={skill.id}
                        skill={skill}
                        onInstall={handleInstall}
                        onPreview={setPreviewSkill}
                        isInstalling={installingSkillId === skill.id}
                        isSelected={selectedSkillIds.has(skill.id)}
                        onSelect={handleSelectSkill}
                        batchMode={batchMode}
                        isContainerBuiltin={containerSkillNames.has(
                          (skill.slug || skill.name).toLowerCase(),
                        )}
                        t={t}
                      />
                    ))}
                  </div>
                  {/* 分页：加载更多 */}
                  {hasMore && (
                    <div className="pt-2 text-center">
                      <Button
                        variant="outline"
                        onClick={() => setCurrentPage((p) => p + 1)}
                        disabled={availableLoading}
                      >
                        {t('loadMore')}
                      </Button>
                    </div>
                  )}
                  {!hasMore && availableSkills.length > 0 && (
                    <p className="text-muted-foreground pt-2 text-center text-xs">
                      {t('noMore')}
                    </p>
                  )}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* 技能 Tabs */}
      <Tabs defaultValue="installed" className="space-y-4">
        <TabsList>
          <TabsTrigger value="installed">
            {t('tabInstalled')}
            {!installedLoading && installedSkills.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">
                {installedSkills.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="container">
            {containerLoading && (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            )}
            {t('tabContainer')}
            {!containerLoading && containerSkills.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">
                {containerSkills.length}
              </Badge>
            )}
            {containerSource && containerSource !== 'none' && (
              <Badge
                variant={containerSource === 'docker' ? 'default' : 'outline'}
                className="ml-1 text-xs"
              >
                {containerSource === 'docker'
                  ? t('liveFromContainer')
                  : t('cachedData')}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* 已安装技能 */}
        <TabsContent value="installed" className="space-y-4">
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
                <p className="text-muted-foreground mb-4">
                  {t('noInstalledSkills')}
                </p>
                <Button onClick={() => setIsAddDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('addFirstSkill')}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center gap-2">
                {installedSkills.length > 3 && (
                  <div className="relative max-w-sm flex-1">
                    <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                    <Input
                      placeholder={t('searchInstalledPlaceholder')}
                      value={installedSearch}
                      onChange={(e) => setInstalledSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCheckUpdates}
                  disabled={isCheckingUpdates}
                >
                  {isCheckingUpdates ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1 h-3 w-3" />
                  )}
                  {isCheckingUpdates ? t('checkingUpdates') : t('checkUpdates')}
                </Button>
              </div>
              {filteredInstalledSkills.length === 0 ? (
                <div className="text-muted-foreground py-8 text-center">
                  <Search className="mx-auto mb-4 h-12 w-12 opacity-50" />
                  <p>{t('noSearchResults')}</p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {filteredInstalledSkills.map((botSkill) => (
                    <InstalledSkillCard
                      key={botSkill.id}
                      botSkill={botSkill}
                      onToggle={handleToggle}
                      onRequestUninstall={(skillId, name) =>
                        setUninstallTarget({ skillId, name })
                      }
                      onConfigure={setConfigTarget}
                      onUpdate={handleUpdate}
                      isUpdating={updatingSkillId === botSkill.skillId}
                      isContainerBuiltin={containerSkillNames.has(
                        (
                          botSkill.skill.slug || botSkill.skill.name
                        ).toLowerCase(),
                      )}
                      t={t}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* 容器内置技能 */}
        <TabsContent value="container" className="space-y-4">
          {containerLoading ? (
            <div className="space-y-4">
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t('containerLoadingText')}</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <SkillCardSkeleton key={i} />
                ))}
              </div>
            </div>
          ) : containerSkills.length === 0 ? (
            <div className="text-muted-foreground py-8 text-center">
              <Box className="mx-auto mb-4 h-12 w-12 opacity-50" />
              <p>{t('noContainerSkills')}</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {containerSkills.map((skill) => (
                <ContainerSkillCard key={skill.name} skill={skill} t={t} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* 卸载确认对话框 */}
      <Dialog
        open={!!uninstallTarget}
        onOpenChange={(open) =>
          !open && !isUninstalling && setUninstallTarget(null)
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('uninstallConfirmTitle')}</DialogTitle>
            <DialogDescription>
              {t('uninstallConfirmDescription')}
              {uninstallTarget?.name && (
                <span className="text-foreground mt-1 block font-medium">
                  {uninstallTarget.name}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUninstallTarget(null)}
              disabled={isUninstalling}
            >
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                uninstallTarget && handleUninstall(uninstallTarget.skillId)
              }
              disabled={isUninstalling}
            >
              {isUninstalling ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1 h-4 w-4" />
              )}
              {t('uninstallConfirmAction')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 技能配置对话框 */}
      {configTarget && (
        <SkillConfigDialog
          botSkill={configTarget}
          open={!!configTarget}
          onOpenChange={(open) => !open && setConfigTarget(null)}
          onSave={handleSaveConfig}
          isSaving={isSavingConfig}
          t={t}
        />
      )}
    </div>
  );
}
