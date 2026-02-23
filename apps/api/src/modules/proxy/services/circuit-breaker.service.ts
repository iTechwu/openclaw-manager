import { Inject, Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

/**
 * 断路器状态
 */
type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * 断路器状态数据
 */
interface CircuitData {
  status: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailure: number;
  lastStateChange: number;
}

/**
 * 断路器配置
 */
export interface CircuitBreakerConfig {
  /** 连续失败次数阈值，超过后打开断路器 */
  failureThreshold: number;
  /** 半开状态下成功次数阈值，超过后关闭断路器 */
  successThreshold: number;
  /** 断路器打开后，多久后进入半开状态（毫秒） */
  openTimeout: number;
  /** 半开状态下允许的请求数 */
  halfOpenMaxRequests: number;
}

/** DI token，用于可选注入断路器配置（不提供则使用默认配置） */
export const CIRCUIT_BREAKER_CONFIG = 'CIRCUIT_BREAKER_CONFIG';

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  openTimeout: 30000, // 30 秒
  halfOpenMaxRequests: 3,
};

/**
 * CircuitBreakerService - Provider 断路器服务
 *
 * 当某个 Provider 持续失败时，断路器会打开，阻止请求发送到该 Provider，
 * 避免请求延迟和资源浪费。一段时间后会进入半开状态，允许少量请求通过，
 * 如果成功则关闭断路器，否则重新打开。
 *
 * 状态转换：
 * - closed → open: 连续失败次数超过阈值
 * - open → half-open: 超时后
 * - half-open → closed: 成功次数超过阈值
 * - half-open → open: 再次失败
 */
@Injectable()
export class CircuitBreakerService implements OnModuleDestroy {
  private readonly circuits = new Map<string, CircuitData>();
  private readonly config: CircuitBreakerConfig;

  // 定期清理过期的断路器状态
  private cleanupInterval?: NodeJS.Timeout;
  private readonly cleanupIntervalMs = 60 * 1000; // 每分钟清理
  private readonly maxInactiveTime = 10 * 60 * 1000; // 10 分钟未活动的断路器将被清理

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    @Optional()
    @Inject(CIRCUIT_BREAKER_CONFIG)
    config?: Partial<CircuitBreakerConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cleanupInterval = setInterval(
      () => this.cleanup(),
      this.cleanupIntervalMs,
    );
  }

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  /**
   * 检查 Provider 是否可用（断路器是否关闭或半开）
   */
  isAvailable(providerKeyId: string): boolean {
    const circuit = this.circuits.get(providerKeyId);

    if (!circuit) {
      return true; // 无记录表示正常
    }

    if (circuit.status === 'closed') {
      return true;
    }

    if (circuit.status === 'open') {
      // 检查是否应该进入半开状态
      const now = Date.now();
      if (now - circuit.lastFailure >= this.config.openTimeout) {
        this.transitionTo(providerKeyId, 'half-open');
        return true;
      }
      return false;
    }

    // half-open 状态下允许请求
    return true;
  }

  /**
   * 记录成功
   */
  recordSuccess(providerKeyId: string): void {
    const circuit = this.circuits.get(providerKeyId);

    if (!circuit) {
      return; // 无记录表示正常，不需要处理
    }

    if (circuit.status === 'half-open') {
      circuit.successCount++;
      if (circuit.successCount >= this.config.successThreshold) {
        this.transitionTo(providerKeyId, 'closed');
        this.logger.info(
          `[CircuitBreaker] Provider ${providerKeyId.substring(0, 8)}... recovered, circuit CLOSED`,
        );
      }
    } else if (circuit.status === 'closed') {
      // 重置失败计数
      circuit.failureCount = 0;
    }
  }

  /**
   * 记录失败
   */
  recordFailure(providerKeyId: string, error?: string): void {
    let circuit = this.circuits.get(providerKeyId);

    if (!circuit) {
      circuit = this.createCircuit(providerKeyId);
    }

    circuit.failureCount++;
    circuit.lastFailure = Date.now();

    if (circuit.status === 'half-open') {
      // 半开状态下失败，立即打开
      this.transitionTo(providerKeyId, 'open');
      this.logger.warn(
        `[CircuitBreaker] Provider ${providerKeyId.substring(0, 8)}... failed in half-open, circuit OPEN`,
        { error },
      );
    } else if (circuit.status === 'closed') {
      if (circuit.failureCount >= this.config.failureThreshold) {
        this.transitionTo(providerKeyId, 'open');
        this.logger.warn(
          `[CircuitBreaker] Provider ${providerKeyId.substring(0, 8)}... threshold exceeded (${circuit.failureCount} failures), circuit OPEN`,
          { error },
        );
      }
    }
  }

  /**
   * 获取 Provider 的断路器状态
   */
  getStatus(providerKeyId: string): CircuitState | null {
    const circuit = this.circuits.get(providerKeyId);
    return circuit?.status ?? null;
  }

  /**
   * 获取所有打开的断路器
   */
  getOpenCircuits(): string[] {
    const now = Date.now();
    const openCircuits: string[] = [];

    for (const [id, circuit] of this.circuits) {
      if (circuit.status === 'open') {
        // 检查是否应该进入半开状态
        if (now - circuit.lastFailure >= this.config.openTimeout) {
          this.transitionTo(id, 'half-open');
        } else {
          openCircuits.push(id);
        }
      }
    }

    return openCircuits;
  }

  /**
   * 手动重置断路器
   */
  reset(providerKeyId: string): void {
    this.circuits.delete(providerKeyId);
    this.logger.info(
      `[CircuitBreaker] Provider ${providerKeyId.substring(0, 8)}... manually reset`,
    );
  }

  /**
   * 重置所有断路器
   */
  resetAll(): void {
    this.circuits.clear();
    this.logger.info('[CircuitBreaker] All circuits reset');
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    total: number;
    closed: number;
    open: number;
    halfOpen: number;
  } {
    let closed = 0;
    let open = 0;
    let halfOpen = 0;

    for (const circuit of this.circuits.values()) {
      switch (circuit.status) {
        case 'closed':
          closed++;
          break;
        case 'open':
          open++;
          break;
        case 'half-open':
          halfOpen++;
          break;
      }
    }

    return {
      total: this.circuits.size,
      closed,
      open,
      halfOpen,
    };
  }

  /**
   * 创建新的断路器
   */
  private createCircuit(providerKeyId: string): CircuitData {
    const circuit: CircuitData = {
      status: 'closed',
      failureCount: 0,
      successCount: 0,
      lastFailure: 0,
      lastStateChange: Date.now(),
    };
    this.circuits.set(providerKeyId, circuit);
    return circuit;
  }

  /**
   * 状态转换
   */
  private transitionTo(providerKeyId: string, newStatus: CircuitState): void {
    const circuit = this.circuits.get(providerKeyId);
    if (!circuit) return;

    const oldStatus = circuit.status;
    circuit.status = newStatus;
    circuit.lastStateChange = Date.now();

    // 重置计数器
    if (newStatus === 'closed') {
      circuit.failureCount = 0;
      circuit.successCount = 0;
    } else if (newStatus === 'half-open') {
      circuit.successCount = 0;
    }

    this.logger.debug(
      `[CircuitBreaker] Provider ${providerKeyId.substring(0, 8)}... state changed: ${oldStatus} → ${newStatus}`,
    );
  }

  /**
   * 清理长时间未活动的断路器
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, circuit] of this.circuits) {
      const inactiveTime =
        now - Math.max(circuit.lastFailure, circuit.lastStateChange);
      if (inactiveTime > this.maxInactiveTime && circuit.status === 'closed') {
        this.circuits.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(
        `[CircuitBreaker] Cleaned up ${cleaned} inactive circuits`,
      );
    }
  }
}
