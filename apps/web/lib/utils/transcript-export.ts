/**
 * Transcript Export Utilities
 *
 * Provides functions for exporting transcripts to various formats:
 * - SRT (SubRip subtitle format)
 * - TXT (Plain text)
 * - JSON (Structured data)
 * - VTT (WebVTT format)
 */

/**
 * Minimal StreamingUtterance type for transcript export.
 * Mirrors the structure used in the backend streaming ASR service.
 */
export interface StreamingUtterance {
  /** 说话人 ID */
  speakerId: string;
  /** 识别文本 */
  text: string;
  /** 开始时间（毫秒） */
  startTime: number;
  /** 结束时间（毫秒） */
  endTime: number;
  /** 是否确定（非中间结果） */
  definite?: boolean;
  /** 语速 */
  speechRate?: number;
  /** 音量 */
  volume?: number;
  /** 情绪 */
  emotion?: string;
  /** 性别 */
  gender?: string;
}

/**
 * Speaker name mapping
 */
export type SpeakerNames = Record<string, string>;

/**
 * Export options
 */
export interface ExportOptions {
  /** Custom speaker names */
  speakerNames?: SpeakerNames;
  /** Include timestamps */
  includeTimestamps?: boolean;
  /** Include speaker names */
  includeSpeakers?: boolean;
  /** Include confidence scores */
  includeConfidence?: boolean;
  /** Meeting title */
  title?: string;
  /** Meeting date */
  date?: Date;
}

/**
 * Format time in milliseconds to SRT format (HH:MM:SS,mmm)
 */
function formatSrtTime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = Math.floor(ms % 1000);

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
}

/**
 * Format time in milliseconds to VTT format (HH:MM:SS.mmm)
 */
function formatVttTime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = Math.floor(ms % 1000);

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}

/**
 * Format time in milliseconds to readable format (MM:SS)
 */
