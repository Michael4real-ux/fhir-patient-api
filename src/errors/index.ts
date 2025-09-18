/**
 * Error handling classes and utilities
 *
 * This file contains structured error types for the FHIR Patient API with
 * comprehensive context information and resilience features.
 */

import {
  ValidationError as ValidationErrorType,
  OperationOutcome,
} from '../types';

export interface ErrorContext {
  timestamp: string;
  correlationId: string;
  requestUrl?: string;
  requestMethod?: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  retryAttempt?: number;
  totalRetries?: number;
  elapsedTime?: number;
  serverInfo?: {
    fhirVersion?: string;
    serverSoftware?: string;
  };
  [key: string]: unknown;
}

export abstract class FHIRError extends Error {
  abstract readonly code: string;
  public readonly timestamp: string;
  public readonly correlationId: string;

  constructor(
    message: string,
    public readonly context?: Partial<ErrorContext>,
    public readonly details?: string
  ) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date().toISOString();
    this.correlationId = context?.correlationId || this.generateCorrelationId();

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  private generateCorrelationId(): string {
    return `fhir-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Get error details for logging
   */
  getErrorDetails(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      timestamp: this.timestamp,
      correlationId: this.correlationId,
      context: this.context,
      details: this.details,
      stack: this.stack,
    };
  }

  /**
   * Get user-friendly error message
   */
  getUserMessage(): string {
    return this.message;
  }

  /**
   * Check if error is retryable
   */
  isRetryable(): boolean {
    return false; // Default: not retryable
  }
}

export class FHIRServerError extends FHIRError {
  readonly code = 'FHIR_SERVER_ERROR';

  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly operationOutcome?: OperationOutcome,
    context?: Partial<ErrorContext>,
    details?: string
  ) {
    super(message, context, details);
  }

  override isRetryable(): boolean {
    // Retry on server errors (5xx) and rate limiting (429)
    return this.statusCode >= 500 || this.statusCode === 429;
  }

  override getUserMessage(): string {
    if (this.operationOutcome?.issue?.length) {
      const diagnostics = this.operationOutcome.issue
        .filter(issue => issue.diagnostics)
        .map(issue => issue.diagnostics)
        .join('; ');

      if (diagnostics) {
        return `${this.message}: ${diagnostics}`;
      }
    }

    return this.message;
  }
}

export class FHIRNetworkError extends FHIRError {
  readonly code = 'FHIR_NETWORK_ERROR';

  constructor(
    message: string,
    public readonly originalError: Error,
    context?: Partial<ErrorContext>,
    details?: string
  ) {
    super(message, context, details);
  }

  override isRetryable(): boolean {
    const message = this.originalError.message.toLowerCase();
    // Retry on network issues but not on DNS resolution failures
    return !message.includes('enotfound') && !message.includes('getaddrinfo');
  }

  override getUserMessage(): string {
    if (this.originalError.message.includes('timeout')) {
      return 'Request timed out. Please try again or check your network connection.';
    }
    if (this.originalError.message.includes('econnrefused')) {
      return 'Unable to connect to the FHIR server. Please check the server URL and try again.';
    }
    if (this.originalError.message.includes('enotfound')) {
      return 'Server not found. Please check the server URL.';
    }
    return 'Network error occurred. Please check your connection and try again.';
  }
}

export class AuthenticationError extends FHIRError {
  readonly code = 'AUTHENTICATION_ERROR';

  constructor(
    message: string,
    context?: Partial<ErrorContext>,
    details?: string
  ) {
    super(message, context, details);
  }

  override getUserMessage(): string {
    return 'Authentication failed. Please check your credentials and try again.';
  }
}

export class ConfigurationError extends FHIRError {
  readonly code = 'CONFIGURATION_ERROR';

  constructor(
    message: string,
    public readonly validationErrors?: ValidationErrorType[],
    context?: Partial<ErrorContext>
  ) {
    super(message, context);
  }

  override getUserMessage(): string {
    if (this.validationErrors?.length) {
      const errorMessages = this.validationErrors
        .map(e => e.message)
        .join(', ');
      return `Configuration error: ${errorMessages}`;
    }
    return this.message;
  }
}

export class FHIRValidationError extends FHIRError {
  readonly code = 'VALIDATION_ERROR';

  constructor(
    message: string,
    public readonly field?: string,
    context?: Partial<ErrorContext>,
    details?: string
  ) {
    super(message, context, details);
  }

  override getUserMessage(): string {
    if (this.field) {
      return `Invalid ${this.field}: ${this.message}`;
    }
    return this.message;
  }
}

export class CircuitBreakerError extends FHIRError {
  readonly code = 'CIRCUIT_BREAKER_ERROR';

  constructor(
    message: string,
    public readonly circuitState: 'OPEN' | 'HALF_OPEN',
    context?: Partial<ErrorContext>
  ) {
    super(message, context);
  }

  override getUserMessage(): string {
    return 'Service temporarily unavailable due to repeated failures. Please try again later.';
  }
}

export class RateLimitError extends FHIRError {
  readonly code = 'RATE_LIMIT_ERROR';

  constructor(
    message: string,
    public readonly retryAfter?: number,
    context?: Partial<ErrorContext>
  ) {
    super(message, context);
  }

  override isRetryable(): boolean {
    return true;
  }

  override getUserMessage(): string {
    if (this.retryAfter) {
      return `Rate limit exceeded. Please wait ${this.retryAfter} seconds before retrying.`;
    }
    return 'Rate limit exceeded. Please wait before retrying.';
  }
}

// Aliases for backward compatibility and consistency with examples
export { AuthenticationError as FHIRAuthenticationError };
