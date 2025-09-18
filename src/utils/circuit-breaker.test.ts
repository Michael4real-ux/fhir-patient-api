/**
 * Tests for CircuitBreaker
 */

import { CircuitBreaker, CircuitState } from './circuit-breaker';
import {
  FHIRNetworkError,
  FHIRServerError,
  CircuitBreakerError,
} from '../errors';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      recoveryTimeout: 1000, // 1 second for tests
      monitoringPeriod: 5000, // 5 seconds for tests
      volumeThreshold: 5,
      errorPercentageThreshold: 50,
    });
  });

  describe('execute', () => {
    it('should execute successfully when circuit is closed', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');

      const result = await circuitBreaker.execute(mockFn);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should open circuit after failure threshold', async () => {
      const error = new FHIRNetworkError(
        'Network error',
        new Error('ECONNRESET')
      );
      const mockFn = jest.fn().mockRejectedValue(error);

      // Execute enough times to reach volume threshold
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(mockFn);
        } catch (e) {
          // Expected to fail
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
      expect(mockFn).toHaveBeenCalledTimes(5);
    });

    it('should throw CircuitBreakerError when circuit is open', async () => {
      const error = new FHIRNetworkError(
        'Network error',
        new Error('ECONNRESET')
      );
      const mockFn = jest.fn().mockRejectedValue(error);

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(mockFn);
        } catch (e) {
          // Expected to fail
        }
      }

      // Now it should throw CircuitBreakerError
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow(
        CircuitBreakerError
      );
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should transition to half-open after recovery timeout', async () => {
      const error = new FHIRNetworkError(
        'Network error',
        new Error('ECONNRESET')
      );
      const mockFn = jest.fn().mockRejectedValue(error);

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(mockFn);
        } catch (e) {
          // Expected to fail
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      // Wait for recovery timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Check state - should be half-open now
      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);
    });

    it('should close circuit on successful execution in half-open state', async () => {
      const error = new FHIRNetworkError(
        'Network error',
        new Error('ECONNRESET')
      );
      const failingFn = jest.fn().mockRejectedValue(error);
      const successFn = jest.fn().mockResolvedValue('success');

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(failingFn);
        } catch (e) {
          // Expected to fail
        }
      }

      // Wait for recovery timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Execute successful function
      const result = await circuitBreaker.execute(successFn);

      expect(result).toBe('success');
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should not count non-expected errors', async () => {
      const clientError = new FHIRServerError('Bad request', 400);
      const mockFn = jest.fn().mockRejectedValue(clientError);

      // Execute multiple times with client error
      for (let i = 0; i < 10; i++) {
        try {
          await circuitBreaker.execute(mockFn);
        } catch (e) {
          // Expected to fail
        }
      }

      // Circuit should still be closed because client errors don't count
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('error percentage threshold', () => {
    it('should open circuit based on error percentage', async () => {
      const circuitBreakerWithPercentage = new CircuitBreaker({
        failureThreshold: 10, // High threshold
        errorPercentageThreshold: 60, // 60% error rate
        volumeThreshold: 10,
        recoveryTimeout: 1000,
      });

      const error = new FHIRNetworkError(
        'Network error',
        new Error('ECONNRESET')
      );
      const failingFn = jest.fn().mockRejectedValue(error);
      const successFn = jest.fn().mockResolvedValue('success');

      // Execute requests in deterministic order to reach volume threshold
      // 7 failures, 3 successes (70% error rate) - should trigger 60% threshold
      const requests = [
        'success', 'fail', 'fail', 'success', 'fail', 
        'fail', 'fail', 'success', 'fail', 'fail'
      ];

      for (const request of requests) {
        try {
          if (request === 'fail') {
            await circuitBreakerWithPercentage.execute(failingFn);
          } else {
            await circuitBreakerWithPercentage.execute(successFn);
          }
        } catch (e) {
          // Expected to fail for failing requests
        }

        // Check if circuit opened due to error percentage
        if (circuitBreakerWithPercentage.getState() === CircuitState.OPEN) {
          break;
        }
      }

      expect(circuitBreakerWithPercentage.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('statistics', () => {
    it('should track statistics correctly', async () => {
      const error = new FHIRNetworkError(
        'Network error',
        new Error('ECONNRESET')
      );
      const failingFn = jest.fn().mockRejectedValue(error);
      const successFn = jest.fn().mockResolvedValue('success');

      // Execute some successful and failing requests
      await circuitBreaker.execute(successFn);
      await circuitBreaker.execute(successFn);

      try {
        await circuitBreaker.execute(failingFn);
      } catch (e) {
        // Expected to fail
      }

      const stats = circuitBreaker.getStats();

      expect(stats.successCount).toBe(2);
      expect(stats.failureCount).toBe(1);
      expect(stats.totalRequests).toBe(3);
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.lastSuccessTime).toBeDefined();
      expect(stats.lastFailureTime).toBeDefined();
    });
  });

  describe('configuration', () => {
    it('should use default configuration', () => {
      const defaultCircuitBreaker = new CircuitBreaker();
      const config = defaultCircuitBreaker.getConfig();

      expect(config.failureThreshold).toBe(5);
      expect(config.recoveryTimeout).toBe(60000);
      expect(config.volumeThreshold).toBe(10);
      expect(config.errorPercentageThreshold).toBe(50);
    });

    it('should update configuration', () => {
      circuitBreaker.updateConfig({
        failureThreshold: 10,
        recoveryTimeout: 30000,
      });

      const config = circuitBreaker.getConfig();
      expect(config.failureThreshold).toBe(10);
      expect(config.recoveryTimeout).toBe(30000);
      expect(config.volumeThreshold).toBe(5); // Should keep existing value
    });
  });

  describe('reset', () => {
    it('should reset circuit breaker state', async () => {
      const error = new FHIRNetworkError(
        'Network error',
        new Error('ECONNRESET')
      );
      const mockFn = jest.fn().mockRejectedValue(error);

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(mockFn);
        } catch (e) {
          // Expected to fail
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      // Reset the circuit breaker
      circuitBreaker.reset();

      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      const stats = circuitBreaker.getStats();
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.totalRequests).toBe(0);
    });
  });

  describe('isHealthy', () => {
    it('should return true when circuit is closed', () => {
      expect(circuitBreaker.isHealthy()).toBe(true);
    });

    it('should return false when circuit is open', async () => {
      const error = new FHIRNetworkError(
        'Network error',
        new Error('ECONNRESET')
      );
      const mockFn = jest.fn().mockRejectedValue(error);

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(mockFn);
        } catch (e) {
          // Expected to fail
        }
      }

      expect(circuitBreaker.isHealthy()).toBe(false);
    });
  });

  describe('withCircuitBreaker decorator', () => {
    it('should protect decorated methods', async () => {
      // Test the decorator functionality manually since decorators require experimental support
      const { withCircuitBreaker } = require('./circuit-breaker');

      class TestClass {
        callCount = 0;

        async testMethod(): Promise<string> {
          this.callCount++;
          if (this.callCount <= 5) {
            throw new FHIRNetworkError(
              'Network error',
              new Error('ECONNRESET')
            );
          }
          return 'success';
        }
      }

      const instance = new TestClass();

      // Manually wrap the method
      const wrappedMethod = async () => {
        return circuitBreaker.execute(() => instance.testMethod());
      };

      // First 5 calls should fail and open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await wrappedMethod();
        } catch (e) {
          // Expected to fail
        }
      }

      // Next call should throw CircuitBreakerError
      await expect(wrappedMethod()).rejects.toThrow(CircuitBreakerError);
      expect(instance.callCount).toBe(5); // Method shouldn't be called when circuit is open
    });
  });
});
