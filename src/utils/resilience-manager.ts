/**
 * Resilience Manager
 *
 * Combines retry logic and circuit breaker pattern for comprehensive
 * error handling and resilience in FHIR API operations.
 */

import { RetryManager, RetryConfig } from './retry-manager';
import { CircuitBreaker, CircuitBreakerConfig, CircuitState } from './circuit-breaker';
import { ErrorContext, FHIRError, RateLimitError } from '../errors';

export interface ResilienceConfig {
  retry: Partial<RetryConfig>;
  circuitBreaker: Partial<CircuitBreakerConfig>;
  rateLimiting: {
    enabled: boolean;
    maxRequestsPerSecond: number;
    burstSize: number;
  };
}

export interface ResilienceStats {
  retryStats: {
    totalRetries: number;
    successAfterRetry: number;
    failedAfterAllRetries: number;
  };
  circuitBreakerStats: ReturnType<CircuitBreaker['getStats']>;
  rateLimitStats: {
    requestsInLastSecond: number;
    totalRateLimitedRequests: number;
  };
}

export type ResilienceFunction<T> = () => Promise<T>;

export class ResilienceManager {
  private retryManager: RetryManager;
  private circuitBreaker: CircuitBreaker;
  private config: ResilienceConfig;
  
  // Rate limiting state
  private requestTimestamps: number[] = [];
  private totalRateLimitedRequests = 0;
  
  // Statistics
  private totalRetries = 0;
  private successAfterRetry = 0;
  private failedAfterAllRetries = 0;

  constructor(config: Partial<ResilienceConfig> = {}) {
    this.config = {
      retry: config.retry || {},
      circuitBreaker: config.circuitBreaker || {},
      rateLimiting: {
        enabled: config.rateLimiting?.enabled ?? false,
        maxRequestsPerSecond: config.rateLimiting?.maxRequestsPerSecond ?? 10,
        burstSize: config.rateLimiting?.burstSize ?? 20,
      },
    };

    this.retryManager = new RetryManager(this.config.retry);
    this.circuitBreaker = new CircuitBreaker(this.config.circuitBreaker);
  }

  /**
   * Execute a function with full resilience protection
   */
  async execute<T>(
    fn: ResilienceFunction<T>,
    context?: Partial<ErrorContext>
  ): Promise<T> {
    // Apply rate limiting if enabled
    if (this.config.rateLimiting.enabled) {
      await this.applyRateLimit();
    }

    // Execute with circuit breaker and retry logic
    const enhancedContext = { ...context };
    
    return this.circuitBreaker.execute(async () => {
      try {
        const result = await this.retryManager.execute(fn, enhancedContext);
        
        // Check if we succeeded after retries
        const contextWithRetries = enhancedContext as Partial<ErrorContext> & { succeededAfterRetries?: number };
        if (contextWithRetries.succeededAfterRetries) {
          this.successAfterRetry++;
          this.totalRetries += contextWithRetries.succeededAfterRetries;
        }
        
        return result;
      } catch (error) {
        // Check if retry was attempted by looking at error context
        if (error instanceof FHIRError && error.context?.retryAttempt) {
          const retryAttempts = error.context.retryAttempt - 1;
          this.totalRetries += retryAttempts;
          
          if (retryAttempts > 0) {
            this.failedAfterAllRetries++;
          }
        }
        
        throw error;
      }
    }, enhancedContext);
  }

  /**
   * Apply rate limiting
   */
  private async applyRateLimit(): Promise<void> {
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    
    // Clean up old timestamps
    this.requestTimestamps = this.requestTimestamps.filter(
      timestamp => timestamp > oneSecondAgo
    );
    
    // Check if we're within rate limits
    if (this.requestTimestamps.length >= this.config.rateLimiting.maxRequestsPerSecond) {
      this.totalRateLimitedRequests++;
      
      // Calculate delay until we can make the next request
      const oldestRequest = Math.min(...this.requestTimestamps);
      const delay = 1000 - (now - oldestRequest);
      
      if (delay > 0) {
        throw new RateLimitError(
          'Rate limit exceeded',
          Math.ceil(delay / 1000),
          {
            timestamp: new Date().toISOString(),
            correlationId: `rate-limit-${now}`,
            requestsInLastSecond: this.requestTimestamps.length,
            maxRequestsPerSecond: this.config.rateLimiting.maxRequestsPerSecond,
          }
        );
      }
    }
    
    // Record this request
    this.requestTimestamps.push(now);
  }

