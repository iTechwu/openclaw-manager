'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { skillApi, skillSyncApi } from '@/lib/api/contracts/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useLocalizedFields } from '@/hooks/useLocalizedFields';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Badge,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  Label,
  Textarea,
  ScrollArea,
  Alert,
  AlertDescription,
} from '@repo/ui';
import {
  Search,
  Wrench,
  Plus,
  Sparkles,
  User,
  Loader2,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  AlertCircle,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import type { CreateSkillRequest, SkillTypeWithCount } from '@repo/contracts';

/**
 * 技能卡片组件
 */
function SkillCard({
  skill,
  t,
}: {
  skill: {
    id: string;
    name: string;
    nameZh?: string | null;
    slug: string;
    description: string | null;
    descriptionZh?: string | null;
    version: string;
    isSystem: boolean;
    isEnabled: boolean;
    skillType?: {
      name: string;
      nameZh?: string | null;
      icon?: string | null;
    } | null;
  };
  t: (key: string) => string;
}) {
  const { getName, getDescription } = useLocalizedFields();

  const displayName = getName(skill);
  const displayDescription = getDescription(skill);
  const typeIcon = skill.skillType?.icon || '📦';

  return (
    <Card className="hover:border-primary/50 flex h-full cursor-pointer flex-col transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded text-lg">
              {typeIcon}
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate text-base">
                {displayName}
              </CardTitle>
              <CardDescription className="text-xs">
                v{skill.version}
              </CardDescription>
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
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
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <p className="text-muted-foreground line-clamp-2 text-sm">
          {displayDescription || t('noDescription')}
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * 技能卡片骨架屏
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
          <Skeleton className="h-5 w-12" />
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  );
}

/**
 * 技能类型侧边栏项
 */
function SkillTypeSidebarItem({
  skillType,
  isSelected,
  onClick,
}: {
  skillType: SkillTypeWithCount;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { getName } = useLocalizedFields();
  const displayName = getName(skillType);

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
        isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-base">{skillType.icon || '📦'}</span>
        <span className="truncate">{displayName}</span>
      </div>
      <div className="flex items-center gap-1">
        <Badge
          variant={isSelected ? 'secondary' : 'outline'}
          className="text-xs"
        >
          {skillType._count.skills}
        </Badge>
        <ChevronRight className="h-4 w-4 opacity-50" />
      </div>
    </button>
  );
}

/**
 * 创建技能表单组件
 */
function CreateSkillForm({
  skillTypes,
  onSuccess,
  onCancel,
  t,
}: {
  skillTypes: SkillTypeWithCount[];
  onSuccess: () => void;
  onCancel: () => void;
  t: (key: string) => string;
}) {
  const { getName } = useLocalizedFields();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<Partial<CreateSkillRequest>>({
    name: '',
    slug: '',
    description: '',
    version: '1.0.0',
    skillTypeId: undefined,
    definition: {},
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.slug) {
      toast.error(t('fillRequiredFields'));
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await skillApi.create.mutation({
        body: {
          name: formData.name,
          slug: formData.slug,
          description: formData.description || undefined,
          version: formData.version || '1.0.0',
          skillTypeId: formData.skillTypeId,
          definition: formData.definition || {},
        },
      });

      if (response.status === 200) {
        toast.success(t('createSuccess'));
        queryClient.invalidateQueries({ queryKey: ['skills'] });
        onSuccess();
      } else {
        toast.error(t('createFailed'));
      }
    } catch {
      toast.error(t('createFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNameChange = (name: string) => {
    setFormData((prev) => ({
      ...prev,
      name,
      slug:
        prev.slug ||
        name
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, ''),
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">{t('form.name')} *</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder={t('form.namePlaceholder')}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="slug">{t('form.slug')} *</Label>
        <Input
          id="slug"
          value={formData.slug}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, slug: e.target.value }))
          }
          placeholder={t('form.slugPlaceholder')}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="skillType">{t('form.type')}</Label>
        <Select
          value={formData.skillTypeId || ''}
          onValueChange={(v) =>
            setFormData((prev) => ({ ...prev, skillTypeId: v || undefined }))
          }
        >
          <SelectTrigger>
            <SelectValue placeholder={t('form.selectType')} />
          </SelectTrigger>
          <SelectContent>
            {skillTypes.map((type) => (
              <SelectItem key={type.id} value={type.id}>
                <span className="mr-2">{type.icon || '📦'}</span>
                {getName(type)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">{t('form.description')}</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, description: e.target.value }))
          }
          placeholder={t('form.descriptionPlaceholder')}
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="version">{t('form.version')}</Label>
        <Input
          id="version"
          value={formData.version}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, version: e.target.value }))
          }
          placeholder="1.0.0"
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('form.cancel')}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('form.create')}
        </Button>
      </DialogFooter>
    </form>
  );
}

const PAGE_SIZE = 12;

/**
 * 技能管理页面
 */
