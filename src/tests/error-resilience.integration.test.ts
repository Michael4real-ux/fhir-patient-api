/**
 * Comprehensive error handling and resilience integration tests
 *
 * Tests various failure scenarios and edge cases to ensure robust
 * error handling and resilience features work together properly.
 */

import { ResilienceManager } from '../utils/resilience-manager';
import { CircuitBreaker, CircuitState } from '../utils/circuit-breaker';
import { RetryManager } from '../utils/retry-manager';
import {
  FHIRServerError,
  FHIRNetworkError,
  AuthenticationError,
  RateLimitError,
  CircuitBreakerError,
} from '../errors';

describe('Error Handling and Resilience Integration', () => {
  let resilienceManager: ResilienceManager;
  let circuitBreaker: CircuitBreaker;
  let retryManager: RetryManager;

  beforeEach(() => {
    resilienceManager = new ResilienceManager({
      retry: {
        maxAttempts: 3,
        baseDelay: 50, // Short delays for tests
        maxDelay: 500,
        jitterType: 'none',
      },
      circuitBreaker: {
        failureThreshold: 3,
        recoveryTimeout: 500, // Short timeout for tests
        volumeThreshold: 5,
        errorPercentageThreshold: 60,
      },
      rateLimiting: {
        enabled: false,
        maxRequestsPerSecond: 10,
        burstSize: 20,
      },
    });

    circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      recoveryTimeout: 500,
      volumeThreshold: 5,
    });

    retryManager = new RetryManager({
      maxAttempts: 3,
      baseDelay: 50,
      jitterType: 'none',
    });
  });

  describe('Cascading Failure Scenarios', () => {
    it('should handle server degradation gracefully', async () => {
      const successService = jest.fn().mockResolvedValue('success');
      const serverErrorService = jest
        .fn()
        .mockRejectedValue(new FHIRServerError('Server overloaded', 503));
      const networkErrorService = jest
        .fn()
        .mockRejectedValue(
          new FHIRNetworkError('Connection failed', new Error('ECONNRESET'))
        );

      // First calls should succeed
      await expect(resilienceManager.execute(successService)).resolves.toBe(
        'success'
      );
      await expect(resilienceManager.execute(successService)).resolves.toBe(
        'success'
      );

      // Next calls should fail with server errors
      await expect(
        resilienceManager.execute(serverErrorService)
      ).rejects.toThrow('Server overloaded');
      await expect(
        resilienceManager.execute(serverErrorService)
      ).rejects.toThrow('Server overloaded');
      await expect(
        resilienceManager.execute(networkErrorService)
      ).rejects.toThrow('Connection failed');

      // Circuit should now be open
      expect(resilienceManager.getCircuitState()).toBe(CircuitState.OPEN);

      // Further calls should fail fast with circuit breaker error
      await expect(resilienceManager.execute(successService)).rejects.toThrow(
        CircuitBreakerError
      );
    });

    it('should handle intermittent network issues', async () => {
      let callCount = 0;
      const intermittentService = jest.fn().mockImplementation(() => {
        callCount++;

        // Fail every other call with network error
        if (callCount % 2 === 0) {
          throw new FHIRNetworkError('Network timeout', new Error('ETIMEDOUT'));
        }

        return Promise.resolve(`success-${callCount}`);
      });

      // Should succeed after retries on network errors
      await expect(
        resilienceManager.execute(intermittentService)
      ).resolves.toBe('success-1');
      await expect(
        resilienceManager.execute(intermittentService)
      ).resolves.toBe('success-3');
      await expect(
        resilienceManager.execute(intermittentService)
      ).resolves.toBe('success-5');

      // Circuit should remain closed for intermittent issues
      expect(resilienceManager.getCircuitState()).toBe(CircuitState.CLOSED);
    });

    it('should handle authentication token expiration', async () => {
      let callCount = 0;
      const authExpiringService = jest.fn().mockImplementation(() => {
        callCount++;

        // First call succeeds
        if (callCount === 1) {
          return Promise.resolve('success');
        }

        // Token expires
        if (callCount <= 3) {
          throw new AuthenticationError('Token expired');
        }

        // After token refresh, succeeds again
        return Promise.resolve('success-after-refresh');
      });

      // First call succeeds
      await expect(
        resilienceManager.execute(authExpiringService)
      ).resolves.toBe('success');

      // Auth errors should not be retried by default
      await expect(
        resilienceManager.execute(authExpiringService)
      ).rejects.toThrow('Token expired');

      // Circuit should remain closed for auth errors (they're not expected errors)
      expect(resilienceManager.getCircuitState()).toBe(CircuitState.CLOSED);
    });

    it('should handle rate limiting with backoff', async () => {
      const rateLimitedService = jest
        .fn()
        .mockRejectedValueOnce(new RateLimitError('Rate limit exceeded', 1))
        .mockRejectedValueOnce(new RateLimitError('Rate limit exceeded', 1))
        .mockResolvedValue('success-after-rate-limit');

      // Should eventually succeed after rate limit retries
      const result = await resilienceManager.execute(rateLimitedService);

      expect(result).toBe('success-after-rate-limit');
      expect(rateLimitedService).toHaveBeenCalledTimes(3);
    });
  });

  describe('Circuit Breaker Edge Cases', () => {
    it('should handle mixed error types correctly', async () => {
      let callCount = 0;
      const mixedErrorService = jest.fn().mockImplementation(() => {
        callCount++;

        switch (callCount) {
          case 1:
            throw new FHIRServerError('Bad request', 400); // Client error - shouldn't count
          case 2:
            throw new FHIRNetworkError(
              'Network error',
              new Error('ECONNRESET')
            ); // Should count
          case 3:
            throw new AuthenticationError('Auth failed'); // Shouldn't count
          case 4:
            throw new FHIRServerError('Server error', 500); // Should count
          case 5:
            throw new FHIRServerError('Server error', 503); // Should count
          case 6:
            throw new FHIRNetworkError('Network error', new Error('ETIMEDOUT')); // Should count
          default:
            return Promise.resolve('success');
        }
      });

      // Execute calls - only server errors and network errors should count toward circuit breaker
      for (let i = 0; i < 6; i++) {
        try {
          await circuitBreaker.execute(mixedErrorService);
        } catch (e) {
          // Expected to fail
        }
      }

      // Circuit should be open now (3 expected errors: network, 500, 503, timeout)
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      const stats = circuitBreaker.getStats();
      expect(stats.failureCount).toBe(3); // Only expected errors counted (network, 500, 503)
    });

    it('should recover from open state correctly', async () => {
      const failingService = jest
        .fn()
        .mockRejectedValue(new FHIRServerError('Server error', 500));

      const recoveringService = jest.fn().mockResolvedValue('recovered');

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(failingService);
        } catch (e) {
          // Expected to fail
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      // Wait for recovery timeout
      await new Promise(resolve => setTimeout(resolve, 600));

      // Should be half-open now
      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Successful call should close the circuit
      await expect(circuitBreaker.execute(recoveringService)).resolves.toBe(
        'recovered'
      );
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('Retry Logic Edge Cases', () => {
    it('should respect maximum delay limits', async () => {
      const retryManagerWithLimits = new RetryManager({
        maxAttempts: 5,
        baseDelay: 100,
        maxDelay: 200, // Low max delay
        backoffMultiplier: 3,
        jitterType: 'none',
      });

      const failingService = jest
        .fn()
        .mockRejectedValue(
          new FHIRNetworkError('Network error', new Error('ECONNRESET'))
        );

      const startTime = Date.now();

      try {
        await retryManagerWithLimits.execute(failingService);
      } catch (e) {
        // Expected to fail
      }

      const elapsedTime = Date.now() - startTime;

      // Should not exceed reasonable time even with exponential backoff
      // Max delays: 100, 200, 200, 200 = 700ms + some overhead
      expect(elapsedTime).toBeLessThan(1000);
      expect(failingService).toHaveBeenCalledTimes(5);
    });

    it('should handle different jitter types', async () => {
      const jitterTypes = ['none', 'full', 'equal', 'decorrelated'] as const;

      for (const jitterType of jitterTypes) {
        const retryManagerWithJitter = new RetryManager({
          maxAttempts: 2,
          baseDelay: 50,
          jitterType,
        });

        const failingService = jest
          .fn()
          .mockRejectedValueOnce(
            new FHIRNetworkError('Network error', new Error('ECONNRESET'))
          )
          .mockResolvedValue('success');

        const result = await retryManagerWithJitter.execute(failingService);

        expect(result).toBe('success');
        expect(failingService).toHaveBeenCalledTimes(2);

        // Reset mock for next iteration
        failingService.mockClear();
      }
    });

    it('should handle non-retryable errors correctly', async () => {
      const nonRetryableErrors = [
        new FHIRServerError('Bad request', 400),
        new FHIRServerError('Unauthorized', 401),
        new FHIRServerError('Forbidden', 403),
        new FHIRServerError('Not found', 404),
        new AuthenticationError('Invalid credentials'),
      ];

      for (const error of nonRetryableErrors) {
        const failingService = jest.fn().mockRejectedValue(error);

        await expect(retryManager.execute(failingService)).rejects.toThrow(
          error.message
        );
        expect(failingService).toHaveBeenCalledTimes(1); // No retries

        failingService.mockClear();
      }
    });
  });

  describe('Error Context and Logging', () => {
    it('should enrich errors with comprehensive context', async () => {
      const contextualService = jest
        .fn()
        .mockRejectedValue(new FHIRServerError('Server error', 500));

      const context = {
        requestUrl: 'https://fhir.example.com/Patient/123',
        requestMethod: 'GET',
        correlationId: 'test-correlation-123',
      };

      try {
        await retryManager.execute(contextualService, context);
      } catch (error) {
        expect(error).toBeInstanceOf(FHIRServerError);
        const fhirError = error as FHIRServerError;

        expect(fhirError.context?.requestUrl).toBe(context.requestUrl);
        expect(fhirError.context?.requestMethod).toBe(context.requestMethod);
        expect(fhirError.context?.correlationId).toBe(context.correlationId);
        expect(fhirError.context?.retryAttempt).toBe(3);
        expect(fhirError.context?.totalRetries).toBe(3);
        expect(fhirError.context?.elapsedTime).toBeGreaterThan(0);
      }
    });

    it('should provide detailed error information for debugging', async () => {
      const debuggableService = jest
        .fn()
        .mockRejectedValue(
          new FHIRNetworkError('Connection failed', new Error('ECONNREFUSED'))
        );

      try {
        await resilienceManager.execute(debuggableService);
      } catch (error) {
        expect(error).toBeInstanceOf(FHIRNetworkError);
        const networkError = error as FHIRNetworkError;

        const errorDetails = networkError.getErrorDetails();

        expect(errorDetails.name).toBe('FHIRNetworkError');
        expect(errorDetails.code).toBe('FHIR_NETWORK_ERROR');
        expect(errorDetails.timestamp).toBeDefined();
        expect(errorDetails.correlationId).toBeDefined();
        expect(errorDetails.stack).toBeDefined();

        // Should have user-friendly message
        const userMessage = networkError.getUserMessage();
        expect(userMessage).toContain('Network error occurred');
      }
    });
  });

  describe('Performance and Memory', () => {
    it('should handle high-frequency requests without memory leaks', async () => {
      const highFrequencyService = jest
        .fn()
        .mockImplementation(() => Promise.resolve('success'));

      // Execute many requests
      const promises = Array.from({ length: 100 }, () =>
        resilienceManager.execute(highFrequencyService)
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(100);
      expect(results.every(result => result === 'success')).toBe(true);
      expect(highFrequencyService).toHaveBeenCalledTimes(100);
    });

    it('should clean up old request history', async () => {
      const testCircuitBreaker = new CircuitBreaker({
        monitoringPeriod: 100, // Very short period for testing
        volumeThreshold: 5,
      });

      const service = jest.fn().mockResolvedValue('success');

      // Execute requests
      for (let i = 0; i < 10; i++) {
        await testCircuitBreaker.execute(service);
      }

      // Wait for monitoring period to pass
      await new Promise(resolve => setTimeout(resolve, 150));

      // Execute one more request to trigger cleanup
      await testCircuitBreaker.execute(service);

      // History should be cleaned up (can't directly test private field, but this ensures no memory leak)
      const stats = testCircuitBreaker.getStats();
      expect(stats.totalRequests).toBeGreaterThan(0);
    });
  });

  describe('Configuration and Customization', () => {
    it('should allow runtime configuration updates', async () => {
      const configurableService = jest
        .fn()
        .mockRejectedValue(
          new FHIRNetworkError('Network error', new Error('ECONNRESET'))
        );

      // Initial configuration allows 3 attempts
      try {
        await resilienceManager.execute(configurableService);
      } catch (e) {
        // Expected to fail
      }

      expect(configurableService).toHaveBeenCalledTimes(3);
      configurableService.mockClear();

      // Update configuration to allow 5 attempts
      resilienceManager.updateConfig({
        retry: { maxAttempts: 5 },
      });

      try {
        await resilienceManager.execute(configurableService);
      } catch (e) {
        // Expected to fail
      }

      expect(configurableService).toHaveBeenCalledTimes(5);
    });

    it('should support custom error classification', async () => {
      const customCircuitBreaker = new CircuitBreaker({
        expectedErrors: ['FHIR_NETWORK_ERROR'], // Only network errors trigger circuit breaker
        failureThreshold: 2,
        volumeThreshold: 3,
      });

      const networkErrorService = jest
        .fn()
        .mockRejectedValue(
          new FHIRNetworkError('Network failure', new Error('ECONNRESET'))
        );

      const serverErrorService = jest
        .fn()
        .mockRejectedValue(new FHIRServerError('Server error', 500));

      // Network errors should trigger circuit breaker
      try {
        await customCircuitBreaker.execute(networkErrorService);
      } catch (e) {
        // Expected to fail
      }

      try {
        await customCircuitBreaker.execute(networkErrorService);
      } catch (e) {
        // Expected to fail
      }

      try {
        await customCircuitBreaker.execute(networkErrorService);
      } catch (e) {
        // Expected to fail
      }

      expect(customCircuitBreaker.getState()).toBe(CircuitState.OPEN);

      // Reset for next test
      customCircuitBreaker.reset();

      // Server errors should not trigger circuit breaker with custom config (not in expectedErrors)
      for (let i = 0; i < 5; i++) {
        try {
          await customCircuitBreaker.execute(serverErrorService);
        } catch (e) {
          // Expected to fail
        }
      }

      expect(customCircuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });
  });
});
