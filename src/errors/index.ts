/**
 * Error handling classes and utilities
 *
 * This file contains structured error types for the FHIR Patient API.
 */

import { ValidationError as ValidationErrorType } from '../types';

export abstract class FHIRError extends Error {
  abstract readonly code: string;
  
  constructor(message: string, public readonly details?: string) {
    super(message);
    this.name = this.constructor.name;
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class AuthenticationError extends FHIRError {
  readonly code = 'AUTHENTICATION_ERROR';
  
  constructor(message: string, details?: string) {
    super(message, details);
  }
}

export class ConfigurationError extends FHIRError {
  readonly code = 'CONFIGURATION_ERROR';
  
  constructor(message: string, public readonly validationErrors?: ValidationErrorType[]) {
    super(message);
  }
}

export class NetworkError extends FHIRError {
  readonly code = 'NETWORK_ERROR';
  
  constructor(message: string, public readonly statusCode?: number, details?: string) {
    super(message, details);
  }
}

export class FHIRValidationError extends FHIRError {
  readonly code = 'VALIDATION_ERROR';
  
  constructor(message: string, public readonly field?: string, details?: string) {
    super(message, details);
  }
}
