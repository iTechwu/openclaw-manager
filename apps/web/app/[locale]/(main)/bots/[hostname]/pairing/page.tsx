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
  Input,
  Label,
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
  Key,
  User,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
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

  // 手动输入配对码
  const [manualCode, setManualCode] = useState('');
  const [manualFeishuOpenId, setManualFeishuOpenId] = useState('');
  const [manualLoading, setManualLoading] = useState(false);

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

  // 手动输入配对码批准
  const handleManualApprove = async () => {
    const code = manualCode.trim().toUpperCase();
    const feishuOpenId = manualFeishuOpenId.trim();

    if (!code) {
      toast.error('请输入配对码');
      return;
    }

    if (!feishuOpenId) {
      toast.error('请输入飞书用户 ID');
      return;
    }

    setManualLoading(true);
    try {
      const res = await feishuPairingClient.approve({
        params: { hostname },
        body: { code, feishuOpenId },
      });

      if (res.status === 200 && res.body.data?.success) {
        toast.success(res.body.data.message || '配对请求已批准');
        setManualCode('');
        setManualFeishuOpenId('');
        loadPairingRequests();
      } else {
        toast.error(res.body.data?.message || '批准失败');
      }
    } catch (error) {
      console.error('Failed to approve pairing:', error);
      toast.error('批准配对请求失败');
    } finally {
      setManualLoading(false);
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

  // 删除配对记录
  const handleDelete = async (code: string) => {
    if (!confirm(t('confirmDelete'))) return;

    setActionLoading(code);
    try {
      const res = await feishuPairingClient.delete({
        params: { hostname, code },
      });

      if (res.status === 200 && res.body.data?.success) {
        toast.success(res.body.data.message || '配对记录已删除');
        loadPairingRequests();
      } else {
        toast.error(res.body.data?.message || '删除失败');
      }
    } catch (error) {
      console.error('Failed to delete pairing:', error);
      toast.error('删除配对记录失败');
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

      {/* 手动批准配对 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="size-5" />
            {t('manual.title')}
          </CardTitle>
          <CardDescription>{t('manual.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="pairing-code">{t('manual.codeLabel')}</Label>
              <Input
                id="pairing-code"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                placeholder={t('manual.codePlaceholder')}
                className="mt-1.5 font-mono text-lg tracking-widest"
                maxLength={8}
              />
            </div>
            <div>
              <Label htmlFor="feishu-open-id">{t('manual.feishuOpenIdLabel')}</Label>
              <Input
                id="feishu-open-id"
                value={manualFeishuOpenId}
                onChange={(e) => setManualFeishuOpenId(e.target.value)}
                placeholder={t('manual.feishuOpenIdPlaceholder')}
                className="mt-1.5 font-mono text-sm"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button
              onClick={handleManualApprove}
              disabled={manualLoading || !manualCode.trim() || !manualFeishuOpenId.trim()}
            >
              {manualLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              {t('manual.approve')}
            </Button>
            <p className="text-xs text-muted-foreground flex-1">
              {t('manual.hint')}
            </p>
          </div>
        </CardContent>
      </Card>

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
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pairing">{t('policy.pairing')}</SelectItem>
                <SelectItem value="open">{t('policy.open')}</SelectItem>
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
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="size-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <UserCheck className="size-6 text-muted-foreground" />
              </div>
              <h3 className="font-medium text-lg">{t('requests.empty')}</h3>
              <p className="text-muted-foreground text-sm mt-1">
                {t('requests.emptyHint')}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('table.code')}</TableHead>
                  <TableHead>{t('table.userInfo')}</TableHead>
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
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {request.userAvatarUrl ? (
                          <img
                            src={request.userAvatarUrl}
                            alt={request.userName || 'User'}
                            className="size-8 rounded-full"
                          />
                        ) : (
                          <div className="size-8 rounded-full bg-muted flex items-center justify-center">
                            <User className="size-4 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0">
                          {request.userName ? (
                            <>
                              <div className="font-medium truncate">
                                {request.userName}
                              </div>
                              <div className="text-xs text-muted-foreground font-mono truncate max-w-[180px]">
                                {request.feishuOpenId}
                              </div>
                            </>
                          ) : (
                            <div className="font-mono text-xs text-muted-foreground truncate max-w-[200px]">
                              {request.feishuOpenId}
                            </div>
                          )}
                        </div>
                      </div>
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
                      {request.status === 'pending' ? (
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
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(request.code)}
                          disabled={actionLoading === request.code}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          {actionLoading === request.code ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                          {t('actions.delete')}
                        </Button>
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
