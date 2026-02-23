/**
 * @fileoverview OCR 服务导出
 *
 * 本模块提供 OCR 文本提取能力的统一封装。
 *
 * @module ocr
 *
 * @example
 * ```typescript
 * // 导入模块
 * import { OcrModule, OcrService } from '@app/shared-services/ocr';
 *
 * // 在 NestJS 模块中使用
 * @Module({
 *   imports: [OcrModule],
 * })
 * export class MyModule {}
 *
 * // 在服务中注入使用
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

// 模块导出
export * from './ocr.module';

// 服务导出
export * from './ocr.service';
