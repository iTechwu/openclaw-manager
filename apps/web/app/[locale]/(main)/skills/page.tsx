'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { skillApi } from '@/lib/api/contracts/client';
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
} from '@repo/ui';
import {
  Search,
  Wrench,
  MessageSquare,
  GitBranch,
  Plus,
  Sparkles,
  User,
} from 'lucide-react';
import type { SkillType } from '@repo/contracts';

/**
 * 技能类型图标映射
 */
const skillTypeIcons: Record<SkillType, React.ElementType> = {
  tool: Wrench,
  prompt: MessageSquare,
  workflow: GitBranch,
};

/**
 * 技能类型键列表
 */
const skillTypeKeys: SkillType[] = ['tool', 'prompt', 'workflow'];

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
    slug: string;
    description: string | null;
    version: string;
    skillType: SkillType;
    isSystem: boolean;
    isEnabled: boolean;
  };
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
 * 技能管理页面
 */
export default function SkillsPage() {
  const t = useTranslations('skills');
  const [search, setSearch] = useState('');
  const [skillType, setSkillType] = useState<SkillType | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'system' | 'custom'>(
    'all',
  );

  const { data: response, isLoading } = skillApi.list.useQuery(
    ['skills', { search, skillType, sourceFilter }],
    {
      query: {
        search: search || undefined,
        skillType: skillType === 'all' ? undefined : skillType,
        isSystem:
          sourceFilter === 'all'
            ? undefined
            : sourceFilter === 'system'
              ? true
              : false,
        limit: 50,
      },
    },
    {
      staleTime: 60000,
      queryKey: ['skills', { search, skillType, sourceFilter }],
    },
  );

  const skills = response?.body?.data?.list || [];

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground text-sm">{t('description')}</p>
        </div>
        <Dialog>
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
            {/* TODO: Add create skill form */}
            <div className="text-muted-foreground py-8 text-center text-sm">
              {t('comingSoon')}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* 来源切换 */}
      <Tabs
        value={sourceFilter}
        onValueChange={(v) =>
          setSourceFilter(v as 'all' | 'system' | 'custom')
        }
      >
        <TabsList>
          <TabsTrigger value="all">{t('allSkills')}</TabsTrigger>
          <TabsTrigger value="system">{t('systemSkills')}</TabsTrigger>
          <TabsTrigger value="custom">{t('customSkills')}</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* 搜索和筛选 */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={skillType}
          onValueChange={(v) => setSkillType(v as SkillType | 'all')}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t('allTypes')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allTypes')}</SelectItem>
            {skillTypeKeys.map((key) => (
              <SelectItem key={key} value={key}>
                {t(`types.${key}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 技能列表 */}
      {isLoading ? (
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {skills.map((skill) => (
            <SkillCard key={skill.id} skill={skill} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}
