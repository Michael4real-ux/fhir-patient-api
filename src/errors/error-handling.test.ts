/**
 * Comprehensive error handling tests
 */

import {
  FHIRError,
  FHIRServerError,
  FHIRNetworkError,
  AuthenticationError,
  ConfigurationError,
  FHIRValidationError,
  CircuitBreakerError,
  RateLimitError,
  ErrorContext,
} from './index';
import { OperationOutcome } from '../types';

describe('Error Handling', () => {
  describe('FHIRError base class', () => {
    class TestFHIRError extends FHIRError {
      readonly code = 'TEST_ERROR';
    }

    it('should create error with message and context', () => {
      const context: Partial<ErrorContext> = {
        requestUrl: 'https://example.com/Patient',
        requestMethod: 'GET',
      };
      
      const error = new TestFHIRError('Test error', context, 'Additional details');
      
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.context?.requestUrl).toBe('https://example.com/Patient');
      expect(error.details).toBe('Additional details');
      expect(error.timestamp).toBeDefined();
      expect(error.correlationId).toBeDefined();
    });

    it('should generate correlation ID if not provided', () => {
      const error = new TestFHIRError('Test error');
      
      expect(error.correlationId).toMatch(/^fhir-\d+-[a-z0-9]+$/);
    });

    it('should use provided correlation ID', () => {
      const context: Partial<ErrorContext> = {
        correlationId: 'custom-correlation-id',
      };
      
      const error = new TestFHIRError('Test error', context);
      
      expect(error.correlationId).toBe('custom-correlation-id');
    });

    it('should provide error details for logging', () => {
      const context: Partial<ErrorContext> = {
        requestUrl: 'https://example.com/Patient',
        elapsedTime: 1500,
      };
      
      const error = new TestFHIRError('Test error', context, 'Details');
      const details = error.getErrorDetails();
      
      expect(details.name).toBe('TestFHIRError');
      expect(details.code).toBe('TEST_ERROR');
      expect(details.message).toBe('Test error');
      expect(details.context).toEqual(context);
      expect(details.details).toBe('Details');
      expect(details.timestamp).toBeDefined();
      expect(details.correlationId).toBeDefined();
      expect(details.stack).toBeDefined();
    });

    it('should provide user-friendly message', () => {
      const error = new TestFHIRError('Technical error message');
      
      expect(error.getUserMessage()).toBe('Technical error message');
    });

    it('should not be retryable by default', () => {
      const error = new TestFHIRError('Test error');
      
      expect(error.isRetryable()).toBe(false);
    });
  });

  describe('FHIRServerError', () => {
    it('should create server error with status code', () => {
      const error = new FHIRServerError('Server error', 500);
      
      expect(error.code).toBe('FHIR_SERVER_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.isRetryable()).toBe(true); // 5xx errors are retryable
    });

    it('should create server error with OperationOutcome', () => {
      const operationOutcome: OperationOutcome = {
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'invalid',
            diagnostics: 'Invalid patient ID format',
          },
        ],
      };
      
      const error = new FHIRServerError('Validation failed', 400, operationOutcome);
      
      expect(error.operationOutcome).toEqual(operationOutcome);
      expect(error.isRetryable()).toBe(false); // 4xx errors are not retryable
    });

    it('should provide user-friendly message with diagnostics', () => {
      const operationOutcome: OperationOutcome = {
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'invalid',
            diagnostics: 'Patient ID must be alphanumeric',
          },
          {
            severity: 'warning',
            code: 'incomplete',
            diagnostics: 'Missing optional field',
          },
        ],
      };
      
      const error = new FHIRServerError('Validation failed', 400, operationOutcome);
      const userMessage = error.getUserMessage();
      
      expect(userMessage).toContain('Validation failed');
      expect(userMessage).toContain('Patient ID must be alphanumeric');
      expect(userMessage).toContain('Missing optional field');
    });

    it('should handle rate limiting (429)', () => {
      const error = new FHIRServerError('Rate limit exceeded', 429);
      
      expect(error.isRetryable()).toBe(true);
    });
  });

  describe('FHIRNetworkError', () => {
    it('should create network error with original error', () => {
      const originalError = new Error('ECONNRESET');
      const error = new FHIRNetworkError('Connection reset', originalError);
      
      expect(error.code).toBe('FHIR_NETWORK_ERROR');
      expect(error.originalError).toBe(originalError);
      expect(error.isRetryable()).toBe(true);
    });

    it('should not retry DNS resolution errors', () => {
      const originalError = new Error('getaddrinfo ENOTFOUND example.com');
      const error = new FHIRNetworkError('Host not found', originalError);
      
      expect(error.isRetryable()).toBe(false);
    });

    it('should provide user-friendly messages for common errors', () => {
      const timeoutError = new FHIRNetworkError('Timeout', new Error('timeout'));
      expect(timeoutError.getUserMessage()).toContain('timed out');
      
      const connectionError = new FHIRNetworkError('Connection refused', new Error('econnrefused'));
      expect(connectionError.getUserMessage()).toContain('Unable to connect');
      
      const dnsError = new FHIRNetworkError('Host not found', new Error('enotfound'));
      expect(dnsError.getUserMessage()).toContain('Server not found');
    });
  });

  describe('AuthenticationError', () => {
    it('should create authentication error', () => {
      const error = new AuthenticationError('Invalid token');
      
      expect(error.code).toBe('AUTHENTICATION_ERROR');
      expect(error.isRetryable()).toBe(false);
      expect(error.getUserMessage()).toContain('Authentication failed');
    });
  });

  describe('ConfigurationError', () => {
    it('should create configuration error with validation errors', () => {
      const validationErrors = [
        { field: 'baseUrl', message: 'Required field', code: 'required' },
        { field: 'timeout', message: 'Must be positive', code: 'invalid' },
      ];
      
      const error = new ConfigurationError('Invalid configuration', validationErrors);
      
      expect(error.code).toBe('CONFIGURATION_ERROR');
      expect(error.validationErrors).toEqual(validationErrors);
      expect(error.getUserMessage()).toContain('Required field');
      expect(error.getUserMessage()).toContain('Must be positive');
    });
  });

  describe('FHIRValidationError', () => {
    it('should create validation error with field', () => {
      const error = new FHIRValidationError('Invalid format', 'patientId');
      
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.field).toBe('patientId');
      expect(error.getUserMessage()).toContain('Invalid patientId');
    });

    it('should create validation error without field', () => {
      const error = new FHIRValidationError('Invalid request');
      
      expect(error.field).toBeUndefined();
      expect(error.getUserMessage()).toBe('Invalid request');
    });
  });

  describe('CircuitBreakerError', () => {
    it('should create circuit breaker error', () => {
      const error = new CircuitBreakerError('Circuit open', 'OPEN');
      
      expect(error.code).toBe('CIRCUIT_BREAKER_ERROR');
      expect(error.circuitState).toBe('OPEN');
      expect(error.isRetryable()).toBe(false);
      expect(error.getUserMessage()).toContain('temporarily unavailable');
    });
  });

  describe('RateLimitError', () => {
    it('should create rate limit error with retry after', () => {
      const error = new RateLimitError('Rate limit exceeded', 30);
      
      expect(error.code).toBe('RATE_LIMIT_ERROR');
      expect(error.retryAfter).toBe(30);
      expect(error.isRetryable()).toBe(true);
      expect(error.getUserMessage()).toContain('30 seconds');
    });

    it('should create rate limit error without retry after', () => {
      const error = new RateLimitError('Rate limit exceeded');
      
      expect(error.retryAfter).toBeUndefined();
      expect(error.getUserMessage()).toContain('wait before retrying');
    });
  });

  describe('Error context enrichment', () => {
    it('should enrich errors with comprehensive context', () => {
      const context: Partial<ErrorContext> = {
        requestUrl: 'https://fhir.example.com/Patient/123',
        requestMethod: 'GET',
        requestHeaders: {
          'Authorization': 'Bearer token',
          'Accept': 'application/fhir+json',
        },
        responseHeaders: {
          'Content-Type': 'application/fhir+json',
          'X-Request-ID': 'req-123',
        },
        retryAttempt: 2,
        totalRetries: 3,
        elapsedTime: 2500,
        serverInfo: {
          fhirVersion: 'R4',
          serverSoftware: 'HAPI FHIR 5.0.0',
        },
      };
      
      const error = new FHIRServerError('Server error', 500, undefined, context);
      
      expect(error.context).toEqual(expect.objectContaining(context));
      expect(error.getErrorDetails().context).toEqual(expect.objectContaining(context));
    });
  });

  describe('Error serialization', () => {
    it('should serialize errors for logging', () => {
      const operationOutcome: OperationOutcome = {
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'invalid',
            diagnostics: 'Invalid input',
          },
        ],
      };
      
      const context: Partial<ErrorContext> = {
        requestUrl: 'https://example.com/Patient',
        elapsedTime: 1000,
      };
      
      const error = new FHIRServerError('Server error', 500, operationOutcome, context);
      const details = error.getErrorDetails();
      
      // Should be JSON serializable
      const serialized = JSON.stringify(details);
      const parsed = JSON.parse(serialized);
      
      expect(parsed.code).toBe('FHIR_SERVER_ERROR');
      expect(parsed.message).toBe('Server error');
      expect(parsed.context.requestUrl).toBe('https://example.com/Patient');
    });
  });

  describe('Error inheritance and type checking', () => {
    it('should maintain proper inheritance chain', () => {
      const serverError = new FHIRServerError('Server error', 500);
      const networkError = new FHIRNetworkError('Network error', new Error('ECONNRESET'));
      
      expect(serverError).toBeInstanceOf(FHIRError);
      expect(serverError).toBeInstanceOf(Error);
      expect(networkError).toBeInstanceOf(FHIRError);
      expect(networkError).toBeInstanceOf(Error);
    });

    it('should allow type-safe error handling', () => {
      const errors: FHIRError[] = [
        new FHIRServerError('Server error', 500),
        new FHIRNetworkError('Network error', new Error('ECONNRESET')),
        new AuthenticationError('Auth error'),
      ];
      
      errors.forEach(error => {
        expect(error.code).toBeDefined();
        expect(error.getUserMessage()).toBeDefined();
        expect(typeof error.isRetryable()).toBe('boolean');
        
        if (error instanceof FHIRServerError) {
          expect(typeof error.statusCode).toBe('number');
        }
        
        if (error instanceof FHIRNetworkError) {
          expect(error.originalError).toBeInstanceOf(Error);
        }
      });
    });
  });
});