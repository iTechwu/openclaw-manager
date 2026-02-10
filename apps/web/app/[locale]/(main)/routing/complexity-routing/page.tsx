'use client';

import { useState, useEffect } from 'react';
import { routingAdminApi, routingAdminClient } from '@/lib/api/contracts/client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
  Skeleton,
  Input,
  Button,
  Switch,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui';
import {
  Search,
  Brain,
  Plus,
  Pencil,
  Trash2,
  CheckCircle,
  XCircle,
  Sparkles,
  Zap,
  Target,
  Rocket,
  Crown,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { getUser } from '@/lib/storage';
import type { ComplexityRoutingConfig } from '@repo/contracts';

// 复杂度等级配置
const COMPLEXITY_LEVELS = [
  { key: 'super_easy', label: '超简单', icon: Sparkles, color: 'bg-green-500' },
  { key: 'easy', label: '简单', icon: Zap, color: 'bg-blue-500' },
  { key: 'medium', label: '中等', icon: Target, color: 'bg-yellow-500' },
  { key: 'hard', label: '困难', icon: Rocket, color: 'bg-orange-500' },
  { key: 'super_hard', label: '超困难', icon: Crown, color: 'bg-red-500' },
] as const;

type ComplexityLevel = (typeof COMPLEXITY_LEVELS)[number]['key'];

// 默认模型配置
const DEFAULT_MODELS: Record<ComplexityLevel, { vendor: string; model: string }> = {
  super_easy: { vendor: 'deepseek', model: 'deepseek-v3-250324' },
  easy: { vendor: 'deepseek', model: 'deepseek-v3-250324' },
  medium: { vendor: 'anthropic', model: 'claude-sonnet-4-20250514' },
  hard: { vendor: 'anthropic', model: 'claude-sonnet-4-20250514' },
  super_hard: { vendor: 'anthropic', model: 'claude-opus-4-20250514' },
};

// 可用的模型选项
const MODEL_OPTIONS = [
  { vendor: 'deepseek', model: 'deepseek-v3-250324', label: 'DeepSeek V3' },
  { vendor: 'deepseek', model: 'deepseek-chat', label: 'DeepSeek Chat' },
  { vendor: 'anthropic', model: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  { vendor: 'anthropic', model: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
  { vendor: 'anthropic', model: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
  { vendor: 'openai', model: 'gpt-4o', label: 'GPT-4o' },
  { vendor: 'openai', model: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { vendor: 'google', model: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
];

/**
 * 复杂度等级模型配置组件
 */
function ComplexityLevelConfig({
  level,
  config,
  onChange,
}: {
  level: (typeof COMPLEXITY_LEVELS)[number];
  config: { vendor: string; model: string };
  onChange: (config: { vendor: string; model: string }) => void;
}) {
  const Icon = level.icon;
  const modelKey = `${config.vendor}:${config.model}`;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border">
      <div className={`${level.color} p-2 rounded-lg`}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium">{level.label}</div>
        <Select
          value={modelKey}
          onValueChange={(value) => {
            const parts = value.split(':');
            const vendor = parts[0] || '';
            const model = parts[1] || '';
            onChange({ vendor, model });
          }}
        >
          <SelectTrigger className="h-8 mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODEL_OPTIONS.map((opt) => (
              <SelectItem key={`${opt.vendor}:${opt.model}`} value={`${opt.vendor}:${opt.model}`}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/**
 * 复杂度路由配置卡片
 */
function ComplexityRoutingConfigCard({
  config,
  isAdmin,
  onEdit,
  onDelete,
  onToggle,
}: {
  config: ComplexityRoutingConfig;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const models = config.models as Record<ComplexityLevel, { vendor: string; model: string }>;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-lg">
              <Brain className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">{config.name}</CardTitle>
              <CardDescription className="text-xs">{config.configId}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {config.isBuiltin && (
              <Badge variant="secondary" className="text-xs">
                内置
              </Badge>
            )}
            {isAdmin && (
              <Switch checked={config.isEnabled} onCheckedChange={onToggle} />
            )}
            {!isAdmin && (
              <Badge variant={config.isEnabled ? 'default' : 'outline'} className="text-xs">
                {config.isEnabled ? '已启用' : '已禁用'}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 描述 */}
        {config.description && (
          <p className="text-sm text-muted-foreground">{config.description}</p>
        )}

        {/* 分类器配置 */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">分类器:</span>
          <Badge variant="outline">
            {config.classifierVendor}/{config.classifierModel}
          </Badge>
        </div>

        {/* 复杂度模型映射 */}
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">复杂度模型映射:</div>
          <div className="grid grid-cols-5 gap-2">
            {COMPLEXITY_LEVELS.map((level) => {
              const Icon = level.icon;
              const modelConfig = models[level.key];
              return (
                <div
                  key={level.key}
                  className="flex flex-col items-center p-2 rounded-lg bg-muted/50"
                >
                  <div className={`${level.color} p-1.5 rounded-lg mb-1`}>
                    <Icon className="h-3 w-3 text-white" />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{level.label}</span>
                  <span className="text-[10px] font-medium truncate max-w-full">
                    {modelConfig?.model?.split('-')[0] || 'N/A'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 工具最低复杂度 */}
        {config.toolMinComplexity && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">工具最低复杂度:</span>
            <Badge variant="outline">{config.toolMinComplexity}</Badge>
          </div>
        )}

        {/* 操作按钮 - 仅管理员可见 */}
        {isAdmin && (
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Pencil className="h-4 w-4 mr-1" />
              编辑
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete} className="text-destructive">
              <Trash2 className="h-4 w-4 mr-1" />
              删除
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * 复杂度路由配置卡片骨架屏
 */
function ComplexityRoutingConfigCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div>
              <Skeleton className="h-4 w-24 mb-1" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
          <Skeleton className="h-5 w-12" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-4 w-full" />
        <div className="grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-24" />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * 创建/编辑配置对话框
 */
function ConfigDialog({
  open,
  onOpenChange,
  config,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: ComplexityRoutingConfig | null;
  onSave: (data: {
    configId: string;
    name: string;
    description?: string;
    isEnabled: boolean;
    models: Record<ComplexityLevel, { vendor: string; model: string }>;
    classifierModel: string;
    classifierVendor: string;
    toolMinComplexity?: ComplexityLevel;
  }) => Promise<void>;
}) {
  const isEdit = !!config;
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    configId: config?.configId || '',
    name: config?.name || '',
    description: config?.description || '',
    isEnabled: config?.isEnabled ?? true,
    models: (config?.models as Record<ComplexityLevel, { vendor: string; model: string }>) || DEFAULT_MODELS,
    classifierModel: config?.classifierModel || 'deepseek-v3-250324',
    classifierVendor: config?.classifierVendor || 'deepseek',
    toolMinComplexity: (config?.toolMinComplexity as ComplexityLevel) || 'medium',
  });

  const handleSubmit = async () => {
    if (!formData.configId || !formData.name) {
      toast.error('请填写配置 ID 和名称');
      return;
    }
    setLoading(true);
    try {
      await onSave(formData);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑复杂度路由配置' : '创建复杂度路由配置'}</DialogTitle>
          <DialogDescription>
            配置不同复杂度等级对应的 AI 模型，实现智能路由
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 基本信息 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="configId">配置 ID</Label>
              <Input
                id="configId"
                value={formData.configId}
                onChange={(e) => setFormData({ ...formData, configId: e.target.value })}
                placeholder="如: default, cost-optimized"
                disabled={isEdit}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">配置名称</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="如: 默认复杂度路由"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">描述</Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="配置描述（可选）"
            />
          </div>

          {/* 分类器配置 */}
          <div className="space-y-2">
            <Label>分类器模型（用于判断消息复杂度）</Label>
            <Select
              value={`${formData.classifierVendor}:${formData.classifierModel}`}
              onValueChange={(value) => {
                const parts = value.split(':');
                const vendor = parts[0] || '';
                const model = parts[1] || '';
                setFormData({ ...formData, classifierVendor: vendor, classifierModel: model });
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODEL_OPTIONS.map((opt) => (
                  <SelectItem key={`${opt.vendor}:${opt.model}`} value={`${opt.vendor}:${opt.model}`}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 复杂度模型映射 */}
          <div className="space-y-2">
            <Label>复杂度模型映射</Label>
            <div className="grid gap-2">
              {COMPLEXITY_LEVELS.map((level) => (
                <ComplexityLevelConfig
                  key={level.key}
                  level={level}
                  config={formData.models[level.key]}
                  onChange={(newConfig) =>
                    setFormData({
                      ...formData,
                      models: { ...formData.models, [level.key]: newConfig },
                    })
                  }
                />
              ))}
            </div>
          </div>

          {/* 工具最低复杂度 */}
          <div className="space-y-2">
            <Label>工具调用最低复杂度</Label>
            <Select
              value={formData.toolMinComplexity}
              onValueChange={(value) =>
                setFormData({ ...formData, toolMinComplexity: value as ComplexityLevel })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMPLEXITY_LEVELS.map((level) => (
                  <SelectItem key={level.key} value={level.key}>
                    {level.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              当请求包含工具调用时，复杂度至少为此等级
            </p>
          </div>

          {/* 启用状态 */}
          <div className="flex items-center justify-between">
            <Label htmlFor="isEnabled">启用配置</Label>
            <Switch
              id="isEnabled"
              checked={formData.isEnabled}
              onCheckedChange={(checked) => setFormData({ ...formData, isEnabled: checked })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? '保存中...' : isEdit ? '保存' : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 复杂度路由配置管理页面
 */
export default function ComplexityRoutingPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ComplexityRoutingConfig | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // 检查用户是否为管理员
  useEffect(() => {
    const user = getUser();
    setIsAdmin(user?.isAdmin ?? false);
  }, []);

  const { data: response, isLoading, refetch } = routingAdminApi.getComplexityRoutingConfigs.useQuery(
    ['complexity-routing-configs'],
    {},
    { staleTime: 60000 } as any
  );

  const configList = response?.body?.data?.list || [];

  // 过滤配置
  const filteredList = configList.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.configId.toLowerCase().includes(search.toLowerCase())
  );

  // 创建配置
  const handleCreate = async (data: Parameters<typeof routingAdminClient.createComplexityRoutingConfig>[0]['body']) => {
    try {
      await routingAdminClient.createComplexityRoutingConfig({ body: data });
      toast.success('配置创建成功');
      refetch();
    } catch {
      toast.error('创建配置失败');
      throw new Error('创建失败');
    }
  };

  // 更新配置
  const handleUpdate = async (id: string, data: Parameters<typeof routingAdminClient.updateComplexityRoutingConfig>[0]['body']) => {
    try {
      await routingAdminClient.updateComplexityRoutingConfig({ params: { id }, body: data });
      toast.success('配置更新成功');
      refetch();
    } catch {
      toast.error('更新配置失败');
      throw new Error('更新失败');
    }
  };

  // 删除配置
  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此配置吗？')) return;
    try {
      await routingAdminClient.deleteComplexityRoutingConfig({ params: { id }, body: {} });
      toast.success('配置已删除');
      refetch();
    } catch {
      toast.error('删除配置失败');
    }
  };

  // 切换启用状态
  const handleToggle = async (config: ComplexityRoutingConfig, enabled: boolean) => {
    try {
      await routingAdminClient.updateComplexityRoutingConfig({
        params: { id: config.id },
        body: { isEnabled: enabled },
      });
      toast.success(enabled ? '配置已启用' : '配置已禁用');
      refetch();
    } catch {
      toast.error('更新状态失败');
    }
  };

  // 保存配置（创建或更新）
  const handleSave = async (data: {
    configId: string;
    name: string;
    description?: string;
    isEnabled: boolean;
    models: Record<ComplexityLevel, { vendor: string; model: string }>;
    classifierModel: string;
    classifierVendor: string;
    toolMinComplexity?: ComplexityLevel;
  }) => {
    if (editingConfig) {
      await handleUpdate(editingConfig.id, data);
    } else {
      await handleCreate(data);
    }
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/routing">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">复杂度路由配置</h1>
            <p className="text-muted-foreground text-sm">
              根据消息复杂度智能选择 AI 模型，优化成本与性能
            </p>
          </div>
        </div>
        {isAdmin && (
          <Button
            onClick={() => {
              setEditingConfig(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            新建配置
          </Button>
        )}
      </div>

      {/* 搜索 */}
      <div className="relative max-w-md">
        <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        <Input
          placeholder="搜索配置名称..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* 配置列表 */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map((i) => (
            <ComplexityRoutingConfigCardSkeleton key={i} />
          ))}
        </div>
      ) : filteredList.length === 0 ? (
        <div className="text-muted-foreground py-12 text-center">
          <Brain className="mx-auto mb-4 h-12 w-12 opacity-50" />
          <p>未找到复杂度路由配置</p>
          {search ? (
            <p className="mt-1 text-sm">尝试其他搜索关键词</p>
          ) : isAdmin ? (
            <p className="mt-1 text-sm">点击"新建配置"创建第一个配置</p>
          ) : (
            <p className="mt-1 text-sm">暂无可用配置</p>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredList.map((config) => (
            <ComplexityRoutingConfigCard
              key={config.id}
              config={config}
              isAdmin={isAdmin}
              onEdit={() => {
                setEditingConfig(config);
                setDialogOpen(true);
              }}
              onDelete={() => handleDelete(config.id)}
              onToggle={(enabled) => handleToggle(config, enabled)}
            />
          ))}
        </div>
      )}

      {/* 创建/编辑对话框 */}
      <ConfigDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        config={editingConfig}
        onSave={handleSave}
      />
    </div>
  );
}
