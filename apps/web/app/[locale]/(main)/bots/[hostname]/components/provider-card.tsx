'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Skeleton,
} from '@repo/ui';
import { Bot, Star, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { cn } from '@repo/ui/lib/utils';
import { useState } from 'react';

interface ProviderModel {
  id: string;
  name: string;
  isPrimary: boolean;
}

interface ProviderCardProps {
  vendor: string;
  apiType?: string | null;
  label: string;
  baseUrl?: string | null;
  apiKeyMasked: string;
  models: ProviderModel[];
  isPrimary: boolean;
  onSetPrimaryModel: (modelId: string) => void;
  onDelete: () => void;
  loading?: boolean;
}

// Provider 颜色配置
const providerColors: Record<string, string> = {
  anthropic: '#D97706',
  openai: '#10A37F',
  google: '#4285F4',
  deepseek: '#0066FF',
  groq: '#F55036',
  mistral: '#FF7000',
  azure: '#0078D4',
  ollama: '#FFFFFF',
};

export function ProviderCard({
  vendor,
  apiType,
  label,
  baseUrl,
  apiKeyMasked,
  models,
  isPrimary,
  onSetPrimaryModel,
  onDelete,
  loading,
}: ProviderCardProps) {
  const [expanded, setExpanded] = useState(true);
  const accentColor = providerColors[vendor] || '#6B7280';
  const primaryModel = models.find((m) => m.isPrimary);
  const displayType = apiType || vendor;

  return (
    <Card className="relative overflow-hidden">
      {/* 顶部彩色边框 */}
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{ backgroundColor: accentColor }}
      />

      <CardHeader className="pt-5 pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {/* Provider 图标 */}
            <div
              className="size-10 rounded-full flex items-center justify-center"
              style={{ backgroundColor: `${accentColor}20` }}
            >
              <Bot className="size-5" style={{ color: accentColor }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-semibold">
                  {label} ({displayType})
                </CardTitle>
                <Badge variant="outline" className="text-xs">
                  已配置
                </Badge>
              </div>
              {baseUrl && (
                <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                  {baseUrl}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {models.length} 模型
            </span>
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1 hover:bg-muted rounded"
            >
              {expanded ? (
                <ChevronUp className="size-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="size-4 text-muted-foreground" />
              )}
            </button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0">
          {/* API Key */}
          <div className="mb-4">
            <span className="text-xs text-muted-foreground">API Key: </span>
            <code className="text-xs bg-muted px-2 py-0.5 rounded">
              {apiKeyMasked}
            </code>
          </div>

          {/* 模型列表 */}
          <div className="space-y-2">
            {loading ? (
              <>
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </>
            ) : (
              models.map((model) => (
                <div
                  key={model.id}
                  className={cn(
                    'flex items-center justify-between p-3 rounded-lg border',
                    model.isPrimary
                      ? 'border-primary/50 bg-primary/5'
                      : 'border-border bg-muted/30',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Bot className="size-4 text-muted-foreground" />
                    <div>
                      <span className="text-sm font-medium">{model.name}</span>
                      {model.isPrimary && (
                        <Badge variant="default" className="ml-2 text-xs">
                          <Star className="size-3 mr-1" />
                          主模型
                        </Badge>
                      )}
                    </div>
                  </div>
                  {!model.isPrimary && (
                    <button
                      onClick={() => onSetPrimaryModel(model.id)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      设为主模型
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* 删除按钮 */}
          <div className="mt-4 flex justify-end">
            <button
              onClick={onDelete}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600"
            >
              <Trash2 className="size-3" />
              删除 Provider
            </button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
