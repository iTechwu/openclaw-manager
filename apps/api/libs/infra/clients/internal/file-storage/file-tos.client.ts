import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { HttpService } from '@nestjs/axios';

import {
  PardxUploader,
  GetObjectOptions,
  PresignedPutUrlObject,
  PutObjectOptions,
} from './dto/file.dto';

import { PardxApp } from '@/config/dto/config.dto';
import { StorageCredentialsConfig, AppConfig } from '@/config/validation';
import { FileS3Client } from './file-s3.client';
import { RedisService } from '@app/redis';
import { TosClient } from '@volcengine/tos-sdk';
import enviromentUtil from '@/utils/enviroment.util';
import { TRANSCODE_CONSTANTS } from '@/config/constant/config.constants';
import enviroment from '@/utils/enviroment.util';

/**
 * Volcengine TOS (Tinder Object Storage) Client
 *
 * 职责：仅负责与火山引擎 TOS API 通信
 * - 不访问数据库
 * - 不包含业务逻辑
 */
export class FileTosClient extends FileS3Client {
  protected urlRedisKey = 'privateDownloadUrl';
  private tosClient: TosClient;
  private tosInternalClient: TosClient;

  constructor(
    config: PardxUploader.Config,
    storageConfig: StorageCredentialsConfig,
    appConfig: AppConfig,
    redis: RedisService,
    httpService: HttpService,
    logger: Logger,
  ) {
    super(config, storageConfig, appConfig, redis, httpService, logger);
    this.setTosClient();
  }

