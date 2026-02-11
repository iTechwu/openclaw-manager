'use client';

import type { AvailableModel } from '@repo/contracts';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Button,
} from '@repo/ui';
import {
  CheckCircle,
  XCircle,
  Eye,
  Wrench,
  Radio,
  Brain,
  Sparkles,
  Key,
  RefreshCw,
  Zap,
  MessageSquare,
  Code,
  FileText,
  Globe,
  Shield,
  Cpu,
  Database,
  DollarSign,
  Image,
  Video,
  Volume2,
  Box,
  Bot,
  Calculator,
} from 'lucide-react';

interface ModelCardProps {
  model: AvailableModel;
  isAdmin?: boolean;
  onVerify?: (providerKeyId: string, model: string) => void;
  verifying?: boolean;
}

/**
 * 能力图标映射
 * 支持动态能力标签
 */
const CAPABILITY_ICONS: Record<string, React.ElementType> = {
  // 推理能力
  'deep-reasoning': Brain,
  'fast-reasoning': Brain,
  reasoning: Brain,
  // 搜索与工具
  'web-search': Globe,
  'code-execution': Code,
  tools: Wrench,
  'function-calling': Wrench,
  'agent-capable': Bot,
  // 视觉与多模态
  vision: Eye,
  multimodal: Eye,
  'image-generation': Image,
  'video-generation': Video,
  'audio-tts': Volume2,
  '3d-generation': Box,
  // 文本与语言
  streaming: Radio,
  'long-context': FileText,
  'chinese-optimized': Globe,
  creative: Sparkles,
  'math-optimized': Calculator,
  // 性能与成本
  'cost-optimized': DollarSign,
  'fast-response': Zap,
  fast: Zap,
  speed: Zap,
  premium: Sparkles,
  'general-purpose': Cpu,
  // 其他
  chat: MessageSquare,
  code: Code,
  coding: Code,
  document: FileText,
  multilingual: Globe,
  safety: Shield,
  moderation: Shield,
  embedding: Database,
  'extended-thinking': Sparkles,
  // 默认
  default: Cpu,
};

export function ModelCard({
  model,
  isAdmin,
  onVerify,
  verifying,
}: ModelCardProps) {
  // Get the first provider key ID for verification
  const firstProviderKeyId = model.providers?.[0]?.providerKeyId;

  const handleVerify = () => {
    if (firstProviderKeyId && onVerify) {
      onVerify(firstProviderKeyId, model.model);
    }
  };

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
          <div className="flex items-center gap-2">
            {isAdmin && firstProviderKeyId && onVerify && (
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={handleVerify}
                disabled={verifying}
                title="验证模型可用性"
              >
                <RefreshCw
                  className={`size-3.5 ${verifying ? 'animate-spin' : ''}`}
                />
              </Button>
            )}
            {model.isAvailable ? (
              <CheckCircle className="text-green-500 size-5 shrink-0" />
            ) : (
              <XCircle className="text-muted-foreground size-5 shrink-0" />
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        {/* Capabilities */}
        <div className="flex flex-wrap gap-1.5">
          {model.capabilityTags?.map((tag) => {
            const Icon = CAPABILITY_ICONS[tag.tagId] || CAPABILITY_ICONS.default;
            return (
              <Badge key={tag.tagId} variant="outline" className="gap-1 text-xs">
                {Icon && <Icon className="size-3" />}
                {tag.name}
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
