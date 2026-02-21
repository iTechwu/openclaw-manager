import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DockerService } from './docker.service';
import { WorkspaceService } from './workspace.service';
import { BotService, BotChannelService } from '@app/db';
import type {
  FeishuPairingListResponse,
  FeishuPairingRequestItem,
  PairingActionResponse,
  FeishuPairingConfig,
  FeishuDmPolicy,
} from '@repo/contracts';

/**
 * OpenClaw pairing.json 中的配对请求格式
 */
interface OpenclawPairingRequest {
  code: string;
  platform: string;
  platformUserId: string;
  createdAt: string;
  expiresAt: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  approvedAt?: string;
  approvedBy?: string;
}

/**
 * OpenClaw pairing.json 格式
 */
interface OpenclawPairingFile {
  requests: OpenclawPairingRequest[];
}

/**
 * FeishuPairingService - 飞书配对管理服务
 *
 * 职责：
 * - 读取和管理 OpenClaw 的 pairing.json 文件
 * - 执行 Docker 命令来批准/拒绝配对请求
 * - 管理飞书通道的配对策略配置
 */
@Injectable()
export class FeishuPairingService {
  /** pairing.json 文件名 */
  private readonly PAIRING_FILE = 'pairing.json';

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly dockerService: DockerService,
    private readonly workspaceService: WorkspaceService,
    private readonly botDb: BotService,
    private readonly botChannelDb: BotChannelService,
  ) {}

  /**
   * 获取配对请求列表
   *
   * @param userId 用户 ID
   * @param hostname Bot hostname
   * @param status 状态过滤（可选）
   */
  async getPairingRequests(
    userId: string,
    hostname: string,
    status?: 'pending' | 'approved' | 'rejected' | 'expired',
  ): Promise<FeishuPairingListResponse> {
    const openclawDir = this.workspaceService.getOpenclawPath(userId, hostname);
    const pairingFile = path.join(openclawDir, this.PAIRING_FILE);

    try {
      const content = await fs.readFile(pairingFile, 'utf-8');
      const data: OpenclawPairingFile = JSON.parse(content);

      let requests = data.requests || [];

      // 过滤只保留飞书平台的请求
      requests = requests.filter((r) => r.platform === 'feishu');

      // 更新过期状态
      const now = new Date();
      requests = requests.map((r) => {
        const expiresAt = new Date(r.expiresAt);
        if (expiresAt < now && r.status === 'pending') {
          return { ...r, status: 'expired' as const };
        }
        return r;
      });

      // 按状态过滤
      if (status) {
        requests = requests.filter((r) => r.status === status);
      }

      // 转换为响应格式
      const items: FeishuPairingRequestItem[] = requests.map((r) => ({
        code: r.code,
        feishuOpenId: r.platformUserId,
        status: r.status,
        createdAt: r.createdAt,
        expiresAt: r.expiresAt,
        approvedAt: r.approvedAt || null,
        approvedBy: r.approvedBy || null,
      }));

      // 按创建时间倒序排列
      items.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      return {
        list: items,
        total: items.length,
      };
    } catch (error) {
      // 文件不存在时返回空列表
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { list: [], total: 0 };
      }
      throw error;
    }
  }

  /**
   * 批准配对请求
   *
   * 通过在 Docker 容器中执行 `openclaw pairing approve feishu <code>` 命令
   *
   * @param userId 用户 ID
   * @param hostname Bot hostname
   * @param code 配对码
   */
  async approvePairingRequest(
    userId: string,
    hostname: string,
    code: string,
  ): Promise<PairingActionResponse> {
    const { containerId, isolationKey } = await this.getBotInfo(userId, hostname);

    if (!containerId) {
      throw new NotFoundException('Bot container not found or not running');
    }

    // 获取配对请求信息
    const pairingRequests = await this.getPairingRequests(userId, hostname, 'pending');
    const request = pairingRequests.list.find((r) => r.code === code);

    if (!request) {
      return {
        success: false,
        message: `Pairing request with code ${code} not found or already processed`,
      };
    }

    try {
      // 在 Docker 容器中执行配对批准命令
      const result = await this.dockerService.execInContainer(
        containerId,
        `openclaw pairing approve feishu ${code}`,
      );

      this.logger.info('[FeishuPairing] Pairing approved', {
        hostname,
        code,
        feishuOpenId: request.feishuOpenId,
        result,
      });

      return {
        success: true,
        message: `Pairing request approved for user ${request.feishuOpenId}`,
        feishuOpenId: request.feishuOpenId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('[FeishuPairing] Failed to approve pairing', {
        hostname,
        code,
        error: errorMessage,
      });

      return {
        success: false,
        message: `Failed to approve pairing: ${errorMessage}`,
      };
    }
  }

  /**
   * 拒绝配对请求
   *
   * @param userId 用户 ID
   * @param hostname Bot hostname
   * @param code 配对码
   */
  async rejectPairingRequest(
    userId: string,
    hostname: string,
    code: string,
  ): Promise<PairingActionResponse> {
    const openclawDir = this.workspaceService.getOpenclawPath(userId, hostname);
    const pairingFile = path.join(openclawDir, this.PAIRING_FILE);

    try {
      const content = await fs.readFile(pairingFile, 'utf-8');
      const data: OpenclawPairingFile = JSON.parse(content);

      // 找到并更新请求状态
      const requestIndex = data.requests.findIndex(
        (r) => r.code === code && r.platform === 'feishu' && r.status === 'pending',
      );

      if (requestIndex === -1) {
        return {
          success: false,
          message: `Pairing request with code ${code} not found or already processed`,
        };
      }

      const request = data.requests[requestIndex];
      data.requests[requestIndex] = {
        ...request,
        status: 'rejected',
      };

      // 写回文件
      await fs.writeFile(pairingFile, JSON.stringify(data, null, 2), 'utf-8');

      this.logger.info('[FeishuPairing] Pairing rejected', {
        hostname,
        code,
        feishuOpenId: request.platformUserId,
      });

      return {
        success: true,
        message: `Pairing request rejected`,
        feishuOpenId: request.platformUserId,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          success: false,
          message: 'No pairing requests found',
        };
      }
      throw error;
    }
  }

  /**
   * 获取飞书配对配置
   *
   * @param userId 用户 ID
   * @param hostname Bot hostname
   */
  async getPairingConfig(
    userId: string,
    hostname: string,
  ): Promise<FeishuPairingConfig> {
    const bot = await this.getBot(userId, hostname);

    // 获取飞书通道配置
    const { list: channels } = await this.botChannelDb.list({
      botId: bot.id,
      channelType: 'feishu',
    });

    if (channels.length === 0) {
      return {
        dmPolicy: 'pairing',
        allowFrom: [],
      };
    }

    // 取第一个飞书通道的配置
    const channel = channels[0];
    const config = (channel.config as Record<string, unknown>) || {};

    return {
      dmPolicy: (config.dmPolicy as FeishuDmPolicy) || 'pairing',
      allowFrom: (config.allowFrom as string[]) || [],
    };
  }

  /**
   * 更新飞书配对配置
   *
   * @param userId 用户 ID
   * @param hostname Bot hostname
   * @param config 配置更新
   */
  async updatePairingConfig(
    userId: string,
    hostname: string,
    config: { dmPolicy?: FeishuDmPolicy; allowFrom?: string[] },
  ): Promise<FeishuPairingConfig> {
    const bot = await this.getBot(userId, hostname);

    // 获取飞书通道配置
    const { list: channels } = await this.botChannelDb.list({
      botId: bot.id,
      channelType: 'feishu',
    });

    if (channels.length === 0) {
      throw new NotFoundException('No Feishu channel configured for this bot');
    }

    // 更新配置
    const channel = channels[0];
    const existingConfig = (channel.config as Record<string, unknown>) || {};
    const newConfig = {
      ...existingConfig,
      ...(config.dmPolicy !== undefined && { dmPolicy: config.dmPolicy }),
      ...(config.allowFrom !== undefined && { allowFrom: config.allowFrom }),
    };

    await this.botChannelDb.update(
      { id: channel.id },
      { config: newConfig },
    );

    this.logger.info('[FeishuPairing] Config updated', {
      hostname,
      channelId: channel.id,
      newConfig,
    });

    // 同步到 channels.json
    await this.workspaceService.writeChannelsConfigFile(
      userId,
      hostname,
      await this.getChannelsConfig(bot.id),
    );

    return {
      dmPolicy: (newConfig.dmPolicy as FeishuDmPolicy) || 'pairing',
      allowFrom: (newConfig.allowFrom as string[]) || [],
    };
  }

  /**
   * 检查是否配置了飞书通道
   */
  async hasFeishuChannel(userId: string, hostname: string): Promise<boolean> {
    const bot = await this.getBot(userId, hostname);
    const { total } = await this.botChannelDb.list({
      botId: bot.id,
      channelType: 'feishu',
    });
    return total > 0;
  }

  /**
   * 获取 Bot 信息
   */
  private async getBot(userId: string, hostname: string) {
    const bot = await this.botDb.get({
      hostname,
      createdById: userId,
    });

    if (!bot) {
      throw new NotFoundException('Bot not found');
    }

    return bot;
  }

  /**
   * 获取 Bot 信息（包含容器 ID）
   */
  private async getBotInfo(userId: string, hostname: string) {
    const bot = await this.getBot(userId, hostname);
    const isolationKey = this.workspaceService.getIsolationKeyForBot(userId, hostname);

    // 获取容器 ID
    const containerName = `clawbot-manager-${isolationKey}`;
    let containerId: string | null = null;

    try {
      const containerIdFromDocker =
        await this.dockerService.getContainerByName(containerName);
      if (containerIdFromDocker) {
        containerId = containerName;
      }
    } catch {
      // 容器不存在
    }

    return { bot, isolationKey, containerId };
  }

  /**
   * 获取通道配置列表
   */
  private async getChannelsConfig(botId: string) {
    const { list: channels } = await this.botChannelDb.list({
      botId,
      channelType: 'feishu',
    });

    return channels.map((channel) => ({
      channelType: channel.channelType,
      accountId: channel.id,
      credentials: {}, // 凭证已单独管理
      config: (channel.config as Record<string, unknown>) || {},
      isEnabled: channel.isEnabled,
    }));
  }
}