  /**
   * 初始化火山引擎 TOS 客户端
   * 参考：https://www.volcengine.com/docs/6349/113484?lang=zh
   */
  setTosClient() {
    try {
      // 从 endpoint 中提取域名（去掉协议前缀）
      const extractEndpoint = (endpoint: string): string => {
        if (!endpoint) return '';
        return endpoint.replace(/^https?:\/\//, '').replace(/\/$/, '');
      };

      // 创建外部 TOS 客户端
      this.tosClient = new TosClient({
        accessKeyId: this.storageConfig.accessKey,
        accessKeySecret: this.storageConfig.secretKey,
        region: this.config.region,
        endpoint: extractEndpoint(this.config.tosEndpoint || ''),
      });
      // 创建内部 TOS 客户端（如果配置了内部端点）
      if (enviromentUtil.isProduction()) {
        this.tosInternalClient = new TosClient({
          accessKeyId: this.storageConfig.accessKey,
          accessKeySecret: this.storageConfig.secretKey,
          region: this.config.region,
          endpoint: extractEndpoint(this.config.tosInternalEndpoint),
        });

        this.logger.info('TOS clients initialized with internal endpoint', {
          externalEndpoint: this.config.tosEndpoint,
          internalEndpoint: this.config.tosInternalEndpoint,
          bucket: this.config.bucket,
          region: this.config.region,
        });
      } else {
        this.tosInternalClient = this.tosClient;

        if (enviroment.isProduction()) {
          this.logger.info('TOS client initialized (single endpoint)', {
            endpoint: this.config.tosEndpoint,
            bucket: this.config.bucket,
            region: this.config.region,
          });
        }
      }
    } catch (error) {
      this.logger.error('Failed to initialize TOS clients', {
        error: error.message,
        config: {
          bucket: this.config.bucket,
          region: this.config.region,
          endpoint: this.config.tosEndpoint,
        },
      });
      throw error;
    }
  }

  /**
   * 保持与父类的兼容性，同时初始化 S3 客户端（用于其他操作）
   */
  setClient() {
    // 调用父类方法初始化 S3 客户端（用于兼容其他操作）
    super.setClient();
    // 同时初始化 TOS 客户端（用于预签名 URL）
    this.setTosClient();
  }

  /**
   * 获取视频信息，并组合成 VideoInfo 结构
   *
   * @param fileKey 视频文件键名
   * @param internal 是否使用内部客户端，默认为false
   * @param bucket 存储桶名称（可选），如果未提供则使用配置中的默认存储桶
   * @returns 返回组合后的 VideoInfo 对象
   */
  async getVideoInfo(
    fileKey: string,
    internal: boolean = false,
    bucket?: string,
  ): Promise<any> {
    const finalBucket = bucket || this.getBucketString();
    const tosClient = internal ? this.tosInternalClient : this.tosClient;

    try {
      this.logger.info('Getting video info', {
        fileKey,
        bucket: finalBucket,
        internal,
      });

      // 使用 TOS SDK 的 getObjectV2 方法获取视频信息
      const result = await tosClient.getObjectV2({
        bucket: finalBucket,
        key: fileKey,
        process: 'video/info',
        dataType: 'buffer',
      });

      if (result.data && result.data.content) {
        const videoInfoJson = result.data.content.toString();
        let ffprobeInfo: any;
        try {
          ffprobeInfo = JSON.parse(videoInfoJson);
        } catch (parseError) {
          this.logger.warn('Failed to parse video info as JSON', {
            fileKey,
            content: videoInfoJson,
          });
          throw new Error('Failed to parse video info as JSON');
        }

        this.logger.info('Video info retrieved successfully', {
          fileKey,
          bucket: finalBucket,
          requestId: result.requestId,
        });

        // 组合成 VideoInfo 结构
        // VideoInfo @ prisma/schema.prisma:
        // id, duration, streamDuration, height, width, sar, dar, rFrameRate, ffmpegInfo, spriteCount, ...
        // 按 IMM、ffmpeg标准推算
        const format = ffprobeInfo.format || {};
        const streams = ffprobeInfo.streams || [];
        const videoStream = streams.find((s: any) => s.codec_type === 'video');
        // 若有多个视频流，默认取第一个
        const audioStream = streams.find((s: any) => s.codec_type === 'audio');

        const duration = ffprobeInfo.duration
          ? parseFloat(ffprobeInfo.duration)
          : format.duration
            ? parseFloat(format.duration)
            : videoStream && videoStream.duration
              ? parseFloat(videoStream.duration)
              : 0;
        const streamDuration = ffprobeInfo.duration
          ? parseFloat(ffprobeInfo.duration)
          : videoStream && videoStream.duration
            ? parseFloat(videoStream.duration)
            : duration;

        const width = videoStream?.width ?? null;
        const height = videoStream?.height ?? null;
        const sar = videoStream?.sample_aspect_ratio ?? '1:1';
        const dar =
          videoStream?.display_aspect_ratio ?? videoStream?.dar ?? null;
        const rFrameRate = videoStream?.r_frame_rate ?? null;

        // 返回 VideoInfo 主体和原始 ffmpeg info
        // 这些字段与 schema 里 VideoInfo 字段保持同步
        const videoInfo = {
          duration: duration || 0,
          streamDuration: streamDuration || 0,
          height: width != null && height != null ? height : null,
          width: width != null && height != null ? width : null,
          sar,
          dar,
          rFrameRate,
          ffmpegInfo: ffprobeInfo,
          audioDuration: audioStream?.duration
            ? parseFloat(audioStream.duration)
            : 0,
          // 其它结构字段，需用到可补充
          // id, fileKeyId, ... 由上层数据库生成
        };

        return videoInfo;
      } else {
        throw new Error('Failed to get video info: missing data in response');
      }
    } catch (error) {
      this.logger.error('Failed to get video info', {
        fileKey,
        bucket: finalBucket,
        error: error.message,
        stack: error.stack,
        internal,
      });
      throw error;
    }
  }

  /**
   * 获取图片信息
   * 参考：https://www.volcengine.com/docs/6349/1179568?lang=zh
   *
   * 使用 TOS SDK 的图片信息获取功能，返回图片的基本信息（格式、宽度、高度、大小等）
   * 如果图片包含 Exif 信息，将按照 JSON 格式返回内容
   *
   * @param fileKey 图片文件键名
   * @param internal 是否使用内部客户端，默认为false
   * @param bucket 存储桶名称（可选），如果未提供则使用配置中的默认存储桶
   * @returns 返回图片信息的 JSON 字符串
   */
  async getImageInfo(
    fileKey: string,
    internal: boolean = false,
    bucket?: string,
  ): Promise<any> {
    const finalBucket = bucket || this.getBucketString();
    const tosClient = internal ? this.tosInternalClient : this.tosClient;

    try {
      this.logger.info('Getting image info', {
        fileKey,
        bucket: finalBucket,
        internal,
      });

      // 使用 TOS SDK 的 getObjectV2 方法获取图片信息
      // process 参数：image/info 表示获取图片信息
      // 参考文档：https://www.volcengine.com/docs/6349/1179568?lang=zh
      const result = await tosClient.getObjectV2({
        bucket: finalBucket,
        key: fileKey,
        process: 'image/info', // 图片信息处理参数
        dataType: 'buffer', // 返回 buffer 类型数据
      });

      // 解析返回的图片信息
      if (result.data && result.data.content) {
        const imageInfoJson = result.data.content.toString();

        // 尝试解析 JSON 以验证格式
        try {
          const rawImageInfo: any = JSON.parse(imageInfoJson);

          // 提取宽高值（TOS 返回的是字符串格式）
          const widthStr = rawImageInfo.ImageWidth?.value;
          const heightStr = rawImageInfo.ImageHeight?.value;

          // 转换为数字
          const width = widthStr ? parseInt(widthStr, 10) : undefined;
          const height = heightStr ? parseInt(heightStr, 10) : undefined;

          // 计算宽高比（SAR 和 DAR）
          // SAR (Sample Aspect Ratio): 像素宽高比，默认 1:1
          // DAR (Display Aspect Ratio): 显示宽高比，默认与 SAR 相同
          let sar: string = '1:1'; // 默认值
          let dar: string | undefined = undefined;

          if (width && height) {
            // 计算最大公约数以简化比例
            const gcd = (a: number, b: number): number => {
              return b === 0 ? a : gcd(b, a % b);
            };
            const divisor = gcd(width, height);
            sar = `${width / divisor}:${height / divisor}`;
            dar = sar; // 默认 DAR 与 SAR 相同
          }

          // 重组为 ImageInfo 格式
          const imageInfo: Partial<{
            width: number;
            height: number;
            sar: string;
            dar: string | undefined;
            ffmpegInfo: any;
          }> = {
            width,
            height,
            sar,
            dar,
            ffmpegInfo: rawImageInfo, // 保存完整的原始数据
          };

          this.logger.info('Image info retrieved successfully', {
            fileKey,
            bucket: finalBucket,
            requestId: result.requestId,
            format: rawImageInfo.Format?.value,
            width: imageInfo.width,
            height: imageInfo.height,
            sar: imageInfo.sar,
            dar: imageInfo.dar,
            fileSize: rawImageInfo.FileSize?.value,
          });

          return imageInfo;
        } catch (parseError) {
          // 如果不是有效的 JSON，记录警告但继续返回原始内容
          this.logger.warn('Failed to parse image info as JSON', {
            fileKey,
            content: imageInfoJson,
          });
          throw new Error('Failed to parse image info as JSON');
        }
      } else {
        throw new Error('Failed to get image info: missing data in response');
      }
    } catch (error) {
      this.logger.error('Failed to get image info', {
        fileKey,
        bucket: finalBucket,
        error: error.message,
        stack: error.stack,
        internal,
      });
      throw error;
    }
  }

  /**
   * 获取音频信息
   * 参考：火山引擎 TOS 媒体处理文档
   *
   * 使用 TOS SDK 的音频信息获取功能，返回音频的详细信息（时长、采样率、声道数、比特率等）
   *
   * @param fileKey 音频文件键名
   * @param internal 是否使用内部客户端，默认为false
   * @param bucket 存储桶名称（可选），如果未提供则使用配置中的默认存储桶
   * @returns 返回音频信息的对象
   */
  /**
   * 获取音频信息，并组合成 AudioInfo 结构
   *
   * @param fileKey 音频文件键名
   * @param internal 是否使用内部客户端，默认为false
   * @param bucket 存储桶名称（可选），如果未提供则使用配置中的默认存储桶
   * @returns 返回组合后的 AudioInfo 对象
   */
  async getAudioInfo(
    fileKey: string,
    internal: boolean = false,
    bucket?: string,
  ): Promise<any> {
    const finalBucket = bucket || this.getBucketString();
    const tosClient = internal ? this.tosInternalClient : this.tosClient;

    try {
      this.logger.info('Getting audio info', {
        fileKey,
        bucket: finalBucket,
        internal,
      });

      // 使用 TOS SDK 的 getObjectV2 方法获取音频信息
      const result = await tosClient.getObjectV2({
        bucket: finalBucket,
        key: fileKey,
        process: 'video/info',
        dataType: 'buffer',
      });

      if (result.data && result.data.content) {
        const audioInfoJson = result.data.content.toString();
        let ffprobeInfo: any;

        try {
          ffprobeInfo = JSON.parse(audioInfoJson);
        } catch (parseError) {
          this.logger.warn('Failed to parse audio info as JSON', {
            fileKey,
            content: audioInfoJson,
            error:
              parseError instanceof Error
                ? parseError.message
                : String(parseError),
          });
          throw new Error('Failed to parse audio info as JSON');
        }

        const format = ffprobeInfo.format || {};
        const streams = ffprobeInfo.streams || [];

        // 查找音频流（可能有多个，取第一个）
        const audioStream = streams.find((s: any) => s.codec_type === 'audio');

        // 提取时长信息
        const duration = ffprobeInfo.duration
          ? parseFloat(ffprobeInfo.duration.toString())
          : ffprobeInfo.duration
            ? parseFloat(ffprobeInfo.duration.toString())
            : format.duration
              ? parseFloat(format.duration.toString())
              : audioStream?.duration
                ? parseFloat(audioStream.duration.toString())
                : 0;

        const streamDuration = ffprobeInfo.streamDuration
          ? parseFloat(ffprobeInfo.streamDuration.toString())
          : audioStream?.duration
            ? parseFloat(audioStream.duration.toString())
            : duration;

        // 提取音频流信息
        const channels = audioStream?.channels ?? undefined;
        const channelLayout = audioStream?.channel_layout ?? undefined;
        const sampleRate = audioStream?.sample_rate
          ? audioStream.sample_rate.toString()
          : undefined;

        // 提取比特率（优先使用 format.bit_rate，其次使用 stream.bit_rate）
        const bitRate = format.bit_rate
          ? format.bit_rate.toString()
          : audioStream?.bit_rate
            ? audioStream.bit_rate.toString()
            : undefined;

        // 组合成 AudioInfo 结构
        // AudioInfo @ prisma/schema.prisma:
        // id, duration, streamDuration, channels, channelLayout, sampleRate, bitRate, ffmpegInfo, fileKeyId
        const audioInfo: Partial<{
          duration: number;
          streamDuration: number;
          channels: number | undefined;
          channelLayout: string | undefined;
          sampleRate: string | undefined;
          bitRate: string | undefined;
          ffmpegInfo: any;
        }> = {
          duration: duration || 0,
          streamDuration: streamDuration || 0,
          channels,
          channelLayout,
          sampleRate,
          bitRate,
          ffmpegInfo: ffprobeInfo, // 保存完整的原始数据
        };

        this.logger.info('Audio info retrieved successfully', {
          fileKey,
          bucket: finalBucket,
          requestId: result.requestId,
          duration: audioInfo.duration,
          streamDuration: audioInfo.streamDuration,
          channels: audioInfo.channels,
          sampleRate: audioInfo.sampleRate,
          bitRate: audioInfo.bitRate,
        });

        return audioInfo;
      } else {
        throw new Error('Failed to get audio info: missing data in response');
      }
    } catch (error) {
      this.logger.error('Failed to get audio info', {
        fileKey,
        bucket: finalBucket,
        error: error.message,
        stack: error.stack,
        internal,
      });
      throw error;
    }
  }

  /**
   * 视频第一帧截帧并持久化存储
   * 参考：https://www.volcengine.com/docs/6349/1179565?lang=zh
   *
   * 使用 TOS SDK 的视频截帧功能，截取视频第一帧并保存到指定位置
   *
   * @param fileKey 视频文件键名
   * @param internal 是否使用内部客户端，默认为false
   * @param bucket 存储桶名称（可选），如果未提供则使用配置中的默认存储桶
   * @returns 返回保存的截图文件键名
   */
  async getSnapshot(
    fileKey: string,
    internal: boolean = false,
    bucket?: string,
    time: number = 0,
    width: number = 0,
    height: number = 0,
    format: string = 'jpg',
  ): Promise<string> {
    const finalBucket = bucket || this.getBucketString();
    const tosClient = internal ? this.tosInternalClient : this.tosClient;

    try {
      // 构建目标文件路径：将 fileKey 的后缀改为 _snapshot.jpg
      // 例如：path/to/video.mp4 -> path/to/video_snapshot.jpg
      const pathParts = fileKey.split('/');
      const fileName = pathParts.pop() || '';
      const basePath = pathParts.join('/');

      // 移除原文件扩展名，添加 _snapshot.jpg 后缀
      const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
      const snapshotFileName = `${nameWithoutExt}${TRANSCODE_CONSTANTS.SUFFIXES.SNAPSHOT}${TRANSCODE_CONSTANTS.EXTENSIONS.JPG}`;
      const snapshotFileKey = basePath
        ? `${basePath}/${snapshotFileName}`
        : snapshotFileName;

      this.logger.info('Generating video snapshot', {
        fileKey,
        snapshotFileKey,
        bucket: finalBucket,
        internal,
      });

      // 使用 TOS SDK 的 getObjectV2 方法进行视频截帧并持久化存储
      // process 参数：video/snapshot,t_0 表示截取第0秒（第一帧）
      // saveBucket 和 saveObject 需要使用 base64url 编码
      // 构建 process 参数，width 或 height 为 0 时不包含
      let process = `video/snapshot,t_${time}`;
      if (width > 0) {
        process += `,w_${width}`;
      }
      if (height > 0) {
        process += `,h_${height}`;
      }
      if (format) {
        process += `,f_${format}`;
      }
      const saveBucket = Buffer.from(finalBucket).toString('base64url');
      const saveObject = Buffer.from(snapshotFileKey).toString('base64url');

      const result = await tosClient.getObjectV2({
        bucket: finalBucket,
        key: fileKey,
        process: process,
        dataType: 'buffer',
        saveBucket: saveBucket,
        saveObject: saveObject,
      });

      // 解析返回结果
      // 根据文档，持久化存储成功后，返回的 data.content 包含保存结果信息
      if (result.data) {
        let saveResult;
        if (result.data.content) {
          try {
            saveResult = JSON.parse(result.data.content.toString());
          } catch (parseError) {
            // 如果不是 JSON，可能是其他格式，记录原始内容
            this.logger.warn('Failed to parse snapshot result as JSON', {
              content: result.data.content.toString(),
            });
          }
        }

        this.logger.info('Video snapshot generated and saved successfully', {
          fileKey,
          snapshotFileKey,
          bucket: finalBucket,
          requestId: result.requestId,
          saveResult: saveResult,
        });

        // 返回保存的截图文件键名
        return snapshotFileKey;
      } else {
        throw new Error(
          'Failed to get snapshot result from TOS response: missing data',
        );
      }
    } catch (error) {
      this.logger.error('Failed to generate video snapshot', {
        fileKey,
        bucket: finalBucket,
        error: error.message,
        stack: error.stack,
        internal,
      });
      throw error;
    }
  }

  /**
   * 获取私有文件的下载链接
   * 参考：https://www.volcengine.com/docs/6349/113484?lang=zh
   *
   * 使用火山引擎官方 TOS SDK 生成预签名 URL
   *
   * @param fileKey 文件键名
   * @param expire 链接过期时间，单位为秒，默认为30秒
   * @param internal 是否使用内部客户端，默认为false
   * @param bucket 存储桶名称（可选），如果未提供则使用配置中的默认存储桶
   * @returns 返回一个Promise，解析后得到私有文件的下载链接
   */
  async getPrivateDownloadUrl(
    fileKey: string,
    expire: number = 3600,
    internal: boolean = false,
    bucket?: string,
  ): Promise<string> {
    // 如果是公开存储桶，直接返回公开 URL
    if (this.config.isPublic) {
      return `${this.config.domain}/${fileKey}`;
    }
    // console.log('techwu bucket', bucket, fileKey);

    const finalBucket = bucket || this.getBucketString();
    const cacheKey = `${finalBucket}:${fileKey}`;

    // 检查 Redis 缓存
    // const redisUrl = await this.redis.getData(this.urlRedisKey, cacheKey);
    // if (redisUrl) {
    //     this.logger.debug('Using cached presigned URL', { fileKey, bucket: finalBucket });
    //     return redisUrl;
    // }

    // 使用火山引擎 TOS SDK 生成预签名 URL
    const tosClient = internal ? this.tosInternalClient : this.tosClient;

    try {
      // 使用 TOS SDK 的 getPreSignedUrl 方法生成预签名 URL
      // 参考文档：https://www.volcengine.com/docs/6349/113484?lang=zh
      const signedUrl = tosClient.getPreSignedUrl({
        method: 'GET',
        bucket: finalBucket,
        key: fileKey,
        expires: expire, // 预签名 URL 的有效期，单位是秒
      });

      this.logger.info('Generated presigned URL for TOS using TOS SDK', {
        fileKey,
        bucket: finalBucket,
        expiresIn: expire,
        internal,
      });

      // 缓存 URL（缓存时间略短于过期时间，确保不会返回已过期的 URL）
      const cacheExpire = Math.max(expire - 5, 1); // 至少缓存1秒
      await this.redis.saveData(
        this.urlRedisKey,
        cacheKey,
        signedUrl,
        cacheExpire,
      );

      // 如果需要替换为自定义域名，使用 replaceUrlToOwnDoamin
      return this.replaceUrlToOwnDoamin(signedUrl);
    } catch (error) {
      this.logger.error('Failed to generate presigned URL for TOS', {
        fileKey,
        bucket: finalBucket,
        error: error.message,
        internal,
      });
      throw error;
    }
  }

  /**
   * 获取私有文件的下载链接（不进行 CDN 加密）
   * 参考：https://www.volcengine.com/docs/6349/113484?lang=zh
   *
   * 使用火山引擎官方 TOS SDK 生成预签名 URL
   *
   * @param fileKey 文件键名
   * @param expiresIn 链接过期时间，单位为秒，默认为30秒
   * @param internal 是否使用内部客户端，默认为false
   * @param bucket 存储桶名称（可选），如果未提供则使用配置中的默认存储桶
   * @returns 返回一个Promise，解析后得到私有文件的下载链接
   */
  async getPrivateDownloadUrlWithoutCdnEncrypt(
    fileKey: string,
    expiresIn: number = 30,
    internal: boolean = false,
    bucket?: string,
  ): Promise<string> {
    // 如果是公开存储桶，直接返回公开 URL
    if (this.config.isPublic) {
      return `${this.config.domain}/${fileKey}`;
    }

    const finalBucket = bucket || this.getBucketString();
    const cacheKey = `${finalBucket}:${fileKey}`;

    // 检查 Redis 缓存
    const redisUrl = await this.redis.getData(this.urlRedisKey, cacheKey);
    if (redisUrl) {
      this.logger.debug('Using cached presigned URL', {
        fileKey,
        bucket: finalBucket,
      });
      return redisUrl;
    }

    // 使用火山引擎 TOS SDK 生成预签名 URL
    const tosClient = internal ? this.tosInternalClient : this.tosClient;

    try {
      // 使用 TOS SDK 的 getPreSignedUrl 方法生成预签名 URL
      // 参考文档：https://www.volcengine.com/docs/6349/113484?lang=zh
      const signedUrl = tosClient.getPreSignedUrl({
        method: 'GET',
        bucket: finalBucket,
        key: fileKey,
        expires: expiresIn, // 预签名 URL 的有效期，单位是秒
      });

      this.logger.info(
        'Generated presigned URL for TOS using TOS SDK (without CDN encrypt)',
        {
          fileKey,
          bucket: finalBucket,
          expiresIn,
          internal,
        },
      );

      // 缓存 URL
      const cacheExpire = Math.max(expiresIn - 5, 1);
      await this.redis.saveData(
        this.urlRedisKey,
        cacheKey,
        signedUrl,
        cacheExpire,
      );

      // 如果需要替换为自定义域名
      if (internal) {
        return this.replaceUrlToOwnDoamin(signedUrl);
      }

      return signedUrl;
    } catch (error) {
      this.logger.error('Failed to generate presigned URL for TOS', {
        fileKey,
        bucket: finalBucket,
        error: error.message,
        internal,
      });
      throw error;
    }
  }
}