  /**
   * Execute with custom retry configuration
   */
  async executeWithRetry<T>(
    fn: ResilienceFunction<T>,
    retryConfig: Partial<RetryConfig>,
    context?: Partial<ErrorContext>
  ): Promise<T> {
    const customRetryManager = new RetryManager(retryConfig);
    
    return this.circuitBreaker.execute(async () => {
      return customRetryManager.execute(fn, context);
    }, context);
  }

  /**
   * Execute without circuit breaker (retry only)
   */
  async executeWithRetryOnly<T>(
    fn: ResilienceFunction<T>,
    context?: Partial<ErrorContext>
  ): Promise<T> {
    return this.retryManager.execute(fn, context);
  }

  /**
   * Execute without retry (circuit breaker only)
   */
  async executeWithCircuitBreakerOnly<T>(
    fn: ResilienceFunction<T>,
    context?: Partial<ErrorContext>
  ): Promise<T> {
    return this.circuitBreaker.execute(fn, context);
  }

  /**
   * Check if service is healthy
   */
  isHealthy(): boolean {
    return this.circuitBreaker.isHealthy();
  }

  /**
   * Get circuit breaker state
   */
  getCircuitState(): CircuitState {
    return this.circuitBreaker.getState();
  }

  /**
   * Get comprehensive resilience statistics
   */
  getStats(): ResilienceStats {
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    const requestsInLastSecond = this.requestTimestamps.filter(
      timestamp => timestamp > oneSecondAgo
    ).length;

    return {
      retryStats: {
        totalRetries: this.totalRetries,
        successAfterRetry: this.successAfterRetry,
        failedAfterAllRetries: this.failedAfterAllRetries,
      },
      circuitBreakerStats: this.circuitBreaker.getStats(),
      rateLimitStats: {
        requestsInLastSecond,
        totalRateLimitedRequests: this.totalRateLimitedRequests,
      },
    };
  }

  /**
   * Reset all resilience components
   */
  reset(): void {
    this.circuitBreaker.reset();
    this.requestTimestamps = [];
    this.totalRateLimitedRequests = 0;
    this.totalRetries = 0;
    this.successAfterRetry = 0;
    this.failedAfterAllRetries = 0;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ResilienceConfig>): void {
    this.config = {
      retry: { ...this.config.retry, ...config.retry },
      circuitBreaker: { ...this.config.circuitBreaker, ...config.circuitBreaker },
      rateLimiting: { ...this.config.rateLimiting, ...config.rateLimiting },
    };

    this.retryManager.updateConfig(this.config.retry);
    this.circuitBreaker.updateConfig(this.config.circuitBreaker);
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<ResilienceConfig> {
    return JSON.parse(JSON.stringify(this.config));
  }

  /**
   * Create a resilience-wrapped function
   */
  wrap<T extends any[], R>(
    fn: (...args: T) => Promise<R>
  ): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
      return this.execute(() => fn(...args));
    };
  }
}

/**
 * Default resilience manager instance
 */
export const defaultResilienceManager = new ResilienceManager({
  retry: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    jitterType: 'full',
  },
  circuitBreaker: {
    failureThreshold: 5,
    recoveryTimeout: 30000,
    volumeThreshold: 10,
    errorPercentageThreshold: 50,
  },
  rateLimiting: {
    enabled: false,
    maxRequestsPerSecond: 10,
    burstSize: 20,
  },
});

/**
 * Resilience decorator for methods
 */
export function withResilience(
  resilienceManager: ResilienceManager = defaultResilienceManager
) {
  return function <T extends any[], R>(
    _target: any,
    _propertyKey: string,
    descriptor: TypedPropertyDescriptor<(...args: T) => Promise<R>>
  ) {
    const originalMethod = descriptor.value!;

    descriptor.value = async function (...args: T): Promise<R> {
      return resilienceManager.execute(() => originalMethod.apply(this, args));
    };

    return descriptor;
  };
}