import { z } from 'zod';

/**
 * 文件上传请求 Schema
 */
export const FileUploadRequestSchema = z.object({
  file: z.instanceof(Buffer),
  filename: z.string(),
  ext: z.string(),
});

export type FileUploadRequest = z.infer<typeof FileUploadRequestSchema>;

/**
 * 文件上传响应 Schema
 */
export const FileUploadResponseSchema = z.object({
  url: z.string().url(),
  bucket: z.string().optional(),
  key: z.string().optional(),
  size: z.number().optional(),
});

export type FileUploadResponse = z.infer<typeof FileUploadResponseSchema>;
