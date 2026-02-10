'use client';

import type { AvailableModel } from '@repo/contracts';
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@repo/ui';
import {
  CheckCircle,
  XCircle,
  Eye,
  Wrench,
  Radio,
  Brain,
  Sparkles,
  Key,
} from 'lucide-react';

interface ModelCardProps {
  model: AvailableModel;
}

/**
 * 能力图标映射
 */
const CAPABILITY_ICONS: Record<string, React.ElementType> = {
  vision: Eye,
  tools: Wrench,
  streaming: Radio,
  reasoning: Brain,
  'extended-thinking': Sparkles,
};

/**
 * 分类颜色映射
 */
const CATEGORY_COLORS: Record<string, string> = {
  reasoning:
    'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  balanced: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  fast: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  general: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
};

/**
 * 分类标签映射
 */
const CATEGORY_LABELS: Record<string, string> = {
  reasoning: '推理',
  balanced: '均衡',
  fast: '快速',
  general: '通用',
};

export function ModelCard({ model }: ModelCardProps) {
  const categoryColor =
    CATEGORY_COLORS[model.category] || CATEGORY_COLORS.general;
  const categoryLabel = CATEGORY_LABELS[model.category] || model.category;

  return (
    <Card className={model.isAvailable ? '' : 'opacity-60'}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-base">{model.displayName}</CardTitle>
            <p className="text-muted-foreground mt-0.5 text-xs font-mono">
              {model.model}
            </p>
          </div>
          {model.isAvailable ? (
            <CheckCircle className="text-green-500 size-5 shrink-0" />
          ) : (
            <XCircle className="text-muted-foreground size-5 shrink-0" />
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        {/* Category Badge */}
        <div className="mb-3">
          <Badge variant="secondary" className={categoryColor}>
            {categoryLabel}
          </Badge>
        </div>

        {/* Capabilities */}
        <div className="flex flex-wrap gap-1.5">
          {model.capabilities.map((cap) => {
            const Icon = CAPABILITY_ICONS[cap];
            return (
              <Badge key={cap} variant="outline" className="gap-1 text-xs">
                {Icon && <Icon className="size-3" />}
                {cap}
              </Badge>
            );
          })}
        </div>

        {/* Scores (if available) */}
        {(model.reasoningScore || model.codingScore || model.speedScore) && (
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            {model.reasoningScore && (
              <div className="text-center">
                <div className="text-muted-foreground">推理</div>
                <div className="font-medium">{model.reasoningScore}</div>
              </div>
            )}
            {model.codingScore && (
              <div className="text-center">
                <div className="text-muted-foreground">编码</div>
                <div className="font-medium">{model.codingScore}</div>
              </div>
            )}
            {model.speedScore && (
              <div className="text-center">
                <div className="text-muted-foreground">速度</div>
                <div className="font-medium">{model.speedScore}</div>
              </div>
            )}
          </div>
        )}

        {/* Provider Info (Admin only) */}
        {model.providers && model.providers.length > 0 && (
          <div className="mt-3 border-t pt-3">
            <div className="mb-1.5 flex items-center gap-1 text-xs text-muted-foreground">
              <Key className="size-3" />
              <span>Provider Keys</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {model.providers.map((provider) => (
                <Badge
                  key={provider.providerKeyId}
                  variant="outline"
                  className="text-xs"
                  title={`ID: ${provider.providerKeyId}`}
                >
                  {provider.label || provider.vendor}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
