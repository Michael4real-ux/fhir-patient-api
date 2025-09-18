/**
 * HTTP Client implementation using axios
 */

import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  AxiosError,
} from 'axios';
import https from 'https';
import { HttpResponse, RequestConfig } from '../types';
import { NetworkError } from '../errors';

export class HttpClient {
  private axiosInstance: AxiosInstance;

  constructor(config: {
    baseURL: string;
    timeout?: number;
    headers?: Record<string, string>;
    validateSSL?: boolean;
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

    // Add response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      response => response,
      (error: AxiosError) => {
        throw this.mapAxiosError(error);
      }
    );
  }

  /**
   * Make HTTP request with retry logic
   */
  async request<T = unknown>(config: RequestConfig): Promise<HttpResponse<T>> {
    const maxRetries = 3;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
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
      } catch (error) {
        lastError = error as Error;

        // Don't retry on client errors (4xx) or authentication errors
        if (this.isNonRetryableError(error as AxiosError)) {
          break;
        }

        // Don't retry on the last attempt
        if (attempt === maxRetries) {
          break;
        }

        // Exponential backoff: wait 1s, 2s, 4s
        const delay = Math.pow(2, attempt) * 1000;
        await this.sleep(delay);
      }
    }

    if (!lastError) {
      throw new NetworkError(
        'Request failed',
        undefined,
        'Unknown error occurred'
      );
    }

    if (lastError instanceof NetworkError) {
      throw lastError;
    }
    throw this.mapAxiosError(lastError as AxiosError);
  }

  /**
   * Check if error should not be retried
   */
  private isNonRetryableError(error: AxiosError): boolean {
    if (!error.response) {
      return false; // Network errors should be retried
    }

    const status = error.response.status;
    // Don't retry client errors (4xx) except for 429 (rate limit)
    return status >= 400 && status < 500 && status !== 429;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Map axios errors to our NetworkError
   */
  private mapAxiosError(error: AxiosError): NetworkError {
    if (error.response) {
      // Server responded with error status
      return new NetworkError(
        `HTTP ${error.response.status}: ${error.response.statusText}`,
        error.response.status,
        error.message
      );
    } else if (error.request) {
      // Request was made but no response received
      if (error.code === 'ECONNABORTED') {
        return new NetworkError(
          'Request timeout',
          undefined,
          'The request took too long to complete'
        );
      } else if (error.code === 'ECONNREFUSED') {
        return new NetworkError(
          'Connection refused',
          undefined,
          'Unable to connect to the server'
        );
      } else if (error.code === 'ENOTFOUND') {
        return new NetworkError(
          'Host not found',
          undefined,
          'The server hostname could not be resolved'
        );
      } else {
        return new NetworkError(
          'Network error',
          undefined,
          error.message || 'An unknown network error occurred'
        );
      }
    } else {
      // Something else happened
      return new NetworkError(
        'Request error',
        undefined,
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
}
