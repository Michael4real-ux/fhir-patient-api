/**
 * Circuit Breaker implementation for FHIR API resilience
 *
 * Implements the circuit breaker pattern to prevent cascading failures
 * and provide fast failure when a service is unavailable.
 */

import { CircuitBreakerError, FHIRError, ErrorContext } from '../errors';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringPeriod: number;
  expectedErrors: string[];
  volumeThreshold: number;
  errorPercentageThreshold: number;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  totalRequests: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  stateChangedAt: number;
  errorPercentage: number;
}

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export type CircuitBreakerFunction<T> = () => Promise<T>;

export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private totalRequests = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;
  private stateChangedAt = Date.now();
  private requestHistory: Array<{ timestamp: number; success: boolean }> = [];

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: config.failureThreshold ?? 5,
      recoveryTimeout: config.recoveryTimeout ?? 60000, // 1 minute
      monitoringPeriod: config.monitoringPeriod ?? 300000, // 5 minutes
      expectedErrors: config.expectedErrors ?? [
        'FHIR_SERVER_ERROR',
        'FHIR_NETWORK_ERROR',
      ],
      volumeThreshold: config.volumeThreshold ?? 10,
      errorPercentageThreshold: config.errorPercentageThreshold ?? 50,
    };
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(
    fn: CircuitBreakerFunction<T>,
    context?: Partial<ErrorContext>
  ): Promise<T> {
    // Check circuit state before execution
    this.updateState();

    if (this.state === CircuitState.OPEN) {
      throw new CircuitBreakerError(
        'Circuit breaker is OPEN - service unavailable',
        this.state,
        {
          ...context,
          circuitStats: this.getStats(),
        }
      );
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.successCount++;
    this.totalRequests++;
    this.lastSuccessTime = Date.now();

    this.addToHistory(true);

    // If we're in HALF_OPEN state and got a success, close the circuit
    if (this.state === CircuitState.HALF_OPEN) {
      this.setState(CircuitState.CLOSED);
      this.resetCounts();
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(error: Error): void {
    this.totalRequests++;

    // Only count failures for expected error types
    if (this.isExpectedError(error)) {
      this.failureCount++;
      this.lastFailureTime = Date.now();
      this.addToHistory(false);

      // Check if we should open the circuit
      if (this.shouldOpenCircuit()) {
        this.setState(CircuitState.OPEN);
      }
    } else {
      // For unexpected errors, still record as success to avoid opening circuit
      this.addToHistory(true);
    }
  }

  /**
   * Check if error is expected (should count towards circuit breaker)
   */
  private isExpectedError(error: Error): boolean {
    if (error instanceof FHIRError) {
      // For FHIR errors, check if they're in the expected list AND if they're retryable
      const isInExpectedList = this.config.expectedErrors.includes(error.code);
      if (!isInExpectedList) {
        return false;
      }

      // For server errors, also check the status code
      if (error.code === 'FHIR_SERVER_ERROR') {
        const serverError = error as FHIRError & { statusCode?: number };
        if (serverError.statusCode) {
          // Only server errors (5xx) and rate limiting (429) should trigger circuit breaker
          // Client errors (4xx) should not trigger circuit breaker
          return (
            serverError.statusCode >= 500 || serverError.statusCode === 429
          );
        }
      }

      return true;
    }

    // Check for HTTP status codes that should trigger circuit breaker
    const errorWithStatus = error as { statusCode?: number; status?: number };
    const statusCode = errorWithStatus.statusCode || errorWithStatus.status;
    if (statusCode) {
      // Only server errors (5xx) and rate limiting (429) should trigger circuit breaker
      // Client errors (4xx) should not trigger circuit breaker
      return statusCode >= 500 || statusCode === 429;
    }

    // Network errors should trigger circuit breaker
    const message = error.message.toLowerCase();
    const networkErrorPatterns = [
      'timeout',
      'etimedout',
      'econnrefused',
      'econnreset',
      'enotfound',
      'network error',
    ];

    return networkErrorPatterns.some(pattern => message.includes(pattern));
  }

  /**
   * Check if circuit should be opened
   */
  private shouldOpenCircuit(): boolean {
    // Need minimum volume of requests
    if (this.totalRequests < this.config.volumeThreshold) {
      return false;
    }

    // Check failure threshold
    if (this.failureCount >= this.config.failureThreshold) {
      return true;
    }

    // Check error percentage
    const errorPercentage = this.calculateErrorPercentage();
    return errorPercentage >= this.config.errorPercentageThreshold;
  }

  /**
   * Calculate error percentage over monitoring period
   */
  private calculateErrorPercentage(): number {
    const now = Date.now();
    const cutoff = now - this.config.monitoringPeriod;

    const recentRequests = this.requestHistory.filter(
      req => req.timestamp > cutoff
    );

    if (recentRequests.length === 0) {
      return 0;
    }

    const failures = recentRequests.filter(req => !req.success).length;
    return (failures / recentRequests.length) * 100;
  }

  /**
   * Add request to history
   */
  private addToHistory(success: boolean): void {
    const now = Date.now();
    this.requestHistory.push({ timestamp: now, success });

    // Clean up old entries
    const cutoff = now - this.config.monitoringPeriod;
    this.requestHistory = this.requestHistory.filter(
      req => req.timestamp > cutoff
    );
  }

  /**
   * Update circuit state based on time and conditions
   */
  private updateState(): void {
    if (this.state === CircuitState.OPEN) {
      const now = Date.now();
      const timeSinceStateChange = now - this.stateChangedAt;

      if (timeSinceStateChange >= this.config.recoveryTimeout) {
        this.setState(CircuitState.HALF_OPEN);
      }
    }
  }

  /**
   * Set circuit state
   */
  private setState(newState: CircuitState): void {
    if (this.state !== newState) {
      const oldState = this.state;
      this.state = newState;
      this.stateChangedAt = Date.now();

      console.info(
        `Circuit breaker state changed from ${oldState} to ${newState}`,
        this.getStats()
      );
    }
  }

  /**
   * Reset failure and success counts
   */
  private resetCounts(): void {
    this.failureCount = 0;
    this.successCount = 0;
    this.totalRequests = 0;
    this.requestHistory = [];
  }

  /**
   * Get current circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalRequests: this.totalRequests,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      stateChangedAt: this.stateChangedAt,
      errorPercentage: this.calculateErrorPercentage(),
    };
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    this.updateState();
    return this.state;
  }

  /**
   * Manually reset circuit breaker
   */
  reset(): void {
    this.setState(CircuitState.CLOSED);
    this.resetCounts();
    this.lastFailureTime = undefined;
    this.lastSuccessTime = undefined;
  }

  /**
   * Check if circuit is healthy
   */
  isHealthy(): boolean {
    this.updateState();
    return this.state === CircuitState.CLOSED;
  }

  /**
   * Get configuration
   */
  getConfig(): Readonly<CircuitBreakerConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<CircuitBreakerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Circuit breaker decorator for methods
 */
export function withCircuitBreaker(circuitBreaker: CircuitBreaker) {
  return function <T extends unknown[], R>(
    _target: object,
    _propertyKey: string,
    descriptor: TypedPropertyDescriptor<(...args: T) => Promise<R>>
  ) {
    const originalMethod = descriptor.value!;

    descriptor.value = async function (...args: T): Promise<R> {
      return circuitBreaker.execute(() => originalMethod.apply(this, args));
    };

    return descriptor;
  };
}
