/**
 * Plugin system for custom middleware
 *
 * This module provides a flexible plugin architecture that allows users
 * to extend the FHIR client with custom middleware for logging, metrics,
 * authentication, caching, and other cross-cutting concerns.
 */

import { RequestConfig, HttpResponse } from '../types';
import { FHIRError } from '../errors';

/**
 * Plugin lifecycle hooks
 */
export interface FHIRPlugin {
  /** Plugin name for identification and debugging */
  name: string;
  
  /** Plugin version */
  version?: string;
  
  /** Plugin description */
  description?: string;
  
  /** Called before a request is sent to the FHIR server */
  beforeRequest?(request: FHIRRequest): Promise<FHIRRequest>;
  
  /** Called after a successful response is received */
  afterResponse?(response: FHIRResponse): Promise<FHIRResponse>;
  
  /** Called when an error occurs during request processing */
  onError?(error: FHIRError, request?: FHIRRequest): Promise<FHIRError>;
  
  /** Called when the plugin is installed */
  onInstall?(pluginManager: PluginManager): Promise<void>;
  
  /** Called when the plugin is uninstalled */
  onUninstall?(pluginManager: PluginManager): Promise<void>;
  
  /** Called when the client is destroyed */
  onDestroy?(): Promise<void>;
}

/**
 * Enhanced request object with plugin context
 */
export interface FHIRRequest extends RequestConfig {
  /** Plugin-specific context data */
  context?: Record<string, unknown>;
  
  /** Request timestamp */
  timestamp?: number;
  
  /** Unique request ID for tracing */
  requestId?: string;
  
  /** Resource type being requested (if applicable) */
  resourceType?: string;
  
  /** Operation type (read, search, create, update, delete) */
  operation?: 'read' | 'search' | 'create' | 'update' | 'delete' | 'patch';
}

/**
 * Enhanced response object with plugin context
 */
export interface FHIRResponse<T = unknown> extends HttpResponse<T> {
  /** Plugin-specific context data */
  context?: Record<string, unknown>;
  
  /** Response timestamp */
  timestamp?: number;
  
  /** Request ID for correlation */
  requestId?: string;
  
  /** Response processing time in milliseconds */
  processingTime?: number;
  
  /** Whether response came from cache */
  fromCache?: boolean;
}

/**
 * Plugin execution context
 */
export interface PluginContext {
  /** Current request being processed */
  request?: FHIRRequest;
  
  /** Current response being processed */
  response?: FHIRResponse;
  
  /** Current error being processed */
  error?: FHIRError;
  
  /** Plugin-specific data storage */
  data: Map<string, unknown>;
  
  /** Abort the current operation */
  abort: (reason?: string) => void;
  
  /** Skip remaining plugins in the chain */
  skip: () => void;
}

/**
 * Plugin manager for handling plugin lifecycle and execution
 */
export class PluginManager {
  private plugins: Map<string, FHIRPlugin> = new Map();
  private pluginOrder: string[] = [];
  private isDestroyed = false;

