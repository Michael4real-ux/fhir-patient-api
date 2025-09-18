/**
 * FHIR Client implementation
 *
 * Production-ready FHIR client with real HTTP requests, proper authentication,
 * and comprehensive error handling.
 */

import {
  FHIRClientConfig,
  Patient,
  Bundle,
  PatientSearchParams,
  ValidationResult,
  ValidationError,
  CapabilityStatement,
  ErrorResponse,
} from '../types';
import {
  AuthenticationError,
  ConfigurationError,
  FHIRNetworkError,
  FHIRValidationError,
} from '../errors';
import { HttpClient } from '../http/http-client';
import { EnhancedHttpClient } from '../http/enhanced-http-client';
import { AuthManager } from '../auth/auth-manager';
import { QueryBuilder } from '../utils/query-builder';
import { ResponseHandler } from '../utils/response-handler';
import { PatientQueryBuilder } from './patient-query-builder';

export class FHIRClient {
  private config: Required<FHIRClientConfig>;
  private httpClient: HttpClient | EnhancedHttpClient;
  private authManager: AuthManager;

  constructor(config: FHIRClientConfig) {
    // Validate configuration
    const validation = this.validateConfig(config);
    if (!validation.isValid) {
      throw new ConfigurationError(
        'Invalid client configuration',
        validation.errors
      );
    }

    // Set default configuration values
    this.config = {
      baseUrl: config.baseUrl.replace(/\/$/, ''), // Remove trailing slash
      auth: config.auth || { type: 'none' },
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      userAgent: config.userAgent || 'fhir-patient-api/1.0.0',
      headers: config.headers || {},
      validateSSL: config.validateSSL !== false, // Default to true
      cache: config.cache || {
        enabled: false,
        maxSize: 10 * 1024 * 1024, // 10MB
        defaultTTL: 300000, // 5 minutes
        respectCacheHeaders: true,
        staleWhileRevalidate: true,
        strategy: 'adaptive',
      },
      connectionPool: config.connectionPool || {
        maxConnections: 100,
        maxConnectionsPerHost: 10,
        connectionTimeout: 30000,
        idleTimeout: 60000,
        enableHttp2: true,
      },
    };

    // Initialize HTTP client - use enhanced client if caching is enabled
    if (this.config.cache.enabled) {
      this.httpClient = new EnhancedHttpClient({
        baseURL: this.config.baseUrl,
        timeout: this.config.timeout,
        headers: {
          'User-Agent': this.config.userAgent,
          ...this.config.headers,
        },
        validateSSL: this.config.validateSSL,
        cache: this.config.cache,
        connectionPool: this.config.connectionPool,
      });
    } else {
      this.httpClient = new HttpClient({
        baseURL: this.config.baseUrl,
        timeout: this.config.timeout,
        headers: {
          'User-Agent': this.config.userAgent,
          ...this.config.headers,
        },
        validateSSL: this.config.validateSSL,
      });
    }

    // Initialize authentication manager
    this.authManager = new AuthManager(this.config.auth);
  }

  /**
   * Create a fluent query builder for patients
   */
  patients(): PatientQueryBuilder {
    return new PatientQueryBuilder(
      this.config.baseUrl,
      (params: PatientSearchParams) => this.getPatients(params)
    );
  }

  /**
   * Get patients with optional search parameters
   * Enhanced with concurrent request support
   */
  async getPatients(params?: PatientSearchParams): Promise<Bundle<Patient>> {
    let sanitizedParams: PatientSearchParams | undefined;

    // Sanitize and validate search parameters
    if (params) {
      sanitizedParams = QueryBuilder.sanitizeSearchParams(params);
      const validation = QueryBuilder.validateSearchParams(sanitizedParams);
      if (!validation.isValid) {
        throw new FHIRValidationError(
          'Invalid search parameters',
          undefined,
          undefined,
          validation.errors.join(', ')
        );
      }
    }

    try {
      // Get authentication headers
      const authHeaders = await this.authManager.getAuthHeaders();

      // Build URL with sanitized parameters
      const url = QueryBuilder.buildSearchUrl(
        this.config.baseUrl,
        'Patient',
        sanitizedParams
      );

      // Make request with retry logic
      const response = await this.httpClient.request<Bundle<Patient>>({
        method: 'GET',
        url,
        headers: authHeaders,
        timeout: this.config.timeout,
      });

      // Handle response
      const bundle = ResponseHandler.handleFHIRResponse<Bundle<Patient>>(
        response,
        'Failed to fetch patients'
      );

      // Validate bundle structure
      ResponseHandler.validateBundleResponse(bundle);

      return bundle;
    } catch (error) {
      throw this.mapError(error, 'Failed to fetch patients');
    }
  }

