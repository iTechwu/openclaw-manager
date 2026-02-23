/**
 * @fileoverview OCR 服务模块
 *
 * 本模块提供 OCR 文本提取服务的 NestJS 模块配置
 *
 * @module ocr/module
 */

import { Module } from '@nestjs/common';
import { AgentXClientModule } from '@app/clients/internal/agentx';
import { OcrService } from './ocr.service';

/**
 * OCR 服务模块
 *
 * @description 提供文件 OCR 文本提取服务的依赖注入配置。
 *
 * 导出服务：
 * - `OcrService`: OCR 文本提取服务
 *
 * 依赖模块：
 * - `AgentXClientModule`: AgentX 任务客户端模块
 *
 * @example
 * ```typescript
 * // 在其他模块中导入
 * @Module({
 *   imports: [OcrModule],
 * })
 * export class MyModule {}
 *
 * // 在服务中使用
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
@Module({
  imports: [AgentXClientModule],
  providers: [OcrService],
  exports: [OcrService],
})
export class OcrModule {}
