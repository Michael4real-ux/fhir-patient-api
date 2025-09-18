/**
 * FHIR Response Handler
 */

import {
  HttpResponse,
  OperationOutcome,
  Bundle,
  Patient,
  OperationOutcomeIssueDetailed,
  ErrorResponse,
} from '../types';
import { FHIRNetworkError } from '../errors';

export class ResponseHandler {
  /**
   * Handle FHIR response and check for operation outcomes
   */
  static handleFHIRResponse<T>(
    response: HttpResponse<T | OperationOutcome>,
    context: string
  ): T {
    // Check if response is an OperationOutcome (error response) first
    if (
      response.data &&
      typeof response.data === 'object' &&
      'resourceType' in response.data
    ) {
      const resource = response.data as { resourceType: string };
      if (resource.resourceType === 'OperationOutcome') {
        const outcome = resource as OperationOutcome;
        throw this.createOperationOutcomeError(
          outcome,
          response.status,
          context
        );
      }
    }

    // Check for successful status codes
    if (response.status < 200 || response.status >= 300) {
      throw new FHIRNetworkError(
        `${context}: HTTP ${response.status}: ${response.statusText}`,
        new Error(`HTTP ${response.status}: ${response.statusText}`)
      );
    }

    return response.data as T;
  }

  /**
   * Create error from OperationOutcome
   */
  private static createOperationOutcomeError(
    outcome: OperationOutcome,
    _statusCode: number,
    context: string
  ): FHIRNetworkError {
    const issues = outcome.issue || [];
    const errorMessages = issues
      .filter(issue => issue.severity === 'error' || issue.severity === 'fatal')
      .map(issue => issue.diagnostics || issue.details?.text || 'Unknown error')
      .join('; ');

    const warningMessages = issues
      .filter(issue => issue.severity === 'warning')
      .map(
        issue => issue.diagnostics || issue.details?.text || 'Unknown warning'
      )
      .join('; ');

    const message =
      errorMessages || warningMessages || 'FHIR server returned an error';

    return new FHIRNetworkError(
      `${context}: ${message}`,
      new Error(message)
    );
  }

  /**
   * Validate Bundle response with comprehensive checks
   */
  static validateBundleResponse(bundle: Bundle<Patient>): void {
    if (!bundle || typeof bundle !== 'object') {
      throw new FHIRNetworkError(
        'Invalid response format: Response is not a valid object',
        new Error('Response is not a valid object')
      );
    }

    if (!bundle.resourceType || bundle.resourceType !== 'Bundle') {
      throw new FHIRNetworkError(
        `Invalid response format: Expected Bundle resource type, got: ${bundle.resourceType || 'undefined'}`,
        new Error(`Expected Bundle resource type, got: ${bundle.resourceType || 'undefined'}`)
      );
    }

    if (!bundle.type) {
      throw new FHIRNetworkError(
        'Invalid bundle format: Bundle missing required type field',
        new Error('Bundle missing required type field')
      );
    }

    const validBundleTypes = [
      'document',
      'message',
      'transaction',
      'transaction-response',
      'batch',
      'batch-response',
      'history',
      'searchset',
      'collection',
    ];
    if (!validBundleTypes.includes(bundle.type)) {
      throw new FHIRNetworkError(
        `Invalid bundle type: ${bundle.type}. Expected one of: ${validBundleTypes.join(', ')}`,
        new Error(`Invalid bundle type: ${bundle.type}`)
      );
    }

    // Validate entries if present
    if (bundle.entry) {
      if (!Array.isArray(bundle.entry)) {
        throw new FHIRNetworkError(
          'Invalid bundle format: Bundle entry must be an array',
          new Error('Bundle entry must be an array')
        );
      }

      bundle.entry.forEach((entry, index) => {
        if (entry.resource && entry.resource.resourceType !== 'Patient') {
          throw new FHIRNetworkError(
            `Invalid bundle entry: Entry ${index} contains non-Patient resource: ${entry.resource.resourceType}`,
            new Error(`Entry ${index} contains non-Patient resource: ${entry.resource.resourceType}`)
          );
        }
      });
    }

    // Validate total if present
    if (
      bundle.total !== undefined &&
      (typeof bundle.total !== 'number' || bundle.total < 0)
    ) {
      throw new FHIRNetworkError(
        'Invalid bundle format: Bundle total must be a non-negative number',
        new Error('Bundle total must be a non-negative number')
      );
    }
  }

