/**
 * Python 任务状态枚举
 */
export enum PythonTaskState {
  PENDING = 'PENDING',
  STARTED = 'STARTED',
  RETRY = 'RETRY',
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
  REVOKED = 'REVOKED',
}

/**
 * Python 任务状态类型（字符串字面量联合类型，用于类型兼容）
 */
export type PythonTaskStateType =
  | 'PENDING'
  | 'STARTED'
  | 'RETRY'
  | 'SUCCESS'
  | 'FAILURE'
  | 'REVOKED';

/**
 * 创建任务请求参数
 */
export interface CreateTaskRequest {
  /** 任务名称（Python 任务路径） */
  name: string;
  /** 任务参数 */
  params: Record<string, any>;
  /** 回调 URL（任务完成后通知） */
  callback?: string;
}

/**
 * 创建任务响应
 */
export interface CreateTaskResponse {
  /** 任务 ID */
  id: string;
  /** 任务状态 */
  state: PythonTaskStateType;
  /** 创建时间 */
  created_at?: string;
}

/**
 * 任务状态响应
 */
export interface TaskStatusResponse {
  /** 任务 ID */
  id: string;
  /** 任务名称 */
  name?: string;
  /** 任务状态 */
  state: PythonTaskStateType;
  /** 是否完成 */
  ready: boolean;
  /** 进度（0-100） */
  progress?: number;
  /** 当前步骤描述 */
  current_step?: string;
  /** 任务结果（成功时） */
  result?: any;
  /** 错误信息（失败时） */
  error?: string;
  /** 创建时间 */
  created_at?: string;
  /** 开始时间 */
  started_at?: string;
  /** 完成时间 */
  completed_at?: string;
}

/**
 * 取消任务响应
 */
export interface CancelTaskResponse {
  /** 是否成功 */
  success: boolean;
  /** 消息 */
  message?: string;
}
