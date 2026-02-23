'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { skillApi } from '@/lib/api/contracts/client';
import { useLocalizedFields } from '@/hooks/useLocalizedFields';
import { Link } from '@/i18n/navigation';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Skeleton,
  Separator,
} from '@repo/ui';
import {
  ArrowLeft,
  Sparkles,
  User,
  ExternalLink,
  Calendar,
  Tag,
  BookOpen,
  Code,
} from 'lucide-react';

export default function SkillDetailPage() {
  const params = useParams<{ id: string }>();
  const t = useTranslations('skills');
  const { getName, getDescription } = useLocalizedFields();

  const { data: response, isLoading } = skillApi.getById.useQuery(
    ['skill-detail', params.id],
    { params: { skillId: params.id } },
    { enabled: !!params.id, queryKey: ['skill-detail', params.id] },
  );

  const skill = response?.body?.data;

  if (isLoading) {
    return <DetailSkeleton />;
  }

  if (!skill) {
    return (
      <div className="space-y-6">
        <BackLink label={t('detail.backToList')} />
        <div className="text-muted-foreground py-12 text-center">
          <p>{t('detail.notFound')}</p>
        </div>
      </div>
    );
  }

  const displayName = getName(skill);
  const displayDescription = getDescription(skill);
  const typeIcon = skill.skillType?.icon || '📦';
  const tags =
    skill.definition?.tags && Array.isArray(skill.definition.tags)
      ? (skill.definition.tags as string[])
      : [];

  return (
    <div className="space-y-6">
      <BackLink label={t('detail.backToList')} />

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="bg-muted flex h-14 w-14 items-center justify-center rounded-lg text-3xl">
          {typeIcon}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{displayName}</h1>
            <Badge variant="outline">v{skill.version}</Badge>
            {skill.isSystem ? (
              <Badge variant="secondary">
                <Sparkles className="mr-1 h-3 w-3" />
                {t('system')}
              </Badge>
            ) : (
              <Badge variant="outline">
                <User className="mr-1 h-3 w-3" />
                {t('custom')}
              </Badge>
            )}
          </div>
          {skill.skillType && (
            <Badge variant="secondary" className="mt-2">
              {getName(skill.skillType)}
            </Badge>
          )}
          {displayDescription && (
            <p className="text-muted-foreground mt-3">{displayDescription}</p>
          )}
        </div>
      </div>

      <Separator />

      {/* Metadata */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {skill.author && (
          <MetaItem
            icon={<User className="h-4 w-4" />}
            label={t('detail.author')}
            value={skill.author}
          />
        )}
        {skill.source && (
          <MetaItem
            icon={<Tag className="h-4 w-4" />}
            label={t('detail.source')}
            value={skill.source}
          />
        )}
        <MetaItem
          icon={<Calendar className="h-4 w-4" />}
          label={t('detail.createdAt')}
          value={new Date(skill.createdAt).toLocaleDateString()}
        />
        <MetaItem
          icon={<Calendar className="h-4 w-4" />}
          label={t('detail.updatedAt')}
          value={new Date(skill.updatedAt).toLocaleDateString()}
        />
      </div>

      {skill.sourceUrl && (
        <a
          href={skill.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:text-primary/80 inline-flex items-center gap-1 text-sm"
        >
          <ExternalLink className="h-4 w-4" />
          {t('detail.viewSource')}
        </a>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Tag className="h-4 w-4" />
              {t('detail.tags')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Examples */}
      {skill.examples && skill.examples.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4" />
              {t('detail.examples')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {skill.examples.map((example, i) => (
              <div key={i} className="bg-muted rounded-lg p-4">
                {example.description && (
                  <p className="text-muted-foreground mb-2 text-sm">
                    {example.description}
                  </p>
                )}
                <div className="space-y-2">
                  <div>
                    <span className="text-xs font-medium">
                      {t('detail.exampleInput')}:
                    </span>
                    <pre className="bg-background mt-1 overflow-x-auto rounded p-2 text-sm">
                      {example.input}
                    </pre>
                  </div>
                  <div>
                    <span className="text-xs font-medium">
                      {t('detail.exampleOutput')}:
                    </span>
                    <pre className="bg-background mt-1 overflow-x-auto rounded p-2 text-sm">
                      {example.output}
                    </pre>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Definition */}
      {skill.definition && Object.keys(skill.definition).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Code className="h-4 w-4" />
              {t('detail.definition')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted overflow-x-auto rounded-lg p-4 text-sm">
              {JSON.stringify(skill.definition, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BackLink({ label }: { label: string }) {
  return (
    <Link
      href="/skills"
      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Link>
  );
}

function MetaItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <div>
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="text-sm">{value}</p>
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-32" />
      <div className="flex items-start gap-4">
        <Skeleton className="h-14 w-14 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
      <Skeleton className="h-px w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