  /**
   * Get a specific patient by ID with comprehensive validation
   */
  async getPatientById(id: string): Promise<Patient> {
    // Comprehensive ID validation
    if (!id || typeof id !== 'string') {
      throw new FHIRValidationError(
        'Patient ID must be a non-empty string',
        'id'
      );
    }

    const sanitizedId = id.trim();
    if (sanitizedId.length === 0) {
      throw new FHIRValidationError(
        'Patient ID cannot be empty or only whitespace',
        'id'
      );
    }

    // Validate ID format (FHIR ID rules: A-Z, a-z, 0-9, -, ., _, max 64 chars)
    const idRegex = /^[A-Za-z0-9\-._ ]{1,64}$/;
    if (!idRegex.test(sanitizedId)) {
      throw new FHIRValidationError(
        'Patient ID contains invalid characters or is too long (max 64 characters, alphanumeric, -, ., _ only)',
        'id'
      );
    }

    try {
      // Get authentication headers
      const authHeaders = await this.authManager.getAuthHeaders();

      // Build URL with sanitized ID
      const url = QueryBuilder.buildResourceUrl(
        this.config.baseUrl,
        'Patient',
        sanitizedId
      );

      // Make request with retry logic
      const response = await this.httpClient.request<Patient>({
        method: 'GET',
        url,
        headers: authHeaders,
        timeout: this.config.timeout,
      });

      // Handle response
      const patient = ResponseHandler.handleFHIRResponse<Patient>(
        response,
        `Failed to fetch patient with ID: ${sanitizedId}`
      );

      // Comprehensive patient validation
      ResponseHandler.validatePatientResponse(patient);

      return patient;
    } catch (error) {
      throw this.mapError(
        error,
        `Failed to fetch patient with ID: ${sanitizedId}`
      );
    }
  }

