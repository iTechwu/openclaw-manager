/**
 * OCR Service
 *
 * 职责：通过 AgentX 任务 API 调用 OCR 服务
 * - 使用 agent_x.tasks.ocr.ocr_parse_task 进行单文件 OCR
 * - 使用 agent_x.tasks.ocr.ocr_parse_batch_task 进行批量 OCR
 * - 支持同步等待和回调两种模式
 */
import { Injectable, Inject } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { AgentXClient } from '@app/clients/internal/agentx';
import type { TaskStatusResponse } from '@app/clients/internal/agentx/interfaces/task.interface';

/**
 * OCR 任务请求参数
 */
export interface OcrTaskParams {
  file_url: string;
  mode?: 'basic' | 'advanced' | 'table' | 'handwriting';
  custom_prompt?: string;
  enable_cache?: boolean;
}

/**
 * OCR 批量任务请求参数
 */
export interface OcrBatchTaskParams {
  file_urls: string[];
  mode?: 'basic' | 'advanced' | 'table' | 'handwriting';
  custom_prompt?: string;
  enable_cache?: boolean;
  max_parallel?: number;
}

/**
 * OCR 任务结果
 */
export interface OcrTaskResult {
  raw_text?: string;
  text?: string;
  confidence: number;
  pages?: Array<{
    pageNumber: number;
    text: string;
  }>;
  file_type?: string;
  processing_time?: number;
}

/**
 * OCR 结果（对外接口）
 */
export interface OcrResult {
  text: string;
  confidence: number;
  pages?: Array<{
    pageNumber: number;
    text: string;
  }>;
  fileType?: string;
  processingTime?: number;
}

/** OCR 任务名称 */
const OCR_PARSE_TASK = 'agent_x.tasks.ocr.ocr_parse_task';
const OCR_PARSE_BATCH_TASK = 'agent_x.tasks.ocr.ocr_parse_batch_task';

/**
 * OCR 服务
 *
 * 封装与 Python OCR 服务的交互，通过 AgentX 任务队列执行
 *
 * @example
 * ```typescript
 * // 注入服务
 * @Injectable()
 * class MyService {
 *   constructor(private readonly ocrService: OcrService) {}
 *
 *   async extractText(fileUrl: string) {
 *     const result = await this.ocrService.extractText(fileUrl, 'pdf');
 *     return result.text;
 *   }
 * }
 * ```
 */
