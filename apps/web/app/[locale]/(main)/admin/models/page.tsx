'use client';

import {
  useModelSyncStatus,
  useModelSync,
  useModelAvailability,
} from '@/hooks/useModels';
import { useProviderKeys } from '@/hooks/useProviderKeys';
import { AdminOnly } from '@/lib/permissions';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Button,
  Badge,
  Skeleton,
  Progress,
} from '@repo/ui';
import {
  Cpu,
  RefreshCw,
  DollarSign,
  Tag,
  CheckCircle,
  XCircle,
  Clock,
  Activity,
  GitBranch,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { ModelSyncOverview } from './components/model-sync-overview';
import { ModelAvailabilityTable } from './components/model-availability-table';

export default function AdminModelsPage() {
  return (
    <AdminOnly fallback={<UnauthorizedMessage />}>
      <div className="flex h-full flex-col p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">模型管理</h1>
          <p className="text-muted-foreground text-sm">
            统一管理模型可用性、定价、能力标签和路由配置
          </p>
        </div>

        <Tabs defaultValue="overview" className="flex-1">
          <TabsList className="mb-4">
            <TabsTrigger value="overview" className="gap-1.5">
              <Activity className="size-4" />
              概览
            </TabsTrigger>
            <TabsTrigger value="availability" className="gap-1.5">
              <Cpu className="size-4" />
              模型可用性
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-0">
            <ModelSyncOverview />
          </TabsContent>

          <TabsContent value="availability" className="mt-0">
            <ModelAvailabilityTable />
          </TabsContent>
        </Tabs>
      </div>
    </AdminOnly>
  );
}

function UnauthorizedMessage() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="max-w-md text-center">
        <CardContent className="pt-6">
          <XCircle className="text-destructive mx-auto mb-4 size-16" />
          <h2 className="mb-2 text-xl font-semibold">无权访问</h2>
          <p className="text-muted-foreground">此页面仅限管理员访问</p>
        </CardContent>
      </Card>
    </div>
  );
}