  /**
   * Install a plugin
   */
  async use(plugin: FHIRPlugin): Promise<void> {
    if (this.isDestroyed) {
      throw new Error('Cannot install plugins on destroyed plugin manager');
    }

    if (!plugin.name) {
      throw new Error('Plugin must have a name');
    }

    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin '${plugin.name}' is already installed`);
    }

    // Install the plugin
    this.plugins.set(plugin.name, plugin);
    this.pluginOrder.push(plugin.name);

    // Call plugin installation hook
    if (plugin.onInstall) {
      await plugin.onInstall(this);
    }
  }

  /**
   * Uninstall a plugin
   */
  async unuse(pluginName: string): Promise<boolean> {
    if (this.isDestroyed) {
      throw new Error('Cannot uninstall plugins on destroyed plugin manager');
    }

    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      return false;
    }

    // Call plugin uninstallation hook
    if (plugin.onUninstall) {
      await plugin.onUninstall(this);
    }

    // Remove from collections
    this.plugins.delete(pluginName);
    const index = this.pluginOrder.indexOf(pluginName);
    if (index > -1) {
      this.pluginOrder.splice(index, 1);
    }

    return true;
  }

  /**
   * Get installed plugin by name
   */
  getPlugin(name: string): FHIRPlugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * Get all installed plugins
   */
  getPlugins(): FHIRPlugin[] {
    return this.pluginOrder.map(name => this.plugins.get(name)!);
  }

  /**
   * Check if a plugin is installed
   */
  hasPlugin(name: string): boolean {
    return this.plugins.has(name);
  }

  /**
   * Execute beforeRequest hooks
   */
  async executeBeforeRequest(request: FHIRRequest): Promise<FHIRRequest> {
    if (this.isDestroyed) {
      return request;
    }

    let currentRequest = { ...request };
    const context = this.createContext(currentRequest);

    for (const pluginName of this.pluginOrder) {
      const plugin = this.plugins.get(pluginName);
      if (plugin?.beforeRequest) {
        try {
          context.request = currentRequest;
          currentRequest = await plugin.beforeRequest(currentRequest);
          
          // Check if operation was aborted
          if (context.data.has('aborted')) {
            throw new Error(context.data.get('abortReason') as string || 'Operation aborted by plugin');
          }
          
          // Check if remaining plugins should be skipped
          if (context.data.has('skip')) {
            break;
          }
        } catch (error) {
          throw new Error(`Plugin '${pluginName}' beforeRequest hook failed: ${error}`);
        }
      }
    }

    return currentRequest;
  }

  /**
   * Execute afterResponse hooks
   */
  async executeAfterResponse(response: FHIRResponse): Promise<FHIRResponse> {
    if (this.isDestroyed) {
      return response;
    }

    let currentResponse = { ...response };
    const context = this.createContext(undefined, currentResponse);

    for (const pluginName of this.pluginOrder) {
      const plugin = this.plugins.get(pluginName);
      if (plugin?.afterResponse) {
        try {
          context.response = currentResponse;
          currentResponse = await plugin.afterResponse(currentResponse);
          
          // Check if operation was aborted
          if (context.data.has('aborted')) {
            throw new Error(context.data.get('abortReason') as string || 'Operation aborted by plugin');
          }
          
          // Check if remaining plugins should be skipped
          if (context.data.has('skip')) {
            break;
          }
        } catch (error) {
          throw new Error(`Plugin '${pluginName}' afterResponse hook failed: ${error}`);
        }
      }
    }

    return currentResponse;
  }

  /**
   * Execute onError hooks
   */
  async executeOnError(error: FHIRError, request?: FHIRRequest): Promise<FHIRError> {
    if (this.isDestroyed) {
      return error;
    }

    let currentError = error;
    const context = this.createContext(request, undefined, currentError);

    for (const pluginName of this.pluginOrder) {
      const plugin = this.plugins.get(pluginName);
      if (plugin?.onError) {
        try {
          context.error = currentError;
          currentError = await plugin.onError(currentError, request);
          
          // Check if remaining plugins should be skipped
          if (context.data.has('skip')) {
            break;
          }
        } catch (pluginError) {
          // If a plugin's error handler fails, log it but continue with original error
          console.warn(`Plugin '${pluginName}' onError hook failed:`, pluginError);
        }
      }
    }

    return currentError;
  }

  /**
   * Destroy the plugin manager and cleanup all plugins
   */
  async destroy(): Promise<void> {
    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;

    // Call destroy hooks for all plugins
    const destroyPromises = this.pluginOrder.map(async (pluginName) => {
      const plugin = this.plugins.get(pluginName);
      if (plugin?.onDestroy) {
        try {
          await plugin.onDestroy();
        } catch (error) {
          console.warn(`Plugin '${pluginName}' onDestroy hook failed:`, error);
        }
      }
    });

    await Promise.all(destroyPromises);

    // Clear all plugins
    this.plugins.clear();
    this.pluginOrder.length = 0;
  }

  /**
   * Create plugin execution context
   */
  private createContext(
    request?: FHIRRequest,
    response?: FHIRResponse,
    error?: FHIRError
  ): PluginContext {
    const data = new Map<string, unknown>();
    
    return {
      request,
      response,
      error,
      data,
      abort: (reason?: string) => {
        data.set('aborted', true);
        data.set('abortReason', reason);
      },
      skip: () => {
        data.set('skip', true);
      }
    };
  }
}

/**
 * Built-in plugins
 */

/**
 * Logging plugin for request/response logging
 */
export class LoggingPlugin implements FHIRPlugin {
  name = 'logging';
  version = '1.0.0';
  description = 'Logs FHIR requests and responses';

  constructor(
    private options: {
      logRequests?: boolean;
      logResponses?: boolean;
      logErrors?: boolean;
      logLevel?: 'debug' | 'info' | 'warn' | 'error';
      logger?: {
        debug: (message: string, ...args: unknown[]) => void;
        info: (message: string, ...args: unknown[]) => void;
        warn: (message: string, ...args: unknown[]) => void;
        error: (message: string, ...args: unknown[]) => void;
      };
    } = {}
  ) {
    this.options = {
      logRequests: true,
      logResponses: true,
      logErrors: true,
      logLevel: 'info',
      logger: console,
      ...options
    };
  }

  async beforeRequest(request: FHIRRequest): Promise<FHIRRequest> {
    if (this.options.logRequests) {
      const logger = this.options.logger!;
      const logLevel = this.options.logLevel!;
      
      logger[logLevel](`[FHIR Request] ${request.method} ${request.url}`, {
        requestId: request.requestId,
        resourceType: request.resourceType,
        operation: request.operation,
        timestamp: new Date().toISOString()
      });
    }
    
    return request;
  }

  async afterResponse(response: FHIRResponse): Promise<FHIRResponse> {
    if (this.options.logResponses) {
      const logger = this.options.logger!;
      const logLevel = this.options.logLevel!;
      
      logger[logLevel](`[FHIR Response] ${response.status} ${response.statusText}`, {
        requestId: response.requestId,
        processingTime: response.processingTime,
        fromCache: response.fromCache,
        timestamp: new Date().toISOString()
      });
    }
    
    return response;
  }

  async onError(error: FHIRError, request?: FHIRRequest): Promise<FHIRError> {
    if (this.options.logErrors) {
      const logger = this.options.logger!;
      
      logger.error(`[FHIR Error] ${error.message}`, {
        requestId: request?.requestId,
        url: request?.url,
        method: request?.method,
        error: error.name,
        timestamp: new Date().toISOString()
      });
    }
    
    return error;
  }
}

/**
 * Metrics plugin for collecting performance metrics
 */
export class MetricsPlugin implements FHIRPlugin {
  name = 'metrics';
  version = '1.0.0';
  description = 'Collects FHIR request metrics';

  private metrics = {
    requestCount: 0,
    errorCount: 0,
    totalResponseTime: 0,
    averageResponseTime: 0,
    cacheHitCount: 0,
    cacheMissCount: 0,
    statusCodes: new Map<number, number>()
  };

  async beforeRequest(request: FHIRRequest): Promise<FHIRRequest> {
    request.timestamp = Date.now();
    this.metrics.requestCount++;
    return request;
  }

  async afterResponse(response: FHIRResponse): Promise<FHIRResponse> {
    const now = Date.now();
    if (response.requestId && response.timestamp) {
      const responseTime = now - response.timestamp;
      response.processingTime = responseTime;
      
      this.metrics.totalResponseTime += responseTime;
      this.metrics.averageResponseTime = this.metrics.totalResponseTime / this.metrics.requestCount;
    }

    // Track status codes
    const currentCount = this.metrics.statusCodes.get(response.status) || 0;
    this.metrics.statusCodes.set(response.status, currentCount + 1);

    // Track cache hits/misses
    if (response.fromCache) {
      this.metrics.cacheHitCount++;
    } else {
      this.metrics.cacheMissCount++;
    }

    return response;
  }

  async onError(error: FHIRError): Promise<FHIRError> {
    this.metrics.errorCount++;
    return error;
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      cacheHitRate: this.metrics.cacheHitCount / (this.metrics.cacheHitCount + this.metrics.cacheMissCount) || 0,
      errorRate: this.metrics.errorCount / this.metrics.requestCount || 0,
      statusCodes: Object.fromEntries(this.metrics.statusCodes)
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      requestCount: 0,
      errorCount: 0,
      totalResponseTime: 0,
      averageResponseTime: 0,
      cacheHitCount: 0,
      cacheMissCount: 0,
      statusCodes: new Map<number, number>()
    };
  }
}

/**
 * Request ID plugin for adding unique request identifiers
 */
export class RequestIdPlugin implements FHIRPlugin {
  name = 'request-id';
  version = '1.0.0';
  description = 'Adds unique request IDs for tracing';

  constructor(
    private options: {
      header?: string;
      generator?: () => string;
    } = {}
  ) {
    this.options = {
      header: 'X-Request-ID',
      generator: () => `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      ...options
    };
  }

  async beforeRequest(request: FHIRRequest): Promise<FHIRRequest> {
    const requestId = this.options.generator!();
    
    request.requestId = requestId;
    request.headers = {
      ...request.headers,
      [this.options.header!]: requestId
    };
    
    return request;
  }

  async afterResponse(response: FHIRResponse): Promise<FHIRResponse> {
    // Correlate response with request
    const requestId = response.headers[this.options.header!.toLowerCase()];
    if (requestId) {
      response.requestId = requestId;
    }
    
    return response;
  }
}