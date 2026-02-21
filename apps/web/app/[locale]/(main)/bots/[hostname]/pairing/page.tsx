'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { feishuPairingClient } from '@/lib/api/contracts/client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Skeleton,
  Badge,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  EmptyState,
} from '@repo/ui';
import {
  Check,
  X,
  Loader2,
  RefreshCw,
  UserCheck,
  Clock,
  AlertCircle,
  Settings,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@repo/ui/lib/utils';
import type {
  FeishuPairingRequestItem,
  FeishuPairingConfig,
} from '@repo/contracts';

type PairingStatus = 'pending' | 'approved' | 'rejected' | 'expired';

/**
 * 配对请求状态徽章
 */
function StatusBadge({ status }: { status: PairingStatus }) {
  const config = {
    pending: { label: '待批准', variant: 'secondary' as const, icon: Clock },
    approved: { label: '已批准', variant: 'default' as const, icon: Check },
    rejected: { label: '已拒绝', variant: 'destructive' as const, icon: X },
    expired: { label: '已过期', variant: 'outline' as const, icon: AlertCircle },
  };

  const { label, variant, icon: Icon } = config[status];

  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="size-3" />
      {label}
    </Badge>
  );
}

/**
 * 飞书配对管理页面
 */
export default function FeishuPairingPage() {
  const params = useParams<{ hostname: string }>();
  const hostname = params.hostname;
  const t = useTranslations('bots.detail.pairing');

  // 状态
  const [isLoading, setIsLoading] = useState(true);
  const [requests, setRequests] = useState<FeishuPairingRequestItem[]>([]);
  const [config, setConfig] = useState<FeishuPairingConfig | null>(null);
  const [statusFilter, setStatusFilter] = useState<PairingStatus | 'all'>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // 加载配对请求
  const loadPairingRequests = async () => {
    setIsLoading(true);
    try {
      const res = await feishuPairingClient.list({
        params: { hostname },
        query: statusFilter === 'all' ? {} : { status: statusFilter },
      });

      if (res.status === 200 && res.body.data) {
        setRequests(res.body.data.list);
      }
    } catch (error) {
      console.error('Failed to load pairing requests:', error);
      toast.error('加载配对请求失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 加载配对配置
  const loadPairingConfig = async () => {
    try {
      const res = await feishuPairingClient.getConfig({
        params: { hostname },
      });

      if (res.status === 200 && res.body.data) {
        setConfig(res.body.data);
      }
    } catch (error) {
      console.error('Failed to load pairing config:', error);
    }
  };

  // 初始加载
  useEffect(() => {
    loadPairingRequests();
    loadPairingConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostname, statusFilter]);

  // 批准配对请求
  const handleApprove = async (code: string) => {
    setActionLoading(code);
    try {
      const res = await feishuPairingClient.approve({
        params: { hostname },
        body: { code },
      });

      if (res.status === 200 && res.body.data?.success) {
        toast.success(res.body.data.message || '配对请求已批准');
        loadPairingRequests();
      } else {
        toast.error(res.body.data?.message || '批准失败');
      }
    } catch (error) {
      console.error('Failed to approve pairing:', error);
      toast.error('批准配对请求失败');
    } finally {
      setActionLoading(null);
    }
  };

  // 拒绝配对请求
  const handleReject = async (code: string) => {
    setActionLoading(code);
    try {
      const res = await feishuPairingClient.reject({
        params: { hostname },
        body: { code },
      });

      if (res.status === 200 && res.body.data?.success) {
        toast.success(res.body.data.message || '配对请求已拒绝');
        loadPairingRequests();
      } else {
        toast.error(res.body.data?.message || '拒绝失败');
      }
    } catch (error) {
      console.error('Failed to reject pairing:', error);
      toast.error('拒绝配对请求失败');
    } finally {
      setActionLoading(null);
    }
  };

  // 更新配对策略
  const handleUpdatePolicy = async (dmPolicy: string) => {
    try {
      const res = await feishuPairingClient.updateConfig({
        params: { hostname },
        body: { dmPolicy: dmPolicy as FeishuPairingConfig['dmPolicy'] },
      });

      if (res.status === 200 && res.body.data) {
        setConfig(res.body.data);
        toast.success('配对策略已更新');
      }
    } catch (error) {
      console.error('Failed to update policy:', error);
      toast.error('更新配对策略失败');
    }
  };

  // 格式化时间
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 计算剩余时间
  const getRemainingTime = (expiresAt: string) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();

    if (diff <= 0) return '已过期';
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return '即将过期';
    return `${minutes} 分钟`;
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserCheck className="size-6" />
            {t('title')}
          </h1>
          <p className="text-muted-foreground mt-1">{t('description')}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => loadPairingRequests()}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          刷新
        </Button>
      </div>

      {/* 配对策略配置 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="size-5" />
            {t('config.title')}
          </CardTitle>
          <CardDescription>{t('config.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium">
                {t('config.dmPolicy')}
              </label>
              <p className="text-xs text-muted-foreground mt-1">
                {t('config.dmPolicyHint')}
              </p>
            </div>
            <Select
              value={config?.dmPolicy || 'pairing'}
              onValueChange={handleUpdatePolicy}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pairing">{t('policy.pairing')}</SelectItem>
                <SelectItem value="open">{t('policy.open')}</SelectItem>
                <SelectItem value="allowlist">{t('policy.allowlist')}</SelectItem>
                <SelectItem value="disabled">{t('policy.disabled')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 配对请求列表 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t('requests.title')}</CardTitle>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as PairingStatus | 'all')}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('filter.all')}</SelectItem>
                <SelectItem value="pending">{t('filter.pending')}</SelectItem>
                <SelectItem value="approved">{t('filter.approved')}</SelectItem>
                <SelectItem value="rejected">{t('filter.rejected')}</SelectItem>
                <SelectItem value="expired">{t('filter.expired')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-12 flex-1" />
                </div>
              ))}
            </div>
          ) : requests.length === 0 ? (
            <EmptyState
              icon={UserCheck}
              title={t('requests.empty')}
              description={t('requests.emptyHint')}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('table.code')}</TableHead>
                  <TableHead>{t('table.userId')}</TableHead>
                  <TableHead>{t('table.status')}</TableHead>
                  <TableHead>{t('table.createdAt')}</TableHead>
                  <TableHead>{t('table.expiresIn')}</TableHead>
                  <TableHead className="text-right">
                    {t('table.actions')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((request) => (
                  <TableRow key={request.code}>
                    <TableCell className="font-mono font-medium">
                      {request.code}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground max-w-[200px] truncate">
                      {request.feishuOpenId}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={request.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatTime(request.createdAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {request.status === 'pending'
                        ? getRemainingTime(request.expiresAt)
                        : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {request.status === 'pending' && (
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleApprove(request.code)}
                            disabled={actionLoading === request.code}
                          >
                            {actionLoading === request.code ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Check className="size-4" />
                            )}
                            {t('actions.approve')}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleReject(request.code)}
                            disabled={actionLoading === request.code}
                          >
                            {actionLoading === request.code ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <X className="size-4" />
                            )}
                            {t('actions.reject')}
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