  /**
   * Validate Patient response with comprehensive checks
   */
  static validatePatientResponse(patient: Patient): void {
    if (!patient || typeof patient !== 'object') {
      throw new FHIRNetworkError(
        'Invalid response format: Response is not a valid object',
        new Error('Response is not a valid object')
      );
    }

    if (!patient.resourceType || patient.resourceType !== 'Patient') {
      throw new FHIRNetworkError(
        `Invalid response format: Expected Patient resource type, got: ${patient.resourceType || 'undefined'}`,
        new Error(`Expected Patient resource type, got: ${patient.resourceType || 'undefined'}`)
      );
    }

    if (
      !patient.id ||
      typeof patient.id !== 'string' ||
      patient.id.trim().length === 0
    ) {
      throw new FHIRNetworkError(
        'Invalid patient data: Patient resource missing required ID or ID is invalid',
        new Error('Patient resource missing required ID or ID is invalid')
      );
    }

    // Validate patient name structure if present
    if (patient.name) {
      if (!Array.isArray(patient.name)) {
        throw new FHIRNetworkError(
          'Invalid patient data: Patient name must be an array',
          new Error('Patient name must be an array')
        );
      }

      patient.name.forEach((name, index) => {
        if (
          name.use &&
          ![
            'usual',
            'official',
            'temp',
            'nickname',
            'anonymous',
            'old',
            'maiden',
          ].includes(name.use)
        ) {
          throw new FHIRNetworkError(
            `Invalid patient data: Invalid name use value at index ${index}: ${name.use}`,
            new Error(`Invalid name use value at index ${index}: ${name.use}`)
          );
        }
      });
    }

    // Validate gender if present
    if (
      patient.gender &&
      !['male', 'female', 'other', 'unknown'].includes(patient.gender)
    ) {
      throw new FHIRNetworkError(
        `Invalid patient data: Invalid gender value: ${patient.gender}`,
        new Error(`Invalid gender value: ${patient.gender}`)
      );
    }

    // Validate birthDate format if present
    if (patient.birthDate && !this.isValidFHIRDate(patient.birthDate)) {
      throw new FHIRNetworkError(
        `Invalid patient data: Invalid birthDate format: ${patient.birthDate}`,
        new Error(`Invalid birthDate format: ${patient.birthDate}`)
      );
    }

    // Validate active field if present
    if (patient.active !== undefined && typeof patient.active !== 'boolean') {
      throw new FHIRNetworkError(
        'Invalid patient data: Patient active field must be a boolean',
        new Error('Patient active field must be a boolean')
      );
    }
  }

  /**
   * Validate FHIR date format
   */
  private static isValidFHIRDate(dateStr: string): boolean {
    const dateRegex = /^\d{4}(-\d{2}(-\d{2})?)?$/;
    return dateRegex.test(dateStr);
  }

  /**
   * Extract error details from HTTP error response
   */
  static extractErrorDetails(error: unknown): {
    message: string;
    details?: string;
  } {
    const errorResponse = error as ErrorResponse;
    if (errorResponse.response?.data) {
      const data = errorResponse.response.data;

      // Check if it's an OperationOutcome
      const dataWithResourceType = data as {
        resourceType?: string;
        issue?: unknown[];
      };
      if (
        dataWithResourceType.resourceType === 'OperationOutcome' &&
        dataWithResourceType.issue
      ) {
        const issues = dataWithResourceType.issue;
        const errorMessages = (issues as OperationOutcomeIssueDetailed[])
          .filter(
            issue => issue.severity === 'error' || issue.severity === 'fatal'
          )
          .map(
            issue => issue.diagnostics || issue.details?.text || 'Unknown error'
          )
          .join('; ');

        return {
          message: errorMessages || 'FHIR server error',
          details: JSON.stringify(data, null, 2),
        };
      }

      // Check if it's a plain text error
      if (typeof data === 'string') {
        return {
          message: data,
          details: `HTTP ${errorResponse.response.status}: ${errorResponse.response.statusText}`,
        };
      }
    }

    const errorWithMessage = error as {
      message?: string;
      code?: string;
      name?: string;
    };
    return {
      message: errorWithMessage.message || 'Unknown error occurred',
      details: errorWithMessage.code || errorWithMessage.name,
    };
  }
}