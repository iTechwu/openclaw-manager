import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

/**
 * GLM Response Transformer Service
 *
 * 处理智谱 GLM 模型的响应转换，解决 reasoning_content 问题。
 *
 * 问题背景：
 * - GLM-5 等模型可能将内容放在 reasoning_content 字段中
 * - OpenClaw 的 pi-ai 库只解析 content 字段的 text 块
 * - 导致 content 数组为空，用户看不到响应
 *
 * 解决方案：
 * - 在流式响应中检测 reasoning_content 字段
 * - 将 reasoning_content 转换为标准 content 格式
 */
@Injectable()
export class GlmResponseTransformerService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  /**
   * 检查是否需要转换（基于模型名称判断）
   */
  shouldTransform(model: string | undefined): boolean {
    if (!model) return false;
    const modelLower = model.toLowerCase();
    return (
      modelLower.includes('glm') ||
      modelLower.startsWith('zhipu') ||
      modelLower.includes('chatglm')
    );
  }

  /**
   * 转换单个 SSE 事件的 JSON 数据
   *
   * GLM 响应格式示例：
   * {
   *   "id": "...",
   *   "choices": [{
   *     "delta": {
   *       "reasoning_content": "思考过程...",
   *       "content": "" // 可能为空
   *     }
   *   }]
   * }
   *
   * 转换后：
   * {
   *   "id": "...",
   *   "choices": [{
   *     "delta": {
   *       "content": "思考过程...",  // reasoning_content 移动到 content
   *       "reasoning_content": "思考过程..."  // 保留原字段
   *     }
   *   }]
   * }
   */
  transformSseEventData(data: string): string {
    // 跳过 [DONE] 标记
    if (data.trim() === '[DONE]') {
      return data;
    }

    try {
      const parsed = JSON.parse(data);
      let modified = false;

      // 处理 choices 数组
      if (Array.isArray(parsed.choices)) {
        for (const choice of parsed.choices) {
          // 处理 delta（流式响应）
          if (choice.delta) {
            const result = this.transformDelta(choice.delta);
            if (result.modified) {
              choice.delta = result.delta;
              modified = true;
            }
          }
          // 处理 message（非流式响应）
          if (choice.message) {
            const result = this.transformMessage(choice.message);
            if (result.modified) {
              choice.message = result.message;
              modified = true;
            }
          }
        }
      }

      if (modified) {
        this.logger.debug('[GLM Transformer] Transformed response chunk');
        return JSON.stringify(parsed);
      }
    } catch (e) {
      // 解析失败，返回原始数据
      this.logger.debug(
        `[GLM Transformer] Failed to parse SSE data: ${data.substring(0, 100)}`,
      );
    }

    return data;
  }

  /**
   * 转换 delta 对象（流式响应）
   */
  private transformDelta(delta: Record<string, unknown>): {
    delta: Record<string, unknown>;
    modified: boolean;
  } {
    let modified = false;
    const newDelta = { ...delta };

    // 检查 reasoning_content
    if (
      typeof newDelta.reasoning_content === 'string' &&
      newDelta.reasoning_content.length > 0
    ) {
      // 如果 content 为空或不存在，使用 reasoning_content 作为 content
      if (
        !newDelta.content ||
        (typeof newDelta.content === 'string' && newDelta.content === '')
      ) {
        newDelta.content = newDelta.reasoning_content;
        modified = true;
        this.logger.debug(
          `[GLM Transformer] Moved reasoning_content to content: ${newDelta.reasoning_content.substring(0, 50)}...`,
        );
      }
    }

    // 检查 reasoning_content 数组格式（某些版本可能使用数组）
    if (
      Array.isArray(newDelta.reasoning_content) &&
      newDelta.reasoning_content.length > 0
    ) {
      const reasoningText = newDelta.reasoning_content
        .filter((item): item is { type: string; text: string } =>
          item && typeof item === 'object' && item.type === 'text' && typeof item.text === 'string'
        )
        .map((item) => item.text)
        .join('');

      if (reasoningText.length > 0) {
        if (
          !newDelta.content ||
          (typeof newDelta.content === 'string' && newDelta.content === '')
        ) {
          newDelta.content = reasoningText;
          modified = true;
        }
      }
    }

    return { delta: newDelta, modified };
  }

  /**
   * 转换 message 对象（非流式响应）
   */
  private transformMessage(message: Record<string, unknown>): {
    message: Record<string, unknown>;
    modified: boolean;
  } {
    let modified = false;
    const newMessage = { ...message };

    // 处理 reasoning_content 字段
    if (
      typeof newMessage.reasoning_content === 'string' &&
      newMessage.reasoning_content.length > 0
    ) {
      // 如果 content 为空或不存在
      if (
        !newMessage.content ||
        (typeof newMessage.content === 'string' && newMessage.content === '')
      ) {
        newMessage.content = newMessage.reasoning_content;
        modified = true;
      }
      // 如果 content 是数组且为空
      else if (
        Array.isArray(newMessage.content) &&
        newMessage.content.length === 0
      ) {
        newMessage.content = [{ type: 'text', text: newMessage.reasoning_content as string }];
        modified = true;
      }
    }

    return { message: newMessage, modified };
  }

  /**
   * 创建转换流处理器
   * 用于处理 SSE 流式响应的逐块转换
   */
  createTransformStream(): TransformStream {
    let buffer = '';
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    return new TransformStream({
      transform: (chunk: Uint8Array, controller) => {
        buffer += decoder.decode(chunk, { stream: true });

        // 按行处理 SSE 事件
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留未完成的行

        for (const line of lines) {
          if (line.startsWith('data:')) {
            const data = line.slice(5).trim();
            const transformed = this.transformSseEventData(data);
            controller.enqueue(encoder.encode(`data: ${transformed}\n`));
          } else if (line.trim()) {
            // 非 data 行直接传递
            controller.enqueue(encoder.encode(`${line}\n`));
          } else {
            // 空行
            controller.enqueue(encoder.encode('\n'));
          }
        }
      },
      flush: (controller) => {
        // 处理剩余的缓冲区
        if (buffer.trim()) {
          if (buffer.startsWith('data:')) {
            const data = buffer.slice(5).trim();
            const transformed = this.transformSseEventData(data);
            controller.enqueue(encoder.encode(`data: ${transformed}\n`));
          } else {
            controller.enqueue(encoder.encode(buffer));
          }
        }
      },
    });
  }
}

/**
 * 简化的 TransformStream 类型（Node.js 环境）
 */
interface TransformStream {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
}
