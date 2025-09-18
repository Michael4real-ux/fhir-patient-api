/**
 * Enhanced HTTP Client with caching and connection pooling
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import http2 from 'http2';
import { HttpResponse, RequestConfig, OperationOutcome } from '../types';
import { FHIRNetworkError, FHIRServerError, RateLimitError, ErrorContext } from '../errors';
import { ResilienceManager } from '../utils/resilience-manager';
import { CacheManager, CacheConfig } from '../cache/cache-manager';
import { ConnectionPool, ConnectionPoolOptions } from './connection-pool';

export interface EnhancedHttpClientOptions {
  baseURL: string;
  timeout?: number;
  headers?: Record<string, string>;
  validateSSL?: boolean;
  resilience?: ResilienceManager;
  cache?: CacheConfig;
  connectionPool?: Partial<ConnectionPoolOptions>;
}

export interface RequestMetrics {
  startTime: number;
  endTime?: number;
  duration?: number;
  cacheHit: boolean;
  connectionType: 'http1' | 'http2';
  retryCount: number;
}

export class EnhancedHttpClient {
  private axiosInstance: AxiosInstance;
  private resilienceManager: ResilienceManager;
  private cacheManager?: CacheManager;
  private connectionPool: ConnectionPool;
  private baseURL: string;
  private requestMetrics = new Map<string, RequestMetrics>();

  constructor(options: EnhancedHttpClientOptions) {
    this.baseURL = options.baseURL;
    
    // Initialize connection pool
    this.connectionPool = new ConnectionPool(options.connectionPool);

    // Initialize cache manager
    if (options.cache?.enabled) {
      this.cacheManager = new CacheManager(options.cache);
    }

    // Initialize resilience manager
    this.resilienceManager = options.resilience || new ResilienceManager({
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

    // Create axios instance with custom adapter for connection pooling
    this.axiosInstance = axios.create({
      baseURL: options.baseURL,
      timeout: options.timeout || 30000,
      headers: {
        Accept: 'application/fhir+json',
        'Content-Type': 'application/fhir+json',
        ...options.headers,
      },
    });

    // Add request interceptor for caching and metrics
    this.axiosInstance.interceptors.request.use(
      (config) => this.handleRequest(config as InternalAxiosRequestConfig),
      (error) => Promise.reject(error)
    );

    // Add response interceptor for caching and error handling
    this.axiosInstance.interceptors.response.use(
      (response) => this.handleResponse(response),
      (error) => this.handleError(error)
    );
  }

  /**
   * Make HTTP request with caching and connection pooling
   */
  async request<T = unknown>(config: RequestConfig): Promise<HttpResponse<T>> {
    const requestId = this.generateRequestId();
    const startTime = Date.now();
    
    // Initialize metrics
    this.requestMetrics.set(requestId, {
      startTime,
      cacheHit: false,
      connectionType: 'http1',
      retryCount: 0,
    });

    const context: Partial<ErrorContext> = {
      requestUrl: config.url,
      requestMethod: config.method,
      requestHeaders: config.headers,
      timestamp: new Date().toISOString(),
      correlationId: requestId,
    };

    try {
      return await this.resilienceManager.execute(async () => {
        // Check cache first
        if (this.cacheManager && config.method === 'GET') {
          const cacheKey = CacheManager.generateKey(config.url!, config.params, config.headers);
          
          // Try to serve from cache
          if (this.cacheManager.canServeFromCache(cacheKey, config.headers)) {
            const cachedResponse = await this.cacheManager.get(cacheKey, config.headers);
            if (cachedResponse) {
              const metrics = this.requestMetrics.get(requestId)!;
              metrics.cacheHit = true;
              metrics.endTime = Date.now();
              metrics.duration = metrics.endTime - metrics.startTime;
              
              return cachedResponse as HttpResponse<T>;
            }
          }

          // Add conditional headers if available
          const validationHeaders = this.cacheManager.getValidationHeaders(cacheKey);
          if (Object.keys(validationHeaders).length > 0) {
            config.headers = { ...config.headers, ...validationHeaders };
          }
        }

        // Make actual request
        const axiosConfig: AxiosRequestConfig & { metadata?: { requestId: string } } = {
          method: config.method,
          url: config.url,
          headers: config.headers,
          params: config.params,
          data: config.data,
          timeout: config.timeout,
          metadata: { requestId }, // Pass request ID for metrics
        };

        const response = await this.axiosInstance.request<T>(axiosConfig);
        
        const httpResponse: HttpResponse<T> = {
          data: response.data,
          status: response.status,
          statusText: response.statusText,
          headers: response.headers as Record<string, string>,
        };

        // Handle 304 Not Modified
        if (response.status === 304 && this.cacheManager && config.method === 'GET') {
          const cacheKey = CacheManager.generateKey(config.url!, config.params, config.headers);
          this.cacheManager.updateFromNotModified(cacheKey, httpResponse);
          
          const cachedResponse = await this.cacheManager.get(cacheKey, config.headers);
          if (cachedResponse) {
            return cachedResponse as HttpResponse<T>;
          }
        }

        // Cache successful GET responses
        if (this.cacheManager && config.method === 'GET' && response.status >= 200 && response.status < 300) {
          const cacheKey = CacheManager.generateKey(config.url!, config.params, config.headers);
          await this.cacheManager.set(cacheKey, httpResponse, config.headers);
        }

        return httpResponse;
      }, context);
    } finally {
      // Finalize metrics
      const metrics = this.requestMetrics.get(requestId);
      if (metrics && !metrics.endTime) {
        metrics.endTime = Date.now();
        metrics.duration = metrics.endTime - metrics.startTime;
      }
      
      // Record request in connection pool
      if (metrics?.duration) {
        this.connectionPool.recordRequest(metrics.duration);
      }
    }
  }

  /**
   * Get client statistics
   */
  getStats() {
    return {
      cache: this.cacheManager?.getStats(),
      connectionPool: this.connectionPool.getStats(),
      resilience: this.resilienceManager.getStats(),
      requests: {
        total: this.requestMetrics.size,
        metrics: Array.from(this.requestMetrics.values()),
      },
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cacheManager?.clear();
  }

  /**
   * Invalidate cache entries
   */
  invalidateCache(pattern: string | RegExp): number {
    return this.cacheManager?.invalidate(pattern) || 0;
  }

  /**
   * Update cache configuration
   */
  updateCacheConfig(config: Partial<CacheConfig>): void {
    this.cacheManager?.updateConfig(config);
  }

  /**
   * Destroy client and cleanup resources
   */
  async destroy(): Promise<void> {
    await this.connectionPool.destroy();
    this.cacheManager?.destroy();
    this.requestMetrics.clear();
  }

  /**
   * Handle request interceptor
   */
  private async handleRequest(config: InternalAxiosRequestConfig): Promise<InternalAxiosRequestConfig> {
    const requestId = (config as InternalAxiosRequestConfig & { metadata?: { requestId: string } }).metadata?.requestId;
    
    // Get connection for this request
    if (config.url) {
      const fullUrl = config.url.startsWith('http') ? config.url : `${this.baseURL}${config.url}`;
      const connection = await this.connectionPool.getConnection(fullUrl);
      
      // Update metrics
      if (requestId) {
        const metrics = this.requestMetrics.get(requestId);
        if (metrics) {
          metrics.connectionType = connection.isHttp2 ? 'http2' : 'http1';
        }
      }

      // Use HTTP/2 if available
      if (connection.isHttp2 && connection.http2Session) {
        // For HTTP/2, we'll use a custom adapter
        config.adapter = this.createHttp2Adapter(connection.http2Session);
      } else if (connection.agent) {
        // Use connection pool agent for HTTP/1.1
        if (fullUrl.startsWith('https:')) {
          config.httpsAgent = connection.agent;
        } else {
          config.httpAgent = connection.agent;
        }
      }
    }

    return config;
  }

  /**
   * Handle response interceptor
   */
  private handleResponse(response: AxiosResponse): AxiosResponse {
    const requestId = (response.config as AxiosRequestConfig & { metadata?: { requestId: string } }).metadata?.requestId;
    
    // Update metrics
    if (requestId) {
      const metrics = this.requestMetrics.get(requestId);
      if (metrics) {
        metrics.endTime = Date.now();
        metrics.duration = metrics.endTime - metrics.startTime;
      }
    }

    return response;
  }

  /**
   * Handle error interceptor
   */
  private handleError(error: unknown): Promise<never> {
    const errorObj = error as { 
      config?: { metadata?: { requestId?: string } };
      response?: {
        status: number;
        statusText: string;
        headers: Record<string, string>;
        data?: { resourceType?: string };
      };
      message?: string;
    };
    
    const requestId = errorObj.config?.metadata?.requestId;
    
    // Update metrics
    if (requestId) {
      const metrics = this.requestMetrics.get(requestId);
      if (metrics) {
        metrics.retryCount++;
        if (!metrics.endTime) {
          metrics.endTime = Date.now();
          metrics.duration = metrics.endTime - metrics.startTime;
        }
      }
    }

    // Map to appropriate error type
    const context: Partial<ErrorContext> = {
      timestamp: new Date().toISOString(),
      correlationId: requestId || this.generateRequestId(),
    };

    if (errorObj.response) {
      const status = errorObj.response.status;
      
      if (status === 429) {
        const retryAfter = errorObj.response.headers['retry-after'];
        const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;
        
        throw new RateLimitError(
          'Rate limit exceeded',
          retryAfterSeconds,
          context
        );
      }

      throw new FHIRServerError(
        `HTTP ${status}: ${errorObj.response.statusText}`,
        status,
        errorObj.response.data?.resourceType === 'OperationOutcome' ? errorObj.response.data as OperationOutcome : undefined,
        context,
        errorObj.message
      );
    } else {
      throw new FHIRNetworkError(
        'Network error',
        error instanceof Error ? error : new Error(String(error)),
        context,
        errorObj.message || 'An unknown network error occurred'
      );
    }
  }

  /**
   * Create HTTP/2 adapter for axios
   */
  private createHttp2Adapter(session: http2.ClientHttp2Session) {
    return (config: AxiosRequestConfig): Promise<AxiosResponse> => {
      return new Promise((resolve, reject) => {
        const headers: Record<string, string> = {
          ':method': config.method?.toUpperCase() || 'GET',
          ':path': config.url || '/',
        };
        
        // Add other headers
        if (config.headers && typeof config.headers === 'object') {
          Object.assign(headers, config.headers);
        }

        const req = session.request(headers);
        
        let responseData = '';
        let responseHeaders: Record<string, any> = {};
        let status = 200;

        req.on('response', (headers) => {
          responseHeaders = headers;
          status = headers[':status'] as number || 200;
        });

        req.on('data', (chunk) => {
          responseData += chunk;
        });

        req.on('end', () => {
          try {
            const data = responseData ? JSON.parse(responseData) : {};
            resolve({
              data,
              status,
              statusText: this.getStatusText(status),
              headers: responseHeaders,
              config,
              request: req,
            } as AxiosResponse);
          } catch (error) {
            reject(error);
          }
        });

        req.on('error', reject);

        // Send data if present
        if (config.data) {
          req.write(typeof config.data === 'string' ? config.data : JSON.stringify(config.data));
        }
        
        req.end();
      });
    };
  }

  /**
   * Get HTTP status text
   */
  private getStatusText(status: number): string {
    const statusTexts: Record<number, string> = {
      200: 'OK',
      201: 'Created',
      204: 'No Content',
      304: 'Not Modified',
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
      504: 'Gateway Timeout',
    };
    
    return statusTexts[status] || 'Unknown';
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }
}