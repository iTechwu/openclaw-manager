import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';
import {
  FileUploadRequest,
  FileUploadResponse,
  FileUploadResponseSchema,
} from './interfaces/file.interface';
import { getKeysConfig } from '@/config/configuration';
import type { AgentXConfig } from '@/config/validation';

/**
 * AgentX File Client
 *
 * 封装所有与 Python AgentX API 的文件操作交互
 * - 文件上传到 S3
 * - 统一的错误处理
 */
@Injectable()
export class AgentXFileClient implements OnModuleInit {
  private readonly logger = new Logger(AgentXFileClient.name);
  private baseUrl: string = '';
  private agentxConfig: AgentXConfig | undefined;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    const keysConfig = getKeysConfig();
    this.agentxConfig = keysConfig?.agentx;
    this.baseUrl = this.agentxConfig?.baseUrl || '';

    if (!this.baseUrl) {
      throw new Error('AgentXFileClient: baseUrl not configured');
    }

    this.logger.log(
      `AgentX File Client initialized with baseUrl: ${this.baseUrl}`,
    );
  }

  /**
   * 上传文件到 S3（支持本地文件路径或 URL）
   *
   * @param filePath 文件路径（本地路径或 HTTP/HTTPS URL）
   * @returns 文件 URL
   */
  async uploadFileFromPath(filePath: string): Promise<string> {
    this.logger.log(`Uploading file from path: ${filePath}`);

    let fileBuffer: Buffer;
    let filename: string;
    let ext: string;

    // 检查是否为 URL
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      this.logger.log('Detected URL, downloading file...');

      try {
        // 使用 HttpService 下载文件
        const response = await firstValueFrom(
          this.httpService.get(filePath, {
            responseType: 'arraybuffer',
            timeout: 60000, // 60 秒超时
          }),
        );

        fileBuffer = Buffer.from(response.data);

        // 从 URL 中提取文件名和扩展名
        const url = new URL(filePath);
        const pathname = url.pathname;
        filename = pathname.split('/').pop() || 'downloaded_file';
        ext = filename.toLowerCase().split('.').pop() || 'jpg';

        // 如果没有扩展名，尝试从 Content-Type 推断
        if (!filename.includes('.')) {
          const contentType = response.headers['content-type'];
          if (contentType) {
            if (contentType.includes('jpeg') || contentType.includes('jpg')) {
              ext = 'jpg';
            } else if (contentType.includes('png')) {
              ext = 'png';
            } else if (contentType.includes('webp')) {
              ext = 'webp';
            } else if (contentType.includes('gif')) {
              ext = 'gif';
            }
            filename = `downloaded_file.${ext}`;
          }
        }

        this.logger.log(`File downloaded successfully: ${filename}`);
      } catch (error) {
        this.logger.error('Error downloading file:', error);
        throw new Error(`Failed to download file: ${(error as Error).message}`);
      }
    } else {
      // 处理本地文件路径
      filename = path.basename(filePath);
      ext = filename.toLowerCase().split('.').pop() || '';

      // 读取文件内容
      try {
        fileBuffer = fs.readFileSync(filePath);
        this.logger.log(`File read successfully: ${filename}`);
      } catch (error) {
        this.logger.error('Error reading file:', error);
        throw new Error(`Failed to read file: ${(error as Error).message}`);
      }
    }

    // 上传文件
    const result = await this.uploadFile({
      file: fileBuffer,
      filename,
      ext,
    });

    this.logger.log(`File uploaded successfully: ${result.url}`);
    return result.url;
  }

  /**
   * 上传文件到 S3
   *
   * @param request 文件上传请求
   * @returns 文件 URL
   */
  async uploadFile(request: FileUploadRequest): Promise<FileUploadResponse> {
    this.logger.log(`Uploading file: ${request.filename}`);

    try {
      // 创建 FormData
      const formData = new FormData();
      formData.append('file', request.file, {
        filename: request.filename,
        contentType: this.getContentType(request.ext),
      });

      // 发送请求
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/file/upload`, formData, {
          headers: {
            ...formData.getHeaders(),
          },
          timeout: 60000, // 60 秒超时（文件上传可能较慢）
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        }),
      );

      // 使用 Zod 验证响应
      const validatedResponse = FileUploadResponseSchema.parse(response.data);

      this.logger.log(`File uploaded successfully: ${validatedResponse.url}`);
      return validatedResponse;
    } catch (error) {
      this.handleError('uploadFile', error as AxiosError, {
        filename: request.filename,
      });
    }
  }

  /**
   * 根据文件扩展名获取 Content-Type
   */
  private getContentType(ext: string): string {
    const contentTypeMap: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      txt: 'text/plain',
      csv: 'text/csv',
      json: 'application/json',
      xml: 'application/xml',
      zip: 'application/zip',
      mp4: 'video/mp4',
      mp3: 'audio/mpeg',
    };

    return contentTypeMap[ext.toLowerCase()] || 'application/octet-stream';
  }

  /**
   * 统一错误处理
   */
  private handleError(
    operation: string,
    error: AxiosError,
    context?: Record<string, any>,
  ): never {
    const errorMessage = this.extractErrorMessage(error);
    const statusCode = error.response?.status;

    this.logger.error(`AgentX File API Error [${operation}]: ${errorMessage}`, {
      statusCode,
      context,
      responseData: error.response?.data,
    });

    if (statusCode === 413) {
      throw new Error(`Fileoo large: ${context?.filename || 'unknown'}`);
    } else if (statusCode === 400) {
      throw new Error(`Invalid file: ${errorMessage}`);
    } else if (statusCode === 500) {
      throw new Error(`AgentX server error: ${errorMessage}`);
    } else if (error.code === 'ECONNREFUSED') {
      throw new Error(`Cannot connect to AgentX server: ${this.baseUrl}`);
    } else if (error.code === 'ETIMEDOUT') {
      throw new Error(`File upload timeout: ${operation}`);
    } else {
      throw new Error(`AgentX File API error: ${errorMessage}`);
    }
  }

  /**
   * 提取错误消息
   */
  private extractErrorMessage(error: AxiosError): string {
    if (error.response?.data) {
      const data = error.response.data as any;
      return data.message || data.error || data.detail || 'Unknown error';
    }
    return error.message || 'Unknown error';
  }
}