  /**
   * Test connection to FHIR server with capability validation
   */
  async testConnection(): Promise<boolean> {
    try {
      const authHeaders = await this.authManager.getAuthHeaders();

      const response = await this.httpClient.request({
        method: 'GET',
        url: `${this.config.baseUrl}/metadata`,
        headers: authHeaders,
        timeout: Math.min(this.config.timeout, 10000), // Use shorter timeout for connection test
      });

      if (response.status !== 200) {
        return false;
      }

      // Validate that it's a proper FHIR server by checking capability statement
      const capability = response.data as CapabilityStatement;
      if (
        !capability ||
        capability.resourceType !== 'CapabilityStatement' ||
        !capability.fhirVersion
      ) {
        return false;
      }

      // Check if server supports Patient resource
      if (capability.rest && Array.isArray(capability.rest)) {
        const serverRest = capability.rest.find(rest => rest.mode === 'server');
        if (
          serverRest &&
          serverRest.resource &&
          Array.isArray(serverRest.resource)
        ) {
          const patientResource = serverRest.resource.find(
            res => res.type === 'Patient'
          );
          return !!patientResource;
        }
      }

      // If we can't determine Patient support, assume it's available
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get server capability statement
   */
  async getCapabilityStatement(): Promise<CapabilityStatement> {
    try {
      const authHeaders = await this.authManager.getAuthHeaders();

      const response = await this.httpClient.request<CapabilityStatement>({
        method: 'GET',
        url: `${this.config.baseUrl}/metadata`,
        headers: authHeaders,
        timeout: this.config.timeout,
      });

      const capability =
        ResponseHandler.handleFHIRResponse<CapabilityStatement>(
          response,
          'Failed to fetch server capability statement'
        );

      return capability;
    } catch (error) {
      throw this.mapError(error, 'Failed to fetch server capability statement');
    }
  }

  /**
   * Get client configuration (read-only)
   */
  getConfig(): Readonly<FHIRClientConfig> {
    return { ...this.config };
  }

  /**
   * Refresh authentication (useful for JWT tokens)
   */
  async refreshAuth(): Promise<void> {
    await this.authManager.refreshAuth();
  }

  /**
   * Get client performance statistics
   */
  getStats() {
    if (this.httpClient instanceof EnhancedHttpClient) {
      return this.httpClient.getStats();
    }
    return null;
  }

  /**
   * Clear cache (if caching is enabled)
   */
  clearCache(): void {
    if (this.httpClient instanceof EnhancedHttpClient) {
      this.httpClient.clearCache();
    }
  }

  /**
   * Invalidate cache entries by pattern (if caching is enabled)
   */
  invalidateCache(pattern: string | RegExp): number {
    if (this.httpClient instanceof EnhancedHttpClient) {
      return this.httpClient.invalidateCache(pattern);
    }
    return 0;
  }

  /**
   * Execute multiple patient queries concurrently
   */
  async getPatientsConcurrent(
    queries: PatientSearchParams[],
    options?: {
      maxConcurrency?: number;
      failFast?: boolean;
    }
  ): Promise<Bundle<Patient>[]> {
    const { maxConcurrency = 5, failFast = true } = options || {};
    
    const results: Bundle<Patient>[] = [];
    const errors: Error[] = [];

    // Process queries in batches to respect concurrency limit
    for (let i = 0; i < queries.length; i += maxConcurrency) {
      const batch = queries.slice(i, i + maxConcurrency);
      
      const batchPromises = batch.map(async (params) => {
        try {
          return await this.getPatients(params);
        } catch (error) {
          if (failFast) {
            throw error;
          }
          errors.push(error as Error);
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      
      // Add successful results
      for (const result of batchResults) {
        if (result !== null) {
          results.push(result);
        }
      }
    }

    // If not failing fast, just log errors but return successful results
    if (!failFast && errors.length > 0) {
      console.warn(`${errors.length} queries failed:`, errors.map(e => e.message).join('; '));
    }

    return results;
  }

  /**
   * Get multiple patients by ID concurrently
   */
  async getPatientsByIdConcurrent(
    ids: string[],
    options?: {
      maxConcurrency?: number;
      failFast?: boolean;
    }
  ): Promise<(Patient | null)[]> {
    const { maxConcurrency = 5, failFast = true } = options || {};
    
    const results: (Patient | null)[] = [];
    const errors: Error[] = [];

    // Process IDs in batches to respect concurrency limit
    for (let i = 0; i < ids.length; i += maxConcurrency) {
      const batch = ids.slice(i, i + maxConcurrency);
      
      const batchPromises = batch.map(async (id) => {
        try {
          return await this.getPatientById(id);
        } catch (error) {
          if (failFast) {
            throw error;
          }
          errors.push(error as Error);
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    // If not failing fast, just log errors but return results (including nulls for failures)
    if (!failFast && errors.length > 0) {
      console.warn(`${errors.length} patient fetches failed:`, errors.map(e => e.message).join('; '));
    }

    return results;
  }

  /**
   * Validate client configuration
   */
  private validateConfig(config: FHIRClientConfig): ValidationResult {
    const errors: ValidationError[] = [];

    // Validate base URL
    if (!config.baseUrl) {
      errors.push({
        field: 'baseUrl',
        message: 'Base URL is required',
        code: 'required',
      });
    } else {
      try {
        new URL(config.baseUrl);
      } catch {
        errors.push({
          field: 'baseUrl',
          message: 'Base URL must be a valid URL',
          code: 'invalid-url',
        });
      }
    }

    // Validate timeout
    if (
      config.timeout !== undefined &&
      (config.timeout <= 0 || config.timeout > 300000)
    ) {
      errors.push({
        field: 'timeout',
        message: 'Timeout must be between 1 and 300000 milliseconds',
        code: 'invalid-range',
      });
    }

    // Validate retry attempts
    if (
      config.retryAttempts !== undefined &&
      (config.retryAttempts < 0 || config.retryAttempts > 10)
    ) {
      errors.push({
        field: 'retryAttempts',
        message: 'Retry attempts must be between 0 and 10',
        code: 'invalid-range',
      });
    }

    // Validate authentication configuration
    if (config.auth) {
      try {
        const authValidation = AuthManager.validateConfig(config.auth);
        if (authValidation && !authValidation.isValid) {
          authValidation.errors.forEach(error => {
            errors.push({
              field: 'auth',
              message: error,
              code: 'invalid-auth',
            });
          });
        }
      } catch (authError) {
        errors.push({
          field: 'auth',
          message: 'Authentication configuration validation failed',
          code: 'auth-validation-error',
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Map errors to appropriate FHIR error types with detailed context
   */
  private mapError(error: unknown, context: string): Error {
    // If it's already one of our error types, preserve context
    if (
      error instanceof FHIRValidationError ||
      error instanceof AuthenticationError ||
      error instanceof ConfigurationError
    ) {
      return error;
    }

    if (error instanceof FHIRNetworkError) {
      // Enhance network error with additional context
      const enhancedMessage = `${context}: ${error.message}`;
      return new FHIRNetworkError(enhancedMessage, error.originalError);
    }

    // Handle axios/HTTP errors with detailed mapping
    if (error && typeof error === 'object' && 'response' in error) {
      const httpError = error as ErrorResponse;
      const status = httpError.response?.status;
      const responseData = httpError.response?.data;

      let errorMessage = context;
      let details = httpError.message || 'Unknown error';

      // Map specific HTTP status codes to meaningful messages
      switch (status) {
        case 400:
          errorMessage = `${context}: Bad Request - Invalid parameters or request format`;
          break;
        case 401:
          return new AuthenticationError(
            'Authentication failed',
            undefined,
            'Invalid or expired credentials'
          );
        case 403:
          return new AuthenticationError(
            'Access forbidden',
            undefined,
            'Insufficient permissions to access this resource'
          );
        case 404:
          errorMessage = `${context}: Resource not found`;
          details = 'The requested resource does not exist on the server';
          break;
        case 405:
          errorMessage = `${context}: Method not allowed`;
          details = 'The HTTP method is not supported for this resource';
          break;
        case 409:
          errorMessage = `${context}: Conflict`;
          details =
            'The request conflicts with the current state of the resource';
          break;
        case 410:
          errorMessage = `${context}: Resource gone`;
          details = 'The requested resource is no longer available';
          break;
        case 422:
          errorMessage = `${context}: Unprocessable entity`;
          details = 'The request was well-formed but contains semantic errors';
          break;
        case 429:
          errorMessage = `${context}: Rate limit exceeded`;
          details = 'Too many requests - please retry after some time';
          break;
        case 500:
          errorMessage = `${context}: Internal server error`;
          details = 'The FHIR server encountered an internal error';
          break;
        case 502:
          errorMessage = `${context}: Bad gateway`;
          details = 'The server received an invalid response from upstream';
          break;
        case 503:
          errorMessage = `${context}: Service unavailable`;
          details = 'The FHIR server is temporarily unavailable';
          break;
        case 504:
          errorMessage = `${context}: Gateway timeout`;
          details =
            'The server did not receive a timely response from upstream';
          break;
        default:
          if (status && status >= 400 && status < 500) {
            errorMessage = `${context}: Client error (${status})`;
          } else if (status && status >= 500) {
            errorMessage = `${context}: Server error (${status})`;
          }
      }

      // Include response data if it contains useful error information
      if (responseData && typeof responseData === 'object') {
        const dataWithResourceType = responseData as {
          resourceType?: string;
          issue?: Array<{
            diagnostics?: string;
            details?: { text?: string };
          }>;
        };
        if (dataWithResourceType.resourceType === 'OperationOutcome') {
          const issues = dataWithResourceType.issue || [];
          const diagnostics = issues
            .map(issue => issue.diagnostics || issue.details?.text)
            .filter(Boolean)
            .join('; ');
          if (diagnostics) {
            details = `${details}. Server details: ${diagnostics}`;
          }
        } else if (typeof responseData === 'string') {
          details = `${details}. Server response: ${responseData}`;
        }
      }

      return new FHIRNetworkError(errorMessage, new Error(details || 'Unknown error'));
    }

    // Handle network/connection errors
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      if (message.includes('timeout') || message.includes('etimedout')) {
        return new FHIRNetworkError(
          `${context}: Request timeout`,
          new Error(`The request took too long to complete (timeout: ${this.config.timeout}ms)`)
        );
      }

      if (message.includes('econnrefused')) {
        return new FHIRNetworkError(
          `${context}: Connection refused`,
          new Error(`Unable to connect to the FHIR server at ${this.config.baseUrl}`)
        );
      }

      if (message.includes('enotfound') || message.includes('getaddrinfo')) {
        return new FHIRNetworkError(
          `${context}: Host not found`,
          new Error(`Unable to resolve hostname: ${new URL(this.config.baseUrl).hostname}`)
        );
      }

      if (message.includes('econnreset')) {
        return new FHIRNetworkError(
          `${context}: Connection reset`,
          new Error('The connection was reset by the server')
        );
      }

      if (
        message.includes('cert') ||
        message.includes('ssl') ||
        message.includes('tls')
      ) {
        return new FHIRNetworkError(
          `${context}: SSL/TLS error`,
          new Error(`Certificate or SSL/TLS error: ${error.message}`)
        );
      }

      return new FHIRNetworkError(
        `${context}: ${error.message}`,
        error
      );
    }

    // Fallback for unknown errors
    return new FHIRNetworkError(
      `${context}: Unknown error`,
      new Error(`An unexpected error occurred: ${String(error)}`)
    );
  }

  /**
   * Destroy client and cleanup resources
   */
  async destroy(): Promise<void> {
    if (this.httpClient instanceof EnhancedHttpClient) {
      await this.httpClient.destroy();
    }
  }
}
