/**
 * Retry Manager with exponential backoff and jitter
 *
 * Implements intelligent retry logic for FHIR API requests with
 * exponential backoff, jitter, and configurable retry policies.
 */

import { FHIRError, ErrorContext } from '../errors';

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitterType: 'none' | 'full' | 'equal' | 'decorrelated';
  retryableErrors: string[];
  retryableStatusCodes: number[];
}

export interface RetryContext {
  attempt: number;
  totalAttempts: number;
  lastError?: Error;
  elapsedTime: number;
  nextDelay: number;
}

export type RetryableFunction<T> = () => Promise<T>;

export class RetryManager {
  private config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = {
      maxAttempts: config.maxAttempts ?? 3,
      baseDelay: config.baseDelay ?? 1000,
      maxDelay: config.maxDelay ?? 30000,
      backoffMultiplier: config.backoffMultiplier ?? 2,
      jitterType: config.jitterType ?? 'full',
      retryableErrors: config.retryableErrors ?? [
        'FHIR_NETWORK_ERROR',
        'FHIR_SERVER_ERROR',
        'RATE_LIMIT_ERROR',
      ],
      retryableStatusCodes: config.retryableStatusCodes ?? [
        408, // Request Timeout
        429, // Too Many Requests
        500, // Internal Server Error
        502, // Bad Gateway
        503, // Service Unavailable
        504, // Gateway Timeout
      ],
    };
  }

  /**
   * Execute a function with retry logic
   */
  async execute<T>(
    fn: RetryableFunction<T>,
    context?: Partial<ErrorContext>
  ): Promise<T> {
    const startTime = Date.now();
    let lastError: Error | undefined;
    let delay = this.config.baseDelay;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        const result = await fn();
        
        // If we succeeded after retries, enhance the context to indicate this
        if (attempt > 1 && context) {
          (context as Partial<ErrorContext> & { succeededAfterRetries?: number }).succeededAfterRetries = attempt - 1;
        }
        
        return result;
      } catch (error) {
        lastError = error as Error;
        const elapsedTime = Date.now() - startTime;

        // Check if we should retry
        if (attempt === this.config.maxAttempts || !this.shouldRetry(error as Error)) {
          // Enhance error with retry context
          if (error instanceof FHIRError) {
            // Create enhanced context
            const enhancedContext = {
              ...error.context,
              ...context,
              retryAttempt: attempt,
              totalRetries: this.config.maxAttempts,
              elapsedTime,
            };
            
            // Create new error with enhanced context based on error type
            let enhancedError: FHIRError;
            
            if (error.constructor.name === 'FHIRServerError') {
              const serverError = error as FHIRError & { statusCode: number; operationOutcome?: unknown };
              const ErrorConstructor = error.constructor as new (
                message: string,
                statusCode: number,
                operationOutcome: unknown,
                context: Partial<ErrorContext>,
                details?: string
              ) => FHIRError;
              enhancedError = new ErrorConstructor(
                error.message,
                serverError.statusCode,
                serverError.operationOutcome,
                enhancedContext,
                error.details
              );
            } else if (error.constructor.name === 'FHIRNetworkError') {
              const networkError = error as FHIRError & { originalError: Error };
              const ErrorConstructor = error.constructor as new (
                message: string,
                originalError: Error,
                context: Partial<ErrorContext>,
                details?: string
              ) => FHIRError;
              enhancedError = new ErrorConstructor(
                error.message,
                networkError.originalError,
                enhancedContext,
                error.details
              );
            } else if (error.constructor.name === 'FHIRValidationError') {
              const validationError = error as FHIRError & { field?: string };
              const ErrorConstructor = error.constructor as new (
                message: string,
                field: string | undefined,
                context: Partial<ErrorContext>,
                details?: string
              ) => FHIRError;
              enhancedError = new ErrorConstructor(
                error.message,
                validationError.field,
                enhancedContext,
                error.details
              );
            } else if (error.constructor.name === 'CircuitBreakerError') {
              const circuitError = error as FHIRError & { circuitState: 'OPEN' | 'HALF_OPEN' };
              const ErrorConstructor = error.constructor as new (
                message: string,
                circuitState: 'OPEN' | 'HALF_OPEN',
                context: Partial<ErrorContext>
              ) => FHIRError;
              enhancedError = new ErrorConstructor(
                error.message,
                circuitError.circuitState,
                enhancedContext
              );
            } else if (error.constructor.name === 'RateLimitError') {
              const rateLimitError = error as FHIRError & { retryAfter?: number };
              const ErrorConstructor = error.constructor as new (
                message: string,
                retryAfter: number | undefined,
                context: Partial<ErrorContext>
              ) => FHIRError;
              enhancedError = new ErrorConstructor(
                error.message,
                rateLimitError.retryAfter,
                enhancedContext
              );
            } else {
              // For other error types (AuthenticationError, ConfigurationError)
              const ErrorConstructor = error.constructor as new (
                message: string,
                context: Partial<ErrorContext>,
                details?: string
              ) => FHIRError;
              enhancedError = new ErrorConstructor(
                error.message,
                enhancedContext,
                error.details
              );
            }
            
            throw enhancedError;
          }
          throw error;
        }

        // Calculate delay with jitter
        const actualDelay = this.calculateDelay(delay, attempt);
        
        // Log retry attempt (in production, use proper logging)
        console.warn(
          `Retry attempt ${attempt}/${this.config.maxAttempts} after ${actualDelay}ms delay. Error: ${lastError.message}`
        );

        // Wait before retrying
        await this.sleep(actualDelay);

        // Update delay for next iteration
        delay = Math.min(delay * this.config.backoffMultiplier, this.config.maxDelay);
      }
    }

    // This should never be reached, but TypeScript requires it
    throw lastError || new Error('Retry execution failed');
  }

  /**
   * Check if an error should be retried
   */
  private shouldRetry(error: Error): boolean {
    // Check if it's a FHIR error with retry capability
    if (error instanceof FHIRError) {
      return error.isRetryable();
    }

    // Check for HTTP status codes (if error has statusCode property)
    const errorWithStatus = error as { statusCode?: number; status?: number };
    const statusCode = errorWithStatus.statusCode || errorWithStatus.status;
    if (statusCode && this.config.retryableStatusCodes.includes(statusCode)) {
      return true;
    }

    // Check for specific network error patterns
    const message = error.message.toLowerCase();
    const retryablePatterns = [
      'timeout',
      'etimedout',
      'econnreset',
      'econnaborted',
      'socket hang up',
      'network error',
    ];

    return retryablePatterns.some(pattern => message.includes(pattern));
  }

  /**
   * Calculate delay with jitter
   */
  private calculateDelay(baseDelay: number, _attempt: number): number {
    let delay = baseDelay;

    switch (this.config.jitterType) {
      case 'none':
        // No jitter, use base delay
        break;
      
      case 'full':
        // Full jitter: random value between 0 and delay
        delay = Math.random() * delay;
        break;
      
      case 'equal':
        // Equal jitter: base delay + random value between 0 and delay
        delay = delay + Math.random() * delay;
        break;
      
      case 'decorrelated':
        // Decorrelated jitter: random value between base delay and 3 * previous delay
        delay = Math.random() * (3 * delay - this.config.baseDelay) + this.config.baseDelay;
        break;
    }

    return Math.min(Math.max(delay, 0), this.config.maxDelay);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current retry configuration
   */
  getConfig(): Readonly<RetryConfig> {
    return { ...this.config };
  }

  /**
   * Update retry configuration
   */
  updateConfig(config: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Default retry manager instance
 */
export const defaultRetryManager = new RetryManager();

/**
 * Retry decorator for methods
 */
export function withRetry<T extends any[], R>(
  retryManager: RetryManager = defaultRetryManager
) {
  return function (
    _target: object,
    _propertyKey: string,
    descriptor: TypedPropertyDescriptor<(...args: T) => Promise<R>>
  ) {
    const originalMethod = descriptor.value!;

    descriptor.value = async function (...args: T): Promise<R> {
      return retryManager.execute(() => originalMethod.apply(this, args));
    };

    return descriptor;
  };
}