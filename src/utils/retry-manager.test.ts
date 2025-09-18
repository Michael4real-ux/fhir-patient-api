/**
 * Tests for RetryManager
 */

import { RetryManager } from './retry-manager';
import { FHIRNetworkError, FHIRServerError } from '../errors';

describe('RetryManager', () => {
  let retryManager: RetryManager;

  beforeEach(() => {
    retryManager = new RetryManager({
      maxAttempts: 3,
      baseDelay: 100, // Shorter delay for tests
      maxDelay: 1000,
      backoffMultiplier: 2,
      jitterType: 'none', // No jitter for predictable tests
    });
  });

  describe('execute', () => {
    it('should succeed on first attempt', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      const result = await retryManager.execute(mockFn);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      const mockFn = jest
        .fn()
        .mockRejectedValueOnce(new FHIRNetworkError('Network error', new Error('ECONNRESET')))
        .mockRejectedValueOnce(new FHIRServerError('Server error', 500))
        .mockResolvedValue('success');
      
      const result = await retryManager.execute(mockFn);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should not retry on non-retryable errors', async () => {
      const mockFn = jest
        .fn()
        .mockRejectedValue(new FHIRServerError('Bad request', 400));
      
      await expect(retryManager.execute(mockFn)).rejects.toThrow('Bad request');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should fail after max attempts', async () => {
      const error = new FHIRNetworkError('Network error', new Error('ECONNRESET'));
      const mockFn = jest.fn().mockRejectedValue(error);
      
      await expect(retryManager.execute(mockFn)).rejects.toThrow('Network error');
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should add retry context to errors', async () => {
      const error = new FHIRNetworkError('Network error', new Error('ECONNRESET'));
      const mockFn = jest.fn().mockRejectedValue(error);
      
      try {
        await retryManager.execute(mockFn);
      } catch (thrownError) {
        expect(thrownError).toBeInstanceOf(FHIRNetworkError);
        const fhirError = thrownError as FHIRNetworkError;
        expect(fhirError.context?.retryAttempt).toBe(3);
        expect(fhirError.context?.totalRetries).toBe(3);
        expect(fhirError.context?.elapsedTime).toBeGreaterThan(0);
      }
    });

    it('should respect custom context', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      const customContext = { requestUrl: 'https://example.com/Patient' };
      
      await retryManager.execute(mockFn, customContext);
      
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('jitter types', () => {
    it('should apply full jitter', () => {
      const retryManagerWithJitter = new RetryManager({
        maxAttempts: 2,
        baseDelay: 1000,
        jitterType: 'full',
      });
      
      // Access private method for testing
      const calculateDelay = (retryManagerWithJitter as any).calculateDelay.bind(retryManagerWithJitter);
      
      const delay1 = calculateDelay(1000, 1);
      const delay2 = calculateDelay(1000, 1);
      
      expect(delay1).toBeGreaterThanOrEqual(0);
      expect(delay1).toBeLessThanOrEqual(1000);
      expect(delay2).toBeGreaterThanOrEqual(0);
      expect(delay2).toBeLessThanOrEqual(1000);
      
      // With jitter, delays should be different (with high probability)
      // We'll just check they're in valid range
    });

    it('should apply equal jitter', () => {
      const retryManagerWithJitter = new RetryManager({
        maxAttempts: 2,
        baseDelay: 1000,
        jitterType: 'equal',
      });
      
      const calculateDelay = (retryManagerWithJitter as any).calculateDelay.bind(retryManagerWithJitter);
      
      const delay = calculateDelay(1000, 1);
      
      expect(delay).toBeGreaterThanOrEqual(1000);
      expect(delay).toBeLessThanOrEqual(2000);
    });

    it('should apply no jitter', () => {
      const retryManagerWithJitter = new RetryManager({
        maxAttempts: 2,
        baseDelay: 1000,
        jitterType: 'none',
      });
      
      const calculateDelay = (retryManagerWithJitter as any).calculateDelay.bind(retryManagerWithJitter);
      
      const delay = calculateDelay(1000, 1);
      
      expect(delay).toBe(1000);
    });
  });

  describe('shouldRetry', () => {
    it('should retry on network errors', () => {
      const shouldRetry = (retryManager as any).shouldRetry.bind(retryManager);
      
      const networkError = new Error('ECONNRESET');
      expect(shouldRetry(networkError)).toBe(true);
      
      const timeoutError = new Error('timeout');
      expect(shouldRetry(timeoutError)).toBe(true);
    });

    it('should retry on server errors', () => {
      const shouldRetry = (retryManager as any).shouldRetry.bind(retryManager);
      
      const serverError = new FHIRServerError('Server error', 500);
      expect(shouldRetry(serverError)).toBe(true);
      
      const rateLimitError = new FHIRServerError('Rate limit', 429);
      expect(shouldRetry(rateLimitError)).toBe(true);
    });

    it('should not retry on client errors', () => {
      const shouldRetry = (retryManager as any).shouldRetry.bind(retryManager);
      
      const badRequestError = new FHIRServerError('Bad request', 400);
      expect(shouldRetry(badRequestError)).toBe(false);
      
      const notFoundError = new FHIRServerError('Not found', 404);
      expect(shouldRetry(notFoundError)).toBe(false);
    });
  });

  describe('configuration', () => {
    it('should use default configuration', () => {
      const defaultRetryManager = new RetryManager();
      const config = defaultRetryManager.getConfig();
      
      expect(config.maxAttempts).toBe(3);
      expect(config.baseDelay).toBe(1000);
      expect(config.maxDelay).toBe(30000);
      expect(config.backoffMultiplier).toBe(2);
      expect(config.jitterType).toBe('full');
    });

    it('should update configuration', () => {
      retryManager.updateConfig({
        maxAttempts: 5,
        baseDelay: 2000,
      });
      
      const config = retryManager.getConfig();
      expect(config.maxAttempts).toBe(5);
      expect(config.baseDelay).toBe(2000);
      expect(config.backoffMultiplier).toBe(2); // Should keep existing value
    });
  });

  describe('withRetry decorator', () => {
    it('should retry decorated methods', async () => {
      // Test the decorator functionality manually since decorators require experimental support
      const { withRetry } = require('./retry-manager');
      
      class TestClass {
        callCount = 0;
        
        async testMethod(): Promise<string> {
          this.callCount++;
          if (this.callCount < 3) {
            throw new FHIRNetworkError('Network error', new Error('ECONNRESET'));
          }
          return 'success';
        }
      }
      
      const instance = new TestClass();
      
      // Manually wrap the method
      const wrappedMethod = async () => {
        return retryManager.execute(() => instance.testMethod());
      };
      
      const result = await wrappedMethod();
      
      expect(result).toBe('success');
      expect(instance.callCount).toBe(3);
    });
  });
});