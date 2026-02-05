import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BotService } from '@app/db';
import { DockerService } from './docker.service';
import { WorkspaceService } from './workspace.service';
import type { BotStatus } from '@prisma/client';

/**
 * Reconciliation Report - 协调报告
 * 记录启动时的协调结果
 */
export interface ReconciliationReport {
  botsChecked: number;
  statusUpdated: number;
  orphanedContainers: string[];
  orphanedWorkspaces: string[];
  orphanedSecrets: string[];
}

/**
 * Cleanup Report - 清理报告
 * 记录清理操作的结果
 */
export interface CleanupReport {
  containersRemoved: number;
  workspacesRemoved: number;
  secretsRemoved: number;
}

/**
 * ReconciliationService - 协调服务
 *
 * 在应用启动时同步数据库状态与 Docker 容器状态。
 * 检测孤儿资源（容器、工作空间、密钥）并提供清理功能。
 *
 * 主要功能：
 * 1. 启动时协调 - 同步 DB 中的 Bot 状态与实际容器状态
 * 2. 孤儿检测 - 发现没有对应数据库记录的容器/工作空间/密钥
 * 3. 清理功能 - 移除孤儿资源
 */
@Injectable()
export class ReconciliationService implements OnModuleInit {
  private readonly logger = new Logger(ReconciliationService.name);
  private readonly enableStartupReconciliation: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly botService: BotService,
    private readonly dockerService: DockerService,
    private readonly workspaceService: WorkspaceService,
  ) {
    this.enableStartupReconciliation = this.configService.get<boolean>(
      'ENABLE_STARTUP_RECONCILIATION',
      true,
    );
  }

  /**
   * 生成用户隔离的唯一标识符（与 WorkspaceService 保持一致）
   */
  private getIsolationKey(userId: string, hostname: string): string {
    return `${userId.slice(0, 8)}-${hostname}`;
  }

  /**
   * 模块初始化时执行启动协调
   */
  async onModuleInit(): Promise<void> {
    if (!this.enableStartupReconciliation) {
      this.logger.log('Startup reconciliation disabled');
      return;
    }

    try {
      const report = await this.reconcileOnStartup();
      this.logger.log('Startup reconciliation complete', {
        botsChecked: report.botsChecked,
        statusUpdated: report.statusUpdated,
        orphanedContainers: report.orphanedContainers.length,
        orphanedWorkspaces: report.orphanedWorkspaces.length,
        orphanedSecrets: report.orphanedSecrets.length,
      });
    } catch (error) {
      this.logger.error('Startup reconciliation failed', error);
    }
  }

  /**
   * 执行启动时协调
   * 同步 DB 状态与实际容器状态，检测孤儿资源
   */
  async reconcileOnStartup(): Promise<ReconciliationReport> {
    const report: ReconciliationReport = {
      botsChecked: 0,
      statusUpdated: 0,
      orphanedContainers: [],
      orphanedWorkspaces: [],
      orphanedSecrets: [],
    };

    // 获取所有 Bot（不分用户，系统级协调）
    const { list: bots, total } = await this.botService.list(
      { isDeleted: false },
      { limit: 10000 },
    );
    report.botsChecked = total;

    // 使用 isolation keys 进行多租户隔离
    const botIsolationKeys = new Set(
      bots.map((b) => this.getIsolationKey(b.createdById, b.hostname)),
    );
    const botContainerIds = new Set(
      bots.map((b) => b.containerId).filter((id): id is string => id !== null),
    );

    // 检查 Docker 是否可用
    if (!this.dockerService.isAvailable()) {
      this.logger.warn(
        'Docker not available, skipping container reconciliation',
      );
      return report;
    }

    // 获取所有托管容器
    const managedContainers = await this.getManagedContainers();
    const containerIsolationKeys = new Set(
      managedContainers.map((c) => c.isolationKey),
    );

    // 同步每个 Bot 的状态
    for (const bot of bots) {
      const isolationKey = this.getIsolationKey(bot.createdById, bot.hostname);
      const hasContainer = containerIsolationKeys.has(isolationKey);
      const updated = await this.syncBotStatus(bot, hasContainer);
      if (updated) {
        report.statusUpdated++;
      }
    }

    // 检测孤儿容器（在 Docker 中但不在 DB 中）
    for (const container of managedContainers) {
      if (container.isolationKey && !botIsolationKeys.has(container.isolationKey)) {
        report.orphanedContainers.push(container.isolationKey);
        this.logger.warn(`Orphaned container detected: ${container.isolationKey}`);
      }
    }

    // 检测孤儿工作空间（使用 isolation keys）
    const workspaceIsolationKeys =
      await this.workspaceService.listWorkspaceIsolationKeys();
    for (const isolationKey of workspaceIsolationKeys) {
      if (!botIsolationKeys.has(isolationKey)) {
        report.orphanedWorkspaces.push(isolationKey);
        this.logger.warn(`Orphaned workspace detected: ${isolationKey}`);
      }
    }

    // 检测孤儿密钥目录（使用 isolation keys）
    const secretIsolationKeys = await this.workspaceService.listSecretIsolationKeys();
    for (const isolationKey of secretIsolationKeys) {
      if (!botIsolationKeys.has(isolationKey)) {
        report.orphanedSecrets.push(isolationKey);
        this.logger.warn(`Orphaned secrets detected: ${isolationKey}`);
      }
    }

    return report;
  }

  /**
   * 清理孤儿资源
   * 移除没有对应数据库记录的容器、工作空间和密钥
   */
  async cleanupOrphans(): Promise<CleanupReport> {
    const reconciliation = await this.reconcileOnStartup();
    const report: CleanupReport = {
      containersRemoved: 0,
      workspacesRemoved: 0,
      secretsRemoved: 0,
    };

    // 移除孤儿容器（使用 isolation key 作为容器名后缀）
    for (const isolationKey of reconciliation.orphanedContainers) {
      try {
        const containerName = `clawbot-manager-${isolationKey}`;
        await this.dockerService.removeContainer(containerName);
        report.containersRemoved++;
        this.logger.log(`Removed orphaned container: ${isolationKey}`);
      } catch (error) {
        this.logger.warn(
          `Failed to remove orphaned container ${isolationKey}:`,
          error,
        );
      }
    }

    // 移除孤儿工作空间（使用 isolation key）
    for (const isolationKey of reconciliation.orphanedWorkspaces) {
      try {
        await this.workspaceService.deleteWorkspaceByKey(isolationKey);
        report.workspacesRemoved++;
        this.logger.log(`Removed orphaned workspace: ${isolationKey}`);
      } catch (error) {
        this.logger.warn(
          `Failed to remove orphaned workspace ${isolationKey}:`,
          error,
        );
      }
    }

    // 移除孤儿密钥（使用 isolation key）
    for (const isolationKey of reconciliation.orphanedSecrets) {
      try {
        await this.workspaceService.deleteSecretsByKey(isolationKey);
        report.secretsRemoved++;
        this.logger.log(`Removed orphaned secrets: ${isolationKey}`);
      } catch (error) {
        this.logger.warn(
          `Failed to remove orphaned secrets ${isolationKey}:`,
          error,
        );
      }
    }

    return report;
  }

  /**
   * 同步单个 Bot 的状态
   * 根据容器实际状态更新数据库中的状态
   *
   * @param bot - Bot 记录
   * @param hasContainer - 是否存在对应容器
   * @returns 是否更新了状态
   */
  private async syncBotStatus(
    bot: {
      id: string;
      hostname: string;
      containerId: string | null;
      status: BotStatus;
    },
    hasContainer: boolean,
  ): Promise<boolean> {
    if (!hasContainer) {
      // 没有容器存在
      if (bot.status === 'running') {
        await this.botService.update(
          { id: bot.id },
          { status: 'stopped', containerId: null },
        );
        this.logger.log(`Bot ${bot.hostname} marked stopped (no container)`);
        return true;
      }
      if (bot.containerId) {
        await this.botService.update({ id: bot.id }, { containerId: null });
        return true;
      }
      return false;
    }

    // 容器存在 - 检查实际状态
    const containerStatus = bot.containerId
      ? await this.dockerService.getContainerStatus(bot.containerId)
      : null;

    if (!containerStatus) {
      // 容器在列表和检查之间消失了
      if (bot.status === 'running') {
        await this.botService.update(
          { id: bot.id },
          { status: 'stopped', containerId: null },
        );
        return true;
      }
      return false;
    }

    // 根据容器状态同步
    if (containerStatus.running && bot.status !== 'running') {
      await this.botService.update({ id: bot.id }, { status: 'running' });
      this.logger.log(`Bot ${bot.hostname} marked running`);
      return true;
    }

    if (!containerStatus.running && bot.status === 'running') {
      // 容器已停止或退出
      const newStatus: BotStatus =
        containerStatus.exitCode !== 0 ? 'error' : 'stopped';
      await this.botService.update({ id: bot.id }, { status: newStatus });
      this.logger.log(`Bot ${bot.hostname} status synced: ${newStatus}`);
      return true;
    }

    return false;
  }

  /**
   * 获取所有托管容器
   */
  private async getManagedContainers(): Promise<
    { id: string; hostname: string; isolationKey: string }[]
  > {
    try {
      // 使用 DockerService 的方法获取托管容器及其 isolation keys
      return await this.dockerService.listManagedContainersWithIsolationKeys();
    } catch (error) {
      this.logger.warn('Failed to list managed containers:', error);
      return [];
    }
  }
}