@Injectable()
export class OcrService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly agentxClient: AgentXClient,
  ) {}

  /**
   * 提取文件文本内容
   *
   * 流程：
   * 1. 创建 OCR 任务
   * 2. 等待任务完成（使用 SSE 或轮询）
   * 3. 返回提取的文本
   *
   * @param fileUrl 文件 URL (必须是可访问的 URL)
   * @param fileType 文件类型 (pdf, docx, doc, png, jpg, jpeg, etc.)
   * @param options 可选参数
   */
  async extractText(
    fileUrl: string,
    fileType: string,
    options?: {
      mode?: 'basic' | 'advanced' | 'table' | 'handwriting';
      custom_prompt?: string;
      enable_cache?: boolean;
      extractPages?: boolean;
    },
  ): Promise<OcrResult> {
    this.logger.info('创建 OCR 任务', {
      fileUrl: fileUrl.substring(0, 100),
      fileType,
      mode: options?.mode || 'basic',
    });

    try {
      // 1. 构建任务参数
      const taskParams: OcrTaskParams = {
        file_url: fileUrl,
        mode: options?.mode || 'basic',
        enable_cache: options?.enable_cache ?? true,
      };

      if (options?.custom_prompt) {
        taskParams.custom_prompt = options.custom_prompt;
      }

      // 2. 创建 OCR 任务
      const taskId = await this.agentxClient.createTask({
        name: OCR_PARSE_TASK,
        params: taskParams as unknown as Record<string, any>,
      });

      this.logger.info('OCR 任务已创建，等待完成', {
        taskId,
        taskName: OCR_PARSE_TASK,
      });

      // 3. 等待任务完成（使用 AgentX 的 SSE 或轮询）
      const status = await this.agentxClient.monitorTaskWithSSE(taskId);

      // 4. 检查任务结果
      if (status.state !== 'SUCCESS' || !status.result) {
        throw new Error(status.error || 'OCR task failed');
      }

      // AgentX 返回的结果是嵌套结构: status.result.result
      const taskResult = status.result as any;
      const result: OcrTaskResult = taskResult.result || taskResult;

      // 5. 转换结果格式
      const ocrResult: OcrResult = {
        text: result.raw_text || result.text || '',
        confidence: result.confidence || 0,
        fileType: fileType,
        processingTime: result.processing_time,
      };

      if (result.pages && options?.extractPages) {
        ocrResult.pages = result.pages.map((p) => ({
          pageNumber: p.pageNumber,
          text: p.text,
        }));
      }

      this.logger.info('OCR 任务完成', {
        taskId,
        textLength: ocrResult.text.length,
        confidence: ocrResult.confidence,
      });

      return ocrResult;
    } catch (error) {
      this.logger.error('OCR 文本提取失败', {
        fileUrl: fileUrl.substring(0, 100),
        fileType,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error(`OCR extraction failed: ${(error as Error).message}`);
    }
  }

  /**
   * 批量提取文件文本
   *
   * @param files 文件列表
   * @param options 可选参数
   */
  async extractTextBatch(
    files: Array<{ fileUrl: string; fileType: string }>,
    options?: {
      mode?: 'basic' | 'advanced';
      max_parallel?: number;
    },
  ): Promise<Array<OcrResult | { error: string; fileUrl: string }>> {
    this.logger.info('创建批量 OCR 任务', {
      fileCount: files.length,
      mode: options?.mode || 'basic',
    });

    try {
      // 1. 构建批量任务参数
      const taskParams: OcrBatchTaskParams = {
        file_urls: files.map((f) => f.fileUrl),
        mode: options?.mode || 'basic',
        enable_cache: true,
        max_parallel: options?.max_parallel || 3,
      };

      // 2. 创建批量 OCR 任务
      const taskId = await this.agentxClient.createTask({
        name: OCR_PARSE_BATCH_TASK,
        params: taskParams as unknown as Record<string, any>,
      });

      this.logger.info('批量 OCR 任务已创建，等待完成', {
        taskId,
        fileCount: files.length,
      });

      // 3. 等待任务完成
      const status = await this.agentxClient.monitorTaskWithSSE(taskId);

      // 4. 检查任务结果
      if (status.state !== 'SUCCESS' || !status.result) {
        throw new Error(status.error || 'Batch OCR task failed');
      }

      // AgentX 返回的结果是嵌套结构: status.result.result
      const taskResult = status.result as any;
      const rawResults = taskResult.result || taskResult;

      // 批量任务结果是一个数组
      const results: Array<OcrTaskResult | { error: string }> = Array.isArray(
        rawResults,
      )
        ? rawResults
        : [rawResults];

      this.logger.info('批量 OCR 任务完成', {
        taskId,
        resultCount: results.length,
      });

      // 5. 转换结果格式
      return results.map((result, index) => {
        if ('error' in result) {
          return {
            error: result.error,
            fileUrl: files[index].fileUrl,
          };
        }
        return {
          text: result.raw_text || result.text || '',
          confidence: result.confidence || 0,
          fileType: files[index].fileType,
        } as OcrResult;
      });
    } catch (error) {
      this.logger.error('批量 OCR 文本提取失败', {
        fileCount: files.length,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error(
        `OCR batch extraction failed: ${(error as Error).message}`,
      );
    }
  }

  /**
   * 检查 OCR 服务健康状态
   */
  async healthCheck(): Promise<boolean> {
    return this.agentxClient.healthCheck();
  }
}