function formatReadableTime(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Get speaker display name
 */
function getSpeakerName(
  speakerId: string,
  speakerNames?: SpeakerNames,
): string {
  if (speakerNames?.[speakerId]) {
    return speakerNames[speakerId];
  }
  const num = parseInt(speakerId.replace(/\D/g, '') || '1', 10);
  return `Speaker ${num}`;
}

/**
 * Export transcript to SRT (SubRip subtitle) format
 *
 * @example Output:
 * ```
 * 1
 * 00:00:00,000 --> 00:00:05,500
 * Speaker 1: Hello, welcome to the meeting.
 *
 * 2
 * 00:00:05,500 --> 00:00:10,000
 * Speaker 2: Thank you for joining.
 * ```
 */
export function exportToSrt(
  utterances: StreamingUtterance[],
  options: ExportOptions = {},
): string {
  const { speakerNames, includeSpeakers = true } = options;

  return utterances
    .map((utterance, index) => {
      const startTime = formatSrtTime(utterance.startTime);
      const endTime = formatSrtTime(utterance.endTime);
      const speaker = includeSpeakers
        ? `${getSpeakerName(utterance.speakerId, speakerNames)}: `
        : '';

      return `${index + 1}\n${startTime} --> ${endTime}\n${speaker}${utterance.text}`;
    })
    .join('\n\n');
}

/**
 * Export transcript to WebVTT format
 *
 * @example Output:
 * ```
 * WEBVTT
 *
 * 1
 * 00:00:00.000 --> 00:00:05.500
 * <v Speaker 1>Hello, welcome to the meeting.
 * ```
 */
export function exportToVtt(
  utterances: StreamingUtterance[],
  options: ExportOptions = {},
): string {
  const { speakerNames, includeSpeakers = true } = options;

  const header = 'WEBVTT\n\n';

  const cues = utterances
    .map((utterance, index) => {
      const startTime = formatVttTime(utterance.startTime);
      const endTime = formatVttTime(utterance.endTime);
      const speakerTag = includeSpeakers
        ? `<v ${getSpeakerName(utterance.speakerId, speakerNames)}>`
        : '';

      return `${index + 1}\n${startTime} --> ${endTime}\n${speakerTag}${utterance.text}`;
    })
    .join('\n\n');

  return header + cues;
}

/**
 * Export transcript to plain text format
 *
 * @example Output:
 * ```
 * Meeting Transcript
 * Date: 2024-01-15
 * ==================
 *
 * [00:00] Speaker 1:
 * Hello, welcome to the meeting.
 *
 * [00:05] Speaker 2:
 * Thank you for joining.
 * ```
 */
export function exportToTxt(
  utterances: StreamingUtterance[],
  options: ExportOptions = {},
): string {
  const {
    speakerNames,
    includeTimestamps = true,
    includeSpeakers = true,
    title = 'Meeting Transcript',
    date,
  } = options;

  const lines: string[] = [];

  // Header
  lines.push(title);
  if (date) {
    lines.push(`Date: ${date.toLocaleDateString()}`);
  }
  lines.push('='.repeat(50));
  lines.push('');

  // Content
  for (const utterance of utterances) {
    const timestamp = includeTimestamps
      ? `[${formatReadableTime(utterance.startTime)}] `
      : '';
    const speaker = includeSpeakers
      ? `${getSpeakerName(utterance.speakerId, speakerNames)}:`
      : '';

    if (speaker) {
      lines.push(`${timestamp}${speaker}`);
      lines.push(utterance.text);
    } else {
      lines.push(`${timestamp}${utterance.text}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Export transcript to JSON format
 *
 * Includes all metadata for downstream processing
 */
export function exportToJson(
  utterances: StreamingUtterance[],
  options: ExportOptions = {},
): string {
  const { speakerNames, title, date } = options;

  const data = {
    title: title || 'Meeting Transcript',
    exportedAt: new Date().toISOString(),
    meetingDate: date?.toISOString(),
    utterances: utterances.map((u) => ({
      ...u,
      speakerName: getSpeakerName(u.speakerId, speakerNames),
    })),
    summary: {
      totalUtterances: utterances.length,
      totalSpeakers: new Set(utterances.map((u) => u.speakerId)).size,
      totalDurationMs:
        utterances.length > 0
          ? Math.max(...utterances.map((u) => u.endTime)) -
            Math.min(...utterances.map((u) => u.startTime))
          : 0,
    },
  };

  return JSON.stringify(data, null, 2);
}

/**
 * Export format type
 */
export type ExportFormat = 'srt' | 'vtt' | 'txt' | 'json';

/**
 * Export transcript to specified format
 */
export function exportTranscript(
  utterances: StreamingUtterance[],
  format: ExportFormat,
  options: ExportOptions = {},
): string {
  switch (format) {
    case 'srt':
      return exportToSrt(utterances, options);
    case 'vtt':
      return exportToVtt(utterances, options);
    case 'txt':
      return exportToTxt(utterances, options);
    case 'json':
      return exportToJson(utterances, options);
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}

/**
 * Get MIME type for export format
 */
export function getExportMimeType(format: ExportFormat): string {
  switch (format) {
    case 'srt':
      return 'application/x-subrip';
    case 'vtt':
      return 'text/vtt';
    case 'txt':
      return 'text/plain';
    case 'json':
      return 'application/json';
    default:
      return 'text/plain';
  }
}

/**
 * Get file extension for export format
 */
export function getExportExtension(format: ExportFormat): string {
  return `.${format}`;
}

/**
 * Download transcript as file
 */
export function downloadTranscript(
  utterances: StreamingUtterance[],
  format: ExportFormat,
  filename: string,
  options: ExportOptions = {},
): void {
  const content = exportTranscript(utterances, format, options);
  const mimeType = getExportMimeType(format);
  const extension = getExportExtension(format);

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith(extension)
    ? filename
    : `${filename}${extension}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}
