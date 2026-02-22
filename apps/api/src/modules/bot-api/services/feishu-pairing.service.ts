import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DockerService } from './docker.service';
import { WorkspaceService } from './workspace.service';
import { EncryptionService } from './encryption.service';
import { BotService, BotChannelService, FeishuPairingRecordService } from '@app/db';
import { FeishuClientService } from '@app/clients/internal/feishu';
import type { FeishuCredentials, FeishuChannelConfig } from '@app/clients/internal/feishu';
import type {
  FeishuPairingListResponse,
  FeishuPairingRequestItem,
  PairingActionResponse,
  FeishuPairingConfig,
  FeishuDmPolicy,
  FeishuPairingStatus,
} from '@repo/contracts';
import type { FeishuPairingRecord, PairingStatus } from '@prisma/client';

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
 * - 管理飞书用户的配对请求（持久化到数据库）
 * - 与 OpenClaw 的 pairing.json 文件同步（数据库为最高优先级）
 * - 通过飞书 API 获取用户基本信息
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
    private readonly encryptionService: EncryptionService,
    private readonly botDb: BotService,
    private readonly botChannelDb: BotChannelService,
    private readonly pairingRecordDb: FeishuPairingRecordService,
    private readonly feishuClientService: FeishuClientService,
  ) {}

  /**
   * 获取配对请求列表
   *
   * 优先从数据库读取，同时同步文件系统数据到数据库
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
    const bot = await this.getBot(userId, hostname);
    const botChannel = await this.getFeishuChannel(bot.id);

    if (!botChannel) {
      return { list: [], total: 0 };
    }

    // 同步文件系统数据到数据库
    await this.syncFromFileSystem(userId, hostname, bot.id, botChannel.id);

    // 构建查询条件
    const where: Record<string, unknown> = {
      botId: bot.id,
      botChannelId: botChannel.id,
    };

    if (status) {
      where.status = status.toUpperCase() as PairingStatus;
    }

    // 从数据库查询
    const { list, total } = await this.pairingRecordDb.list(where, {
      orderBy: { createdAt: 'desc' },
    });

    // 更新过期状态
    const now = new Date();
    const items: FeishuPairingRequestItem[] = await Promise.all(
      list.map(async (record) => {
        // 将数据库状态转换为小写（用于 API 响应）
        let recordStatus = record.status.toLowerCase() as FeishuPairingStatus;

        // 检查是否过期
        if (record.expiresAt < now && record.status === 'PENDING') {
          recordStatus = 'expired';
          // 更新数据库状态
          await this.pairingRecordDb.update(
            { id: record.id },
            { status: 'EXPIRED' },
          );
        }

        return {
          id: record.id,
          code: record.code,
          feishuOpenId: record.feishuOpenId,
          status: recordStatus,
          createdAt: record.createdAt.toISOString(),
          expiresAt: record.expiresAt.toISOString(),
          approvedAt: record.approvedAt?.toISOString() || null,
          approvedBy: record.approvedById || null,
          // 用户信息
          userName: record.userName,
          userNameEn: record.userNameEn,
          userAvatarUrl: record.userAvatarUrl,
          userEmail: record.userEmail,
          userMobile: record.userMobile,
          userDepartmentName: record.userDepartmentName,
        };
      }),
    );

    return {
      list: items,
      total: items.length,
    };
  }

  /**
   * 批准配对请求
   *
   * 1. 获取飞书用户信息
   * 2. 保存/更新到数据库
   * 3. 同步到 pairing.json 文件
   * 4. 通知 OpenClaw 重新加载配置
   *
   * @param userId 操作用户 ID
   * @param hostname Bot hostname
   * @param code 配对码
   * @param feishuOpenId 飞书用户 Open ID（必需）
   */
  async approvePairingRequest(
    userId: string,
    hostname: string,
    code: string,
    feishuOpenId?: string,
  ): Promise<PairingActionResponse> {
    if (!feishuOpenId) {
      return {
        success: false,
        message:
          'Feishu Open ID is required. Please provide the user\'s Feishu Open ID from the bot\'s response message.',
      };
    }

    const bot = await this.getBot(userId, hostname);
    const botChannel = await this.getFeishuChannel(bot.id);

    if (!botChannel) {
      return {
        success: false,
        message: 'No Feishu channel configured for this bot',
      };
    }

    const now = new Date();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    try {
      // 检查是否已存在配对记录（按配对码查找，不含软删除）
      let existingRecord = await this.pairingRecordDb.get({
        botId: bot.id,
        code,
      });

      // 如果按 code 没找到，检查是否已存在该用户的配对记录（不含软删除）
      // （同一个飞书用户只能有一个配对记录）
      if (!existingRecord) {
        existingRecord = await this.pairingRecordDb.get({
          botId: bot.id,
          feishuOpenId,
        });
      }

      // 如果仍未找到，检查是否存在软删除的记录（用于恢复）
      let softDeletedRecord: FeishuPairingRecord | null = null;
      if (!existingRecord) {
        softDeletedRecord = await this.pairingRecordDb.getIncludingDeleted({
          botId: bot.id,
          feishuOpenId,
          isDeleted: true,
        });
      }

      if (existingRecord) {
        // 已存在记录，检查状态
        if (existingRecord.status !== 'PENDING') {
          // 如果用户已经有批准的记录，直接返回成功（幂等操作）
          if (existingRecord.status === 'APPROVED') {
            return {
              success: true,
              message: `User ${feishuOpenId} is already approved`,
              feishuOpenId,
            };
          }
          return {
            success: false,
            message: `Pairing request with code ${code} is already ${existingRecord.status.toLowerCase()}`,
          };
        }

        // 更新为已批准
        await this.pairingRecordDb.update(
          { id: existingRecord.id },
          {
            status: 'APPROVED',
            approvedAt: now,
            approvedById: userId,
            // 更新配对码（如果是新码）
            ...(existingRecord.code !== code && { code }),
            // 更新飞书 Open ID（如果是新 ID）
            ...(existingRecord.feishuOpenId !== feishuOpenId && {
              feishuOpenId,
            }),
          },
        );

        // 尝试获取用户信息（异步，不阻塞）
        this.fetchAndSaveUserInfo(existingRecord.id, botChannel.id, feishuOpenId).catch(
          (error) => {
            this.logger.warn('[FeishuPairing] Failed to fetch user info', {
              feishuOpenId,
              error: error instanceof Error ? error.message : String(error),
            });
          },
        );

        // 同步到文件系统
        await this.syncToFileSync(userId, hostname);

        // 在 OpenClaw 内部批准配对
        const openclawResult = await this.approvePairingInOpenClaw(userId, hostname, code);
        if (!openclawResult.success) {
          this.logger.warn('[FeishuPairing] OpenClaw approve failed, but database updated', {
            hostname,
            code,
            error: openclawResult.message,
          });
        }

        return {
          success: true,
          message: `Pairing request approved for user ${feishuOpenId}`,
          feishuOpenId,
        };
      }

      // 如果存在软删除的记录，恢复并更新
      if (softDeletedRecord) {
        this.logger.info('[FeishuPairing] Restoring soft-deleted record', {
          recordId: softDeletedRecord.id,
          feishuOpenId,
          oldCode: softDeletedRecord.code,
          newCode: code,
        });

        await this.pairingRecordDb.update(
          { id: softDeletedRecord.id },
          {
            isDeleted: false,
            deletedAt: null,
            code, // 更新为新的配对码
            status: 'APPROVED',
            approvedAt: now,
            approvedById: userId,
            expiresAt, // 更新过期时间
          },
        );

        // 尝试获取用户信息（异步，不阻塞）
        this.fetchAndSaveUserInfo(softDeletedRecord.id, botChannel.id, feishuOpenId).catch(
          (error) => {
            this.logger.warn('[FeishuPairing] Failed to fetch user info', {
              feishuOpenId,
              error: error instanceof Error ? error.message : String(error),
            });
          },
        );

        // 同步到文件系统
        await this.syncToFileSync(userId, hostname);

        // 在 OpenClaw 内部批准配对
        const openclawResult = await this.approvePairingInOpenClaw(userId, hostname, code);
        if (!openclawResult.success) {
          this.logger.warn('[FeishuPairing] OpenClaw approve failed, but database updated', {
            hostname,
            code,
            error: openclawResult.message,
          });
        }

        return {
          success: true,
          message: `Pairing request approved for user ${feishuOpenId} (restored)`,
          feishuOpenId,
        };
      }

      // 创建新的配对记录
      const newRecord = await this.pairingRecordDb.create({
        code,
        feishuOpenId,
        status: 'APPROVED',
        expiresAt,
        approvedAt: now,
        approvedById: userId,
        bot: { connect: { id: bot.id } },
        botChannel: { connect: { id: botChannel.id } },
      });

      // 尝试获取用户信息（异步，不阻塞）
      this.fetchAndSaveUserInfo(newRecord.id, botChannel.id, feishuOpenId).catch(
        (error) => {
          this.logger.warn('[FeishuPairing] Failed to fetch user info', {
            feishuOpenId,
            error: error instanceof Error ? error.message : String(error),
          });
        },
      );

      // 同步到文件系统
      await this.syncToFileSync(userId, hostname);

      // 在 OpenClaw 内部批准配对
      const openclawResult = await this.approvePairingInOpenClaw(userId, hostname, code);
      if (!openclawResult.success) {
        this.logger.warn('[FeishuPairing] OpenClaw approve failed, but database updated', {
          hostname,
          code,
          error: openclawResult.message,
        });
      }

      this.logger.info('[FeishuPairing] Pairing approved', {
        hostname,
        code,
        feishuOpenId,
        recordId: newRecord.id,
      });

      return {
        success: true,
        message: `Pairing request approved for user ${feishuOpenId}`,
        feishuOpenId,
      };
    } catch (error) {
      // 增强错误信息捕获
      let errorMessage: string;
      if (error instanceof Error) {
        errorMessage = error.message || error.constructor.name;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error && typeof error === 'object') {
        errorMessage = JSON.stringify(error);
      } else {
        errorMessage = 'Unknown error';
      }

      this.logger.error('[FeishuPairing] Failed to approve pairing', {
        hostname,
        code,
        feishuOpenId,
        error: errorMessage,
        errorType: error?.constructor?.name,
        stack: error instanceof Error ? error.stack : undefined,
      });

      return {
        success: false,
        message: `Failed to approve pairing: ${errorMessage}`,
      };
    }
  }

  /**
   * 获取并保存飞书用户信息
   */
  private async fetchAndSaveUserInfo(
    recordId: string,
    channelId: string,
    feishuOpenId: string,
  ): Promise<void> {
    try {
      // 获取渠道信息
      const channel = await this.botChannelDb.getById(channelId);
      if (!channel || channel.channelType !== 'feishu') {
        this.logger.warn('[FeishuPairing] Feishu channel not found', {
          channelId,
        });
        return;
      }

      // 解密凭证 - 将 Uint8Array 转换为 Buffer
      const credentialsBuffer = Buffer.from(channel.credentialsEncrypted);
      const decryptedCredentials = this.encryptionService.decrypt(credentialsBuffer);
      const credentials = JSON.parse(decryptedCredentials) as FeishuCredentials;

      // 获取渠道配置
      const config: FeishuChannelConfig =
        (channel.config as Record<string, unknown>) || {};

      // 创建飞书客户端
      const client = this.feishuClientService.createApiClient(credentials, config);

      // 获取用户信息
      const userInfo = await client.getUserInfo(feishuOpenId);

      // 更新数据库记录 - 转换 userInfo 为 JSON 兼容格式
      const userInfoJson = JSON.parse(JSON.stringify(userInfo));

      await this.pairingRecordDb.update(
        { id: recordId },
        {
          userName: userInfo.name,
          userNameEn: userInfo.en_name,
          userAvatarUrl: userInfo.avatar?.avatar_240 || userInfo.avatar?.avatar_72,
          userEmail: userInfo.email,
          userMobile: userInfo.mobile,
          userInfoRaw: userInfoJson,
          lastSyncedAt: new Date(),
        },
      );

      this.logger.info('[FeishuPairing] User info fetched and saved', {
        recordId,
        feishuOpenId,
        userName: userInfo.name,
      });
    } catch (error) {
      this.logger.error('[FeishuPairing] Failed to fetch user info', {
        recordId,
        feishuOpenId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
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
    const bot = await this.getBot(userId, hostname);
    const botChannel = await this.getFeishuChannel(bot.id);

    if (!botChannel) {
      return {
        success: false,
        message: 'No Feishu channel configured for this bot',
      };
    }

    // 查找配对记录
    const record = await this.pairingRecordDb.get({
      botId: bot.id,
      code,
      status: 'PENDING',
    });

    if (!record) {
      return {
        success: false,
        message: `Pending pairing request with code ${code} not found`,
      };
    }

    // 更新状态为已拒绝
    await this.pairingRecordDb.update(
      { id: record.id },
      {
        status: 'REJECTED',
        rejectedAt: new Date(),
        rejectedById: userId,
      },
    );

    // 同步到文件系统
    await this.syncToFileSync(userId, hostname);

    this.logger.info('[FeishuPairing] Pairing rejected', {
      hostname,
      code,
      feishuOpenId: record.feishuOpenId,
    });

    return {
      success: true,
      message: 'Pairing request rejected',
      feishuOpenId: record.feishuOpenId,
    };
  }

  /**
   * 删除配对记录
   *
   * 用于清理已处理的配对请求（已批准、已拒绝、已过期）
   * 同时从数据库和 OpenClaw 的 pairing.json 文件中删除
   *
   * @param userId 用户 ID
   * @param hostname Bot hostname
   * @param code 配对码
   */
  async deletePairingRecord(
    userId: string,
    hostname: string,
    code: string,
  ): Promise<PairingActionResponse> {
    const bot = await this.getBot(userId, hostname);

    // 查找配对记录
    const record = await this.pairingRecordDb.get({
      botId: bot.id,
      code,
    });

    if (!record) {
      return {
        success: false,
        message: `Pairing record with code ${code} not found`,
      };
    }

    // 软删除数据库记录
    await this.pairingRecordDb.update(
      { id: record.id },
      {
        isDeleted: true,
        deletedAt: new Date(),
      },
    );

    // 同步到文件系统（已删除的记录不会写入）
    await this.syncToFileSync(userId, hostname);

    this.logger.info('[FeishuPairing] Pairing record deleted', {
      hostname,
      code,
      feishuOpenId: record.feishuOpenId,
    });

    return {
      success: true,
      message: `Pairing record ${code} deleted`,
      feishuOpenId: record.feishuOpenId,
    };
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
      };
    }

    // 取第一个飞书通道的配置
    const channel = channels[0];
    const config = (channel.config as Record<string, unknown>) || {};

    return {
      dmPolicy: (config.dmPolicy as FeishuDmPolicy) || 'pairing',
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
    config: { dmPolicy?: FeishuDmPolicy },
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
   * 从文件系统同步数据到数据库
   *
   * 读取 pairing.json，将文件系统中的数据与数据库对比：
   * - 如果数据库中不存在，则创建新记录
   * - 如果数据库中存在但状态不同，以数据库为准
   * - 如果文件系统中有新请求，添加到数据库
   */
  private async syncFromFileSystem(
    userId: string,
    hostname: string,
    botId: string,
    botChannelId: string,
  ): Promise<void> {
    const openclawDir = this.workspaceService.getOpenclawPath(userId, hostname);
    const pairingFile = path.join(openclawDir, this.PAIRING_FILE);

    try {
      const content = await fs.readFile(pairingFile, 'utf-8');
      const data: OpenclawPairingFile = JSON.parse(content);

      // 获取数据库中所有配对记录
      const { list: dbRecords } = await this.pairingRecordDb.list({
        botId,
        botChannelId,
      });

      const dbRecordByCode = new Map(dbRecords.map((r) => [r.code, r]));

      // 遍历文件系统中的请求
      for (const fileRequest of data.requests || []) {
        // 只处理飞书平台的请求
        if (fileRequest.platform !== 'feishu') continue;

        const dbRecord = dbRecordByCode.get(fileRequest.code);

        if (!dbRecord) {
          // 数据库中不存在，从文件系统创建
          const now = new Date();
          await this.pairingRecordDb.create({
            code: fileRequest.code,
            feishuOpenId: fileRequest.platformUserId,
            status: fileRequest.status.toUpperCase() as PairingStatus,
            expiresAt: new Date(fileRequest.expiresAt),
            approvedAt: fileRequest.approvedAt ? new Date(fileRequest.approvedAt) : undefined,
            approvedById: fileRequest.approvedBy,
            bot: { connect: { id: botId } },
            botChannel: { connect: { id: botChannelId } },
          });

          this.logger.info('[FeishuPairing] Synced from file system', {
            code: fileRequest.code,
            status: fileRequest.status,
          });
        }
        // 如果数据库中存在，以数据库为准，不更新
      }
    } catch (error) {
      // 文件不存在时忽略
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn('[FeishuPairing] Failed to sync from file system', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * 同步数据库数据到文件系统
   *
   * 将数据库中的所有配对记录写入 pairing.json
   */
  private async syncToFileSync(
    userId: string,
    hostname: string,
  ): Promise<void> {
    const bot = await this.getBot(userId, hostname);
    const botChannel = await this.getFeishuChannel(bot.id);

    if (!botChannel) return;

    // 获取数据库中所有配对记录
    const { list: dbRecords } = await this.pairingRecordDb.list({
      botId: bot.id,
      botChannelId: botChannel.id,
    });

    // 读取现有文件（保留非飞书平台的请求）
    const openclawDir = this.workspaceService.getOpenclawPath(userId, hostname);
    const pairingFile = path.join(openclawDir, this.PAIRING_FILE);

    let existingData: OpenclawPairingFile = { requests: [] };
    try {
      const content = await fs.readFile(pairingFile, 'utf-8');
      existingData = JSON.parse(content);
    } catch {
      // 文件不存在，创建新的
    }

    // 保留非飞书平台的请求
    const nonFeishuRequests = existingData.requests.filter(
      (r) => r.platform !== 'feishu',
    );

    // 转换数据库记录为文件格式
    const feishuRequests: OpenclawPairingRequest[] = dbRecords.map((record) => ({
      code: record.code,
      platform: 'feishu',
      platformUserId: record.feishuOpenId,
      createdAt: record.createdAt.toISOString(),
      expiresAt: record.expiresAt.toISOString(),
      status: record.status.toLowerCase() as 'pending' | 'approved' | 'rejected' | 'expired',
      approvedAt: record.approvedAt?.toISOString(),
      approvedBy: record.approvedById,
    }));

    // 合并并写入文件
    const newData: OpenclawPairingFile = {
      requests: [...nonFeishuRequests, ...feishuRequests],
    };

    await fs.writeFile(pairingFile, JSON.stringify(newData, null, 2), 'utf-8');

    this.logger.debug('[FeishuPairing] Synced to file system', {
      hostname,
      totalRecords: feishuRequests.length,
    });
  }

  /**
   * 在 OpenClaw 容器内批准配对请求
   * OpenClaw 有自己的内部配对管理系统，需要执行 approve 命令才能真正生效
   */
  private async approvePairingInOpenClaw(
    userId: string,
    hostname: string,
    code: string,
  ): Promise<{ success: boolean; message: string }> {
    const { containerId } = await this.getBotInfo(userId, hostname);

    if (!containerId) {
      return {
        success: false,
        message: 'Container not running',
      };
    }

    try {
      // 在 OpenClaw 容器内执行 pairing approve 命令
      const result = await this.dockerService.execInContainer(
        containerId,
        `node /app/openclaw.mjs pairing approve feishu ${code} 2>&1`,
      );

      this.logger.info('[FeishuPairing] OpenClaw pairing approve result', {
        hostname,
        code,
        result: result.trim(),
      });

      // 检查是否成功
      if (result.includes('Approved') || result.includes('approved')) {
        return { success: true, message: result.trim() };
      }

      return { success: false, message: result.trim() || 'Unknown result' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('[FeishuPairing] Failed to approve in OpenClaw', {
        hostname,
        code,
        error: errorMessage,
      });
      return { success: false, message: errorMessage };
    }
  }

  /**
   * 通知 OpenClaw 进程重新加载配对配置
   */
  private async notifyPairingReload(userId: string, hostname: string): Promise<void> {
    const { containerId } = await this.getBotInfo(userId, hostname);

    if (!containerId) {
      this.logger.debug('[FeishuPairing] Container not running, skipping reload notification');
      return;
    }

    try {
      // 发送 SIGUSR1 信号让 OpenClaw 重新加载配置
      const result = await this.dockerService.execInContainer(
        containerId,
        'pkill -USR1 -f openclaw || true',
      );

      this.logger.debug('[FeishuPairing] Sent reload signal to OpenClaw process', {
        hostname,
        result: result.trim() || 'no output',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('[FeishuPairing] Failed to send reload signal', {
        hostname,
        error: errorMessage,
      });
    }
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
   * 获取飞书通道
   */
  private async getFeishuChannel(botId: string) {
    const { list: channels } = await this.botChannelDb.list({
      botId,
      channelType: 'feishu',
    });
    return channels[0] || null;
  }

  /**
   * 获取 Bot 信息（包含容器 ID）
   */
  private async getBotInfo(userId: string, hostname: string) {
    const bot = await this.getBot(userId, hostname);
    const isolationKey = this.workspaceService.getIsolationKeyForBot(userId, hostname);

    const containerName = `clawbot-manager-${isolationKey}`;
    let containerId: string | null = null;

    try {
      const containerInfo = await this.dockerService.getContainerInfo(containerName);
      if (containerInfo?.running) {
        containerId = containerName;
      }
    } catch {
      // 容器不存在或未运行
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
      credentials: {},
      config: (channel.config as Record<string, unknown>) || {},
      isEnabled: channel.isEnabled,
    }));
  }
}