export default function SkillsPage() {
  const t = useTranslations('skills');
  const { getName } = useLocalizedFields();
  const [search, setSearch] = useState('');
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'system' | 'custom'>(
    'all',
  );
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [page, setPage] = useState(1);

  // 获取技能类型列表
  const { data: skillTypesResponse, isLoading: isLoadingTypes } =
    skillSyncApi.skillTypes.useQuery(
      ['skill-types'],
      {},
      {
        staleTime: 300000,
        queryKey: ['skill-types'],
      },
    );

  const skillTypes = skillTypesResponse?.body?.data?.skillTypes || [];

  // 获取技能列表（使用分页 API）
  const isSystemParam =
    sourceFilter === 'all'
      ? 'all'
      : sourceFilter === 'system'
        ? 'true'
        : 'false';

  const {
    data: response,
    isLoading,
    error: skillsError,
  } = skillSyncApi.skills.useQuery(
    ['skills', { search, selectedTypeId, sourceFilter, page }],
    {
      query: {
        search: search || undefined,
        skillTypeId: selectedTypeId || undefined,
        isSystem: isSystemParam as 'all' | 'true' | 'false',
        page,
        limit: PAGE_SIZE,
      },
    },
    {
      staleTime: 60000,
      queryKey: ['skills', { search, selectedTypeId, sourceFilter, page }],
    },
  );

  const skills = response?.body?.data?.list || [];
  const total = response?.body?.data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // 重置页码当筛选条件变化时
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleTypeChange = (typeId: string | null) => {
    setSelectedTypeId(typeId);
    setPage(1);
  };

  const handleSourceFilterChange = (value: 'all' | 'system' | 'custom') => {
    setSourceFilter(value);
    setPage(1);
  };

  // 获取当前选中的类型名称
  const selectedType = skillTypes.find((t) => t.id === selectedTypeId);
  const selectedTypeName = selectedType ? getName(selectedType) : t('allTypes');

  return (
    <div className="flex h-full gap-6">
      {/* 左侧技能类型列表 */}
      <div className="w-64 shrink-0">
        <div className="sticky top-0">
          <h2 className="mb-4 text-lg font-semibold">{t('skillTypes')}</h2>
          <ScrollArea className="h-[calc(100vh-200px)]">
            <div className="space-y-1 pr-4">
              {/* 全部类型 */}
              <button
                onClick={() => handleTypeChange(null)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  selectedTypeId === null
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">📋</span>
                  <span>{t('allTypes')}</span>
                </div>
                <Badge
                  variant={selectedTypeId === null ? 'secondary' : 'outline'}
                  className="text-xs"
                >
                  {skillTypes.reduce((sum, t) => sum + t._count.skills, 0)}
                </Badge>
              </button>

              {/* 技能类型列表 */}
              {isLoadingTypes
                ? Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))
                : skillTypes.map((type) => (
                    <SkillTypeSidebarItem
                      key={type.id}
                      skillType={type}
                      isSelected={selectedTypeId === type.id}
                      onClick={() => handleTypeChange(type.id)}
                    />
                  ))}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* 右侧内容区 */}
      <div className="flex-1 space-y-6">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              {selectedTypeId ? selectedTypeName : t('title')}
            </h1>
            <p className="text-muted-foreground text-sm">{t('description')}</p>
          </div>
          <Dialog
            open={isCreateDialogOpen}
            onOpenChange={setIsCreateDialogOpen}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                {t('createSkill')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('createSkill')}</DialogTitle>
                <DialogDescription>
                  {t('createSkillDescription')}
                </DialogDescription>
              </DialogHeader>
              <CreateSkillForm
                skillTypes={skillTypes}
                t={t}
                onSuccess={() => setIsCreateDialogOpen(false)}
                onCancel={() => setIsCreateDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>

        {/* 来源切换 */}
        <Tabs
          value={sourceFilter}
          onValueChange={(v) =>
            handleSourceFilterChange(v as 'all' | 'system' | 'custom')
          }
        >
          <TabsList>
            <TabsTrigger value="all">{t('allSkills')}</TabsTrigger>
            <TabsTrigger value="system">{t('systemSkills')}</TabsTrigger>
            <TabsTrigger value="custom">{t('customSkills')}</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* 搜索 */}
        <div className="relative">
          <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* 技能列表 */}
        {skillsError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{t('loadError')}</AlertDescription>
          </Alert>
        ) : isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <SkillCardSkeleton key={i} />
            ))}
          </div>
        ) : skills.length === 0 ? (
          <div className="text-muted-foreground py-12 text-center">
            <Wrench className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p>{t('noSkills')}</p>
            {search && <p className="mt-1 text-sm">{t('tryOtherKeywords')}</p>}
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {skills.map((skill) => (
                <Link key={skill.id} href={`/skills/${skill.id}`}>
                  <SkillCard skill={skill} t={t} />
                </Link>
              ))}
            </div>

            {/* 分页 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t pt-4">
                <p className="text-muted-foreground text-sm">
                  {t('pagination.showing', {
                    from: (page - 1) * PAGE_SIZE + 1,
                    to: Math.min(page * PAGE_SIZE, total),
                    total,
                  })}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(1)}
                    disabled={page === 1}
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-muted-foreground px-3 text-sm">
                    {t('pagination.page', { page, totalPages })}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page + 1)}
                    disabled={page === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(totalPages)}
                    disabled={page === totalPages}
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
