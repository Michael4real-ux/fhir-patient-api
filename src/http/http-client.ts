/**
 * HTTP Client implementation using axios with resilience features
 */

import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  AxiosError,
} from 'axios';
import * as https from 'https';
import { HttpResponse, RequestConfig, OperationOutcome } from '../types';
import {
  FHIRNetworkError,
  FHIRServerError,
  RateLimitError,
  ErrorContext,
} from '../errors';
import { ResilienceManager } from '../utils/resilience-manager';

export class HttpClient {
  private axiosInstance: AxiosInstance;
  private resilienceManager: ResilienceManager;

  constructor(config: {
    baseURL: string;
    timeout?: number;
    headers?: Record<string, string>;
    validateSSL?: boolean;
    resilience?: ResilienceManager;
  }) {
    this.axiosInstance = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout || 30000,
      headers: {
        Accept: 'application/fhir+json',
        'Content-Type': 'application/fhir+json',
        ...config.headers,
      },
      // SSL validation - only disable if explicitly set to false
      ...(config.validateSSL === false && {
        httpsAgent: new https.Agent({
          rejectUnauthorized: false,
        }),
      }),
    });

    // Initialize resilience manager
    this.resilienceManager =
      config.resilience ||
      new ResilienceManager({
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
      });

    // Add response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      response => response,
      (error: AxiosError) => {
        throw this.mapAxiosError(error);
      }
    );
  }

  /**
   * Make HTTP request with resilience features
   */
  async request<T = unknown>(config: RequestConfig): Promise<HttpResponse<T>> {
    const context: Partial<ErrorContext> = {
      requestUrl: config.url,
      requestMethod: config.method,
      requestHeaders: config.headers,
      timestamp: new Date().toISOString(),
      correlationId: this.generateCorrelationId(),
    };

    return this.resilienceManager.execute(async () => {
      const axiosConfig: AxiosRequestConfig = {
        method: config.method,
        url: config.url,
      };

      if (config.headers) {
        axiosConfig.headers = config.headers;
      }
      if (config.params) {
        axiosConfig.params = config.params;
      }
      if (config.data) {
        axiosConfig.data = config.data;
      }
      if (config.timeout) {
        axiosConfig.timeout = config.timeout;
      }

      const response: AxiosResponse<T> =
        await this.axiosInstance.request(axiosConfig);

      return {
        data: response.data,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers as Record<string, string>,
      };
    }, context);
  }

  /**
   * Generate correlation ID for request tracking
   */
  private generateCorrelationId(): string {
    return `http-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Map axios errors to appropriate FHIR errors
   */
  private mapAxiosError(error: AxiosError): Error {
    const context: Partial<ErrorContext> = {
      timestamp: new Date().toISOString(),
      correlationId: this.generateCorrelationId(),
    };

    if (error.response) {
      // Server responded with error status
      const status = error.response.status;
      const responseData = error.response.data;

      context.responseHeaders = error.response.headers as Record<
        string,
        string
      >;

      // Handle rate limiting
      if (status === 429) {
        const retryAfter = error.response.headers['retry-after'];
        const retryAfterSeconds = retryAfter
          ? parseInt(retryAfter, 10)
          : undefined;

        return new RateLimitError(
          'Rate limit exceeded',
          retryAfterSeconds,
          context
        );
      }

      // Try to extract FHIR OperationOutcome
      let operationOutcome: OperationOutcome | undefined;
      if (responseData && typeof responseData === 'object') {
        const data = responseData as { resourceType?: string };
        if (data.resourceType === 'OperationOutcome') {
          operationOutcome = data as OperationOutcome;
        }
      }

      return new FHIRServerError(
        `HTTP ${status}: ${error.response.statusText}`,
        status,
        operationOutcome,
        context,
        error.message
      );
    } else if (error.request) {
      // Request was made but no response received
      let message = 'Network error';
      let details = error.message || 'An unknown network error occurred';

      if (error.code === 'ECONNABORTED') {
        message = 'Request timeout';
        details = 'The request took too long to complete';
      } else if (error.code === 'ECONNREFUSED') {
        message = 'Connection refused';
        details = 'Unable to connect to the server';
      } else if (error.code === 'ENOTFOUND') {
        message = 'Host not found';
        details = 'The server hostname could not be resolved';
      } else if (error.code === 'ECONNRESET') {
        message = 'Connection reset';
        details = 'The connection was reset by the server';
      }

      return new FHIRNetworkError(message, error, context, details);
    } else {
      // Something else happened during request setup
      return new FHIRNetworkError(
        'Request setup error',
        error,
        context,
        error.message ||
          'An unknown error occurred while setting up the request'
      );
    }
  }

  /**
   * Update default headers
   */
  setHeaders(headers: Record<string, string>): void {
    Object.assign(this.axiosInstance.defaults.headers, headers);
  }

  /**
   * Remove header
   */
  removeHeader(key: string): void {
    delete this.axiosInstance.defaults.headers[key];
  }

  /**
   * Get resilience manager statistics
   */
  getResilienceStats() {
    return this.resilienceManager.getStats();
  }

  /**
   * Check if HTTP client is healthy
   */
  isHealthy(): boolean {
    return this.resilienceManager.isHealthy();
  }

  /**
   * Reset resilience state
   */
  resetResilience(): void {
    this.resilienceManager.reset();
  }
}
