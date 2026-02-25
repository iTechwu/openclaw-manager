'use client';

import { useTranslations } from 'next-intl';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Badge,
} from '@repo/ui';
import { Zap, Sparkles, Info } from 'lucide-react';
import type { ModelApiType } from '@repo/contracts';
import {
  getModelSupportedApiTypes,
  shouldRecommendAnthropic,
} from '@repo/contracts';

interface ProtocolSelectorProps {
  /** 供应商 ID */
  vendor: string;
  /** 模型 ID */
  model: string;
  /** 当前选中的协议 */
  value: ModelApiType | null;
  /** 协议变更回调 */
  onChange: (apiType: ModelApiType | null) => void;
  /** 是否禁用 */
  disabled?: boolean;
  /** 显示模式: full 显示完整选择器, compact 显示紧凑模式 */
  mode?: 'full' | 'compact';
}

/**
 * 协议选择器组件
 *
 * 当模型支持多种协议时，显示协议选择器让用户选择首选协议。
 * 如果模型只支持一种协议，则不显示选择器。
 */
export function ProtocolSelector({
  vendor,
  model,
  value,
  onChange,
  disabled = false,
  mode = 'full',
}: ProtocolSelectorProps) {
  const t = useTranslations('bots.detail.modelRouting.protocol');

  // 获取模型支持的协议类型
  const supportedApiTypes = getModelSupportedApiTypes(vendor, model);

  // 如果只支持一种协议，不需要显示选择器
  if (supportedApiTypes.length <= 1) {
    return null;
  }

  // 检查是否推荐使用 Anthropic 协议
  const recommendation = shouldRecommendAnthropic(vendor, model);

  // 协议类型显示名称映射
  const protocolLabels: Record<ModelApiType, string> = {
    openai: t('types.openai'),
    anthropic: t('types.anthropic'),
    gemini: t('types.gemini'),
  };

  // 协议类型描述映射
  const protocolDescriptions: Record<ModelApiType, string> = {
    openai: t('types.openaiDesc'),
    anthropic: t('types.anthropicDesc'),
    gemini: t('types.geminiDesc'),
  };

  if (mode === 'compact') {
    return (
      <Select
        value={value ?? undefined}
        onValueChange={(v) => onChange(v as ModelApiType)}
        disabled={disabled}
      >
        <SelectTrigger className="h-8 w-auto min-w-[100px]">
          <SelectValue placeholder={t('select')} />
        </SelectTrigger>
        <SelectContent>
          {supportedApiTypes.map((apiType) => (
            <SelectItem key={apiType} value={apiType}>
              <div className="flex items-center gap-2">
                <span>{protocolLabels[apiType]}</span>
                {apiType === 'anthropic' && recommendation.recommend && (
                  <Sparkles className="size-3 text-primary" />
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Zap className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">{t('label')}</span>
        {recommendation.recommend && (
          <Badge variant="secondary" className="text-xs">
            <Sparkles className="size-3 mr-1" />
            {t('recommended')}
          </Badge>
        )}
      </div>

      <Select
        value={value ?? undefined}
        onValueChange={(v) => onChange(v as ModelApiType)}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder={t('select')} />
        </SelectTrigger>
        <SelectContent>
          {supportedApiTypes.map((apiType) => (
            <SelectItem key={apiType} value={apiType}>
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{protocolLabels[apiType]}</span>
                  {apiType === 'anthropic' && recommendation.recommend && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {t('recommended')}
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {protocolDescriptions[apiType]}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* 推荐提示 */}
      {recommendation.recommend && recommendation.reason && (
        <div className="flex items-start gap-2 p-2 bg-primary/5 rounded-md">
          <Info className="size-4 text-primary mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            {t('recommendationHint', { reason: recommendation.reason })}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * 获取协议选择器的初始值
 * 如果模型支持多种协议且推荐某种协议，则返回推荐的协议；否则返回 null
 */
export function getInitialProtocol(
  vendor: string,
  model: string,
): ModelApiType | null {
  const supportedApiTypes = getModelSupportedApiTypes(vendor, model);

  if (supportedApiTypes.length <= 1) {
    return null;
  }

  const recommendation = shouldRecommendAnthropic(vendor, model);
  if (recommendation.recommend && supportedApiTypes.includes('anthropic')) {
    return 'anthropic';
  }

  // 默认返回第一个支持的协议
  return supportedApiTypes[0] ?? null;
}
