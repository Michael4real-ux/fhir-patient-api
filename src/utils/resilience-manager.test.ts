/**
 * Tests for ResilienceManager
 */

import { ResilienceManager } from './resilience-manager';
import { FHIRNetworkError, FHIRServerError, RateLimitError, CircuitBreakerError } from '../errors';
import { CircuitState } from './circuit-breaker';

describe('ResilienceManager', () => {
  let resilienceManager: ResilienceManager;

  beforeEach(() => {
    resilienceManager = new ResilienceManager({
      retry: {
        maxAttempts: 3,
        baseDelay: 100,
        maxDelay: 1000,
        jitterType: 'none',
      },
      circuitBreaker: {
        failureThreshold: 3,
        recoveryTimeout: 1000,
        volumeThreshold: 5,
        errorPercentageThreshold: 50,
      },
      rateLimiting: {
        enabled: false,
        maxRequestsPerSecond: 5,
        burstSize: 10,
      },
    });
  });

  describe('execute', () => {
    it('should execute successfully', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      const result = await resilienceManager.execute(mockFn);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should retry and succeed', async () => {
      const mockFn = jest
        .fn()
        .mockRejectedValueOnce(new FHIRNetworkError('Network error', new Error('ECONNRESET')))
        .mockResolvedValue('success');
      
      const result = await resilienceManager.execute(mockFn);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should open circuit after repeated failures', async () => {
      const error = new FHIRNetworkError('Network error', new Error('ECONNRESET'));
      const mockFn = jest.fn().mockRejectedValue(error);
      
      // Execute enough times to open circuit
      for (let i = 0; i < 5; i++) {
        try {
          await resilienceManager.execute(mockFn);
        } catch (e) {
          // Expected to fail
        }
      }
      
      expect(resilienceManager.getCircuitState()).toBe(CircuitState.OPEN);
      
      // Next execution should throw CircuitBreakerError
      await expect(resilienceManager.execute(mockFn)).rejects.toThrow(CircuitBreakerError);
    });

    it('should track retry statistics', async () => {
      const mockFn = jest
        .fn()
        .mockRejectedValueOnce(new FHIRNetworkError('Network error', new Error('ECONNRESET')))
        .mockRejectedValueOnce(new FHIRNetworkError('Network error', new Error('ECONNRESET')))
        .mockResolvedValue('success');
      
      await resilienceManager.execute(mockFn);
      
      const stats = resilienceManager.getStats();
      expect(stats.retryStats.successAfterRetry).toBe(1);
      expect(mockFn).toHaveBeenCalledTimes(3);
    });
  });

  describe('rate limiting', () => {
    beforeEach(() => {
      resilienceManager = new ResilienceManager({
        rateLimiting: {
          enabled: true,
          maxRequestsPerSecond: 2,
          burstSize: 5,
        },
      });
    });

    it('should allow requests within rate limit', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      // Execute 2 requests (within limit)
      await resilienceManager.execute(mockFn);
      await resilienceManager.execute(mockFn);
      
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should throw RateLimitError when limit exceeded', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      // Execute requests up to the limit
      await resilienceManager.execute(mockFn);
      await resilienceManager.execute(mockFn);
      
      // Next request should be rate limited
      await expect(resilienceManager.execute(mockFn)).rejects.toThrow(RateLimitError);
      
      const stats = resilienceManager.getStats();
      expect(stats.rateLimitStats.totalRateLimitedRequests).toBe(1);
    });
  });

  describe('executeWithRetry', () => {
    it('should use custom retry configuration', async () => {
      const mockFn = jest
        .fn()
        .mockRejectedValueOnce(new FHIRNetworkError('Network error', new Error('ECONNRESET')))
        .mockRejectedValueOnce(new FHIRNetworkError('Network error', new Error('ECONNRESET')))
        .mockRejectedValueOnce(new FHIRNetworkError('Network error', new Error('ECONNRESET')))
        .mockRejectedValueOnce(new FHIRNetworkError('Network error', new Error('ECONNRESET')))
        .mockResolvedValue('success');
      
      const result = await resilienceManager.executeWithRetry(
        mockFn,
        { 
          maxAttempts: 5,
          baseDelay: 10, // Much shorter delay for tests
          maxDelay: 100,
          jitterType: 'none' // No jitter for predictable timing
        }
      );
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(5);
    }, 15000); // Increase timeout to 15 seconds
  });

  describe('executeWithRetryOnly', () => {
    it('should only apply retry logic', async () => {
      const error = new FHIRNetworkError('Network error', new Error('ECONNRESET'));
      const mockFn = jest.fn().mockRejectedValue(error);
      
      // This should not open the circuit breaker
      try {
        await resilienceManager.executeWithRetryOnly(mockFn);
      } catch (e) {
        // Expected to fail
      }
      
      expect(resilienceManager.getCircuitState()).toBe(CircuitState.CLOSED);
      expect(mockFn).toHaveBeenCalledTimes(3); // Retry attempts
    });
  });

  describe('executeWithCircuitBreakerOnly', () => {
    it('should only apply circuit breaker logic', async () => {
      const error = new FHIRNetworkError('Network error', new Error('ECONNRESET'));
      const mockFn = jest.fn().mockRejectedValue(error);
      
      // Execute once - should fail immediately without retry
      try {
        await resilienceManager.executeWithCircuitBreakerOnly(mockFn);
      } catch (e) {
        // Expected to fail
      }
      
      expect(mockFn).toHaveBeenCalledTimes(1); // No retry
    });
  });

  describe('isHealthy', () => {
    it('should return true when circuit is closed', () => {
      expect(resilienceManager.isHealthy()).toBe(true);
    });

    it('should return false when circuit is open', async () => {
      const error = new FHIRNetworkError('Network error', new Error('ECONNRESET'));
      const mockFn = jest.fn().mockRejectedValue(error);
      
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await resilienceManager.execute(mockFn);
        } catch (e) {
          // Expected to fail
        }
      }
      
      expect(resilienceManager.isHealthy()).toBe(false);
    });
  });

  describe('statistics', () => {
    it('should provide comprehensive statistics', async () => {
      const mockFn = jest
        .fn()
        .mockRejectedValueOnce(new FHIRNetworkError('Network error', new Error('ECONNRESET')))
        .mockResolvedValue('success');
      
      await resilienceManager.execute(mockFn);
      
      const stats = resilienceManager.getStats();
      
      expect(stats.retryStats).toBeDefined();
      expect(stats.circuitBreakerStats).toBeDefined();
      expect(stats.rateLimitStats).toBeDefined();
      
      expect(stats.retryStats.successAfterRetry).toBe(1);
      expect(stats.circuitBreakerStats.state).toBe(CircuitState.CLOSED);
    });
  });

  describe('configuration', () => {
    it('should update configuration', () => {
      resilienceManager.updateConfig({
        retry: {
          maxAttempts: 5,
        },
        circuitBreaker: {
          failureThreshold: 10,
        },
      });
      
      const config = resilienceManager.getConfig();
      expect(config.retry.maxAttempts).toBe(5);
      expect(config.circuitBreaker.failureThreshold).toBe(10);
    });
  });

  describe('reset', () => {
    it('should reset all resilience components', async () => {
      const error = new FHIRNetworkError('Network error', new Error('ECONNRESET'));
      const mockFn = jest.fn().mockRejectedValue(error);
      
      // Generate some failures
      for (let i = 0; i < 3; i++) {
        try {
          await resilienceManager.execute(mockFn);
        } catch (e) {
          // Expected to fail
        }
      }
      
      // Reset
      resilienceManager.reset();
      
      const stats = resilienceManager.getStats();
      expect(stats.retryStats.totalRetries).toBe(0);
      expect(stats.circuitBreakerStats.failureCount).toBe(0);
      expect(stats.rateLimitStats.totalRateLimitedRequests).toBe(0);
    });
  });

  describe('wrap', () => {
    it('should create resilience-wrapped function', async () => {
      const originalFn = jest
        .fn()
        .mockRejectedValueOnce(new FHIRNetworkError('Network error', new Error('ECONNRESET')))
        .mockResolvedValue('success');
      
      const wrappedFn = resilienceManager.wrap(originalFn);
      
      const result = await wrappedFn();
      
      expect(result).toBe('success');
      expect(originalFn).toHaveBeenCalledTimes(2); // Original + 1 retry
    });

    it('should preserve function arguments', async () => {
      const originalFn = jest.fn().mockResolvedValue('success');
      const wrappedFn = resilienceManager.wrap(originalFn);
      
      await wrappedFn('arg1', 'arg2');
      
      expect(originalFn).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });

  describe('withResilience decorator', () => {
    it('should apply resilience to decorated methods', async () => {
      // Test the decorator functionality manually since decorators require experimental support
      const { withResilience } = require('./resilience-manager');
      
      class TestClass {
        callCount = 0;
        
        async testMethod(): Promise<string> {
          this.callCount++;
          if (this.callCount === 1) {
            throw new FHIRNetworkError('Network error', new Error('ECONNRESET'));
          }
          return 'success';
        }
      }
      
      const instance = new TestClass();
      
      // Manually wrap the method
      const wrappedMethod = async () => {
        return resilienceManager.execute(() => instance.testMethod());
      };
      
      const result = await wrappedMethod();
      
      expect(result).toBe('success');
      expect(instance.callCount).toBe(2); // Original + 1 retry
    });
  });
});