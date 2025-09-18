# Best Practices Guide

This guide provides recommendations for using the FHIR Patient API effectively, securely, and efficiently in production applications.

## Table of Contents

- [Performance Best Practices](#performance-best-practices)
- [Security Best Practices](#security-best-practices)
- [Error Handling Best Practices](#error-handling-best-practices)
- [Memory Management](#memory-management)
- [Caching Strategies](#caching-strategies)
- [Query Optimization](#query-optimization)
- [Authentication Patterns](#authentication-patterns)
- [Production Deployment](#production-deployment)
- [Monitoring and Observability](#monitoring-and-observability)
- [Testing Strategies](#testing-strategies)

## Performance Best Practices

### 1. Use Appropriate Query Limits

Always limit your queries to avoid overwhelming the server and your application:

```typescript
// ❌ Don't fetch unlimited results
const allPatients = await client.patients().execute();

// ✅ Use reasonable limits
const recentPatients = await client.patients()
  .limit(100)
  .sort('_lastUpdated', 'desc')
  .execute();
```

### 2. Leverage Streaming for Large Datasets

For processing large numbers of resources, use streaming to avoid memory issues:

```typescript
// ❌ Memory intensive for large datasets
const patients = await client.patients().limit(10000).execute();
for (const entry of patients.entry || []) {
  await processPatient(entry.resource);
}

// ✅ Memory efficient streaming
for await (const patient of client.patients().stream({ pageSize: 100 })) {
  await processPatient(patient);
}
```

### 3. Optimize Connection Pooling

Configure connection pooling based on your application's concurrency needs:

```typescript
const client = new FHIRClient({
  baseUrl: 'https://your-server.com/fhir',
  connectionPool: {
    maxConnections: 50, // Adjust based on server capacity
    maxConnectionsPerHost: 20,
    enableHttp2: true, // Use HTTP/2 if server supports it
    enableKeepAlive: true,
    idleTimeout: 60000
  }
});
```

### 4. Use Specific Search Parameters

Be as specific as possible in your queries to reduce server load and improve response times:

```typescript
// ❌ Broad search
const patients = await client.patients()
  .where('name', 'Smith')
  .execute();

// ✅ Specific search
const patients = await client.patients()
  .where('family', 'Smith')
  .where('given', 'John')
  .where('active', true)
  .where('birthdate', 'ge1990-01-01')
  .execute();
```

### 5. Implement Intelligent Caching

Configure caching to balance performance and data freshness:

```typescript
const client = new FHIRClient({
  baseUrl: 'https://your-server.com/fhir',
  cache: {
    enabled: true,
    maxSize: 100 * 1024 * 1024, // 100MB
    defaultTTL: 300000, // 5 minutes for most data
    respectCacheHeaders: true, // Use server cache directives
    staleWhileRevalidate: true, // Serve stale while fetching fresh
    strategy: 'adaptive' // Combines LRU and TTL strategies
  }
});

// Use different TTLs for different data types
await client.use(new CachePlugin({
  rules: [
    { pattern: '/Patient/*', ttl: 600000 }, // 10 minutes for patient data
    { pattern: '/metadata', ttl: 3600000 }, // 1 hour for metadata
    { pattern: '/ValueSet/*', ttl: 86400000 } // 24 hours for value sets
  ]
}));
```

## Security Best Practices

### 1. Secure Token Management

Never hardcode tokens and implement proper token lifecycle management:

```typescript
// ❌ Don't hardcode tokens
const client = new FHIRClient({
  baseUrl: 'https://your-server.com/fhir',
  auth: {
    type: 'bearer',
    token: 'hardcoded-token' // Never do this!
  }
});

// ✅ Use environment variables and token refresh
class SecureTokenManager {
  private token: string | null = null;
  private tokenExpiry: number = 0;
  private refreshToken: string;

  constructor(refreshToken: string) {
    this.refreshToken = refreshToken;
  }

  async getValidToken(): Promise<string> {
    if (!this.token || this.isTokenExpiringSoon()) {
      await this.refreshAccessToken();
    }
    return this.token!;
  }

  private isTokenExpiringSoon(): boolean {
    const bufferTime = 60000; // 1 minute buffer
    return Date.now() >= (this.tokenExpiry - bufferTime);
  }

  private async refreshAccessToken(): Promise<void> {
    const response = await fetch(process.env.TOKEN_ENDPOINT!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
        client_id: process.env.CLIENT_ID!,
        client_secret: process.env.CLIENT_SECRET!
      })
    });

    if (!response.ok) {
      throw new Error('Token refresh failed');
    }

    const data = await response.json();
    this.token = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in * 1000);
  }
}

const tokenManager = new SecureTokenManager(process.env.REFRESH_TOKEN!);

const client = new FHIRClient({
  baseUrl: process.env.FHIR_BASE_URL!,
  auth: {
    type: 'custom',
    getToken: () => tokenManager.getValidToken()
  }
});
```

### 2. Validate and Sanitize Input

Always validate user input before using it in queries:

```typescript
import { z } from 'zod';

const PatientSearchSchema = z.object({
  family: z.string().min(1).max(100).regex(/^[a-zA-Z\s\-']+$/),
  given: z.string().min(1).max(100).regex(/^[a-zA-Z\s\-']+$/).optional(),
  birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  gender: z.enum(['male', 'female', 'other', 'unknown']).optional()
});

async function searchPatients(userInput: unknown) {
  try {
    const validatedInput = PatientSearchSchema.parse(userInput);
    
    const queryBuilder = client.patients()
      .where('family', validatedInput.family);
    
    if (validatedInput.given) {
      queryBuilder.where('given', validatedInput.given);
    }
    
    if (validatedInput.birthdate) {
      queryBuilder.where('birthdate', validatedInput.birthdate);
    }
    
    if (validatedInput.gender) {
      queryBuilder.where('gender', validatedInput.gender);
    }
    
    return await queryBuilder.execute();
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid input: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw error;
  }
}
```

### 3. Implement Rate Limiting

Protect your application and the FHIR server with rate limiting:

```typescript
class RateLimitPlugin implements FHIRPlugin {
  name = 'rate-limit';
  private requestTimes: number[] = [];
  private maxRequestsPerMinute: number;

  constructor(maxRequestsPerMinute: number = 60) {
    this.maxRequestsPerMinute = maxRequestsPerMinute;
  }

  async beforeRequest(request: FHIRRequest): Promise<FHIRRequest> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Remove old requests
    this.requestTimes = this.requestTimes.filter(time => time > oneMinuteAgo);

    if (this.requestTimes.length >= this.maxRequestsPerMinute) {
      const oldestRequest = Math.min(...this.requestTimes);
      const waitTime = 60000 - (now - oldestRequest);
      
      throw new Error(`Rate limit exceeded. Wait ${Math.ceil(waitTime / 1000)} seconds.`);
    }

    this.requestTimes.push(now);
    return request;
  }
}

await client.use(new RateLimitPlugin(100)); // 100 requests per minute
```

### 4. Secure Logging

Be careful not to log sensitive information:

```typescript
class SecureLoggingPlugin implements FHIRPlugin {
  name = 'secure-logging';
  private sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
  private sensitiveFields = ['ssn', 'mrn', 'phone', 'email'];

  async beforeRequest(request: FHIRRequest): Promise<FHIRRequest> {
    const sanitizedHeaders = this.sanitizeHeaders(request.headers);
    console.log('Request:', {
      method: request.method,
      url: this.sanitizeUrl(request.url),
      headers: sanitizedHeaders
    });
    return request;
  }

  private sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const sanitized = { ...headers };
    for (const header of this.sensitiveHeaders) {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    }
    return sanitized;
  }

  private sanitizeUrl(url: string): string {
    // Remove sensitive query parameters
    const urlObj = new URL(url);
    for (const [key] of urlObj.searchParams) {
      if (this.sensitiveFields.some(field => key.toLowerCase().includes(field))) {
        urlObj.searchParams.set(key, '[REDACTED]');
      }
    }
    return urlObj.toString();
  }
}
```

## Error Handling Best Practices

### 1. Implement Comprehensive Error Handling

Handle different types of errors appropriately:

```typescript
import { 
  FHIRServerError, 
  FHIRNetworkError, 
  FHIRValidationError, 
  FHIRAuthenticationError 
} from 'fhir-patient-api';

class PatientService {
  private client: FHIRClient;
  private logger: Logger;

  async getPatient(id: string): Promise<Patient | null> {
    try {
      return await getPatientById(this.client, id);
    } catch (error) {
      return this.handleError(error, 'getPatient', { patientId: id });
    }
  }

  private async handleError(error: any, operation: string, context: any): Promise<any> {
    const errorContext = { operation, context, timestamp: new Date().toISOString() };

    if (error instanceof FHIRServerError) {
      this.logger.error('FHIR server error', { ...errorContext, statusCode: error.statusCode });
      
      switch (error.statusCode) {
        case 404:
          return null; // Resource not found
        case 429:
          // Rate limited - implement exponential backoff
          await this.waitAndRetry(error);
          return this.retryOperation(operation, context);
        case 503:
          // Service unavailable - try fallback
          return this.tryFallback(operation, context);
        default:
          throw error; // Re-throw other server errors
      }
    } else if (error instanceof FHIRNetworkError) {
      this.logger.error('Network error', { ...errorContext, originalError: error.originalError.message });
      
      // Implement retry with exponential backoff
      return this.retryWithBackoff(() => this.retryOperation(operation, context));
    } else if (error instanceof FHIRAuthenticationError) {
      this.logger.error('Authentication error', errorContext);
      
      // Try to refresh token and retry once
      await this.refreshAuthentication();
      return this.retryOperation(operation, context);
    } else if (error instanceof FHIRValidationError) {
      this.logger.error('Validation error', { ...errorContext, validationErrors: error.validationErrors });
      
      // Don't retry validation errors
      throw error;
    } else {
      this.logger.error('Unexpected error', { ...errorContext, error: error.message });
      throw error;
    }
  }

  private async waitAndRetry(error: FHIRServerError): Promise<void> {
    // Check for Retry-After header
    const retryAfter = error.context?.headers?.['retry-after'];
    const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 5000;
    
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  private async retryWithBackoff<T>(
    fn: () => Promise<T>, 
    maxRetries: number = 3
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (attempt === maxRetries) throw error;
        
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw new Error('Max retries exceeded');
  }
}
```

### 2. Circuit Breaker Pattern

Implement circuit breaker to prevent cascading failures:

```typescript
const client = new FHIRClient({
  baseUrl: 'https://your-server.com/fhir',
  circuitBreaker: {
    enabled: true,
    failureThreshold: 10, // Open after 10 consecutive failures
    resetTimeout: 60000, // Try again after 1 minute
    monitoringPeriod: 120000, // Monitor failures over 2 minutes
    halfOpenMaxCalls: 3 // Allow 3 test calls in half-open state
  }
});
```

## Memory Management

### 1. Process Large Datasets Efficiently

Use streaming and pagination for large datasets:

```typescript
class PatientProcessor {
  private processedCount = 0;
  private batchSize = 100;

  async processAllPatients(): Promise<void> {
    console.log('Starting patient processing...');
    
    for await (const patient of this.client.patients().stream({ 
      pageSize: this.batchSize 
    })) {
      await this.processPatient(patient);
      this.processedCount++;
      
      // Log progress and check memory usage
      if (this.processedCount % 1000 === 0) {
        this.logProgress();
        await this.checkMemoryUsage();
      }
    }
    
    console.log(`Processing complete. Processed ${this.processedCount} patients.`);
  }

  private async processPatient(patient: Patient): Promise<void> {
    // Process individual patient
    // Keep processing logic lightweight to avoid memory buildup
  }

  private logProgress(): void {
    const memUsage = process.memoryUsage();
    console.log(`Processed ${this.processedCount} patients. Memory: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
  }

  private async checkMemoryUsage(): Promise<void> {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    
    if (heapUsedMB > 500) { // 500MB threshold
      console.warn('High memory usage detected, forcing garbage collection...');
      
      if (global.gc) {
        global.gc();
      }
      
      // Optional: pause processing briefly to allow GC
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}
```

### 2. Proper Resource Cleanup

Always clean up resources to prevent memory leaks:

```typescript
class FHIRService {
  private client: FHIRClient;
  private plugins: FHIRPlugin[] = [];

  constructor(config: FHIRClientConfig) {
    this.client = new FHIRClient(config);
  }

  async initialize(): Promise<void> {
    // Add plugins
    const loggingPlugin = new LoggingPlugin();
    const metricsPlugin = new MetricsPlugin();
    
    await this.client.use(loggingPlugin);
    await this.client.use(metricsPlugin);
    
    this.plugins.push(loggingPlugin, metricsPlugin);
  }

  async destroy(): Promise<void> {
    // Clean up plugins
    for (const plugin of this.plugins) {
      if (plugin.destroy) {
        await plugin.destroy();
      }
    }
    
    // Clean up client
    await this.client.destroy();
    
    // Clear references
    this.plugins = [];
  }
}

// Use with proper cleanup
const service = new FHIRService(config);
try {
  await service.initialize();
  // Use service...
} finally {
  await service.destroy();
}
```

## Caching Strategies

### 1. Tiered Caching

Implement different caching strategies for different types of data:

```typescript
const client = new FHIRClient({
  baseUrl: 'https://your-server.com/fhir',
  cache: {
    enabled: true,
    maxSize: 200 * 1024 * 1024, // 200MB total cache
    strategy: 'adaptive'
  }
});

// Custom cache plugin with different TTLs
class TieredCachePlugin implements FHIRPlugin {
  name = 'tiered-cache';
  
  private getCacheTTL(url: string): number {
    if (url.includes('/metadata')) return 3600000; // 1 hour
    if (url.includes('/ValueSet')) return 86400000; // 24 hours
    if (url.includes('/Patient')) return 300000; // 5 minutes
    if (url.includes('/Observation')) return 60000; // 1 minute
    return 300000; // Default 5 minutes
  }

  async beforeRequest(request: FHIRRequest): Promise<FHIRRequest> {
    const ttl = this.getCacheTTL(request.url);
    request.context = { ...request.context, cacheTTL: ttl };
    return request;
  }
}

await client.use(new TieredCachePlugin());
```

### 2. Cache Warming

Pre-populate cache with frequently accessed data:

```typescript
class CacheWarmer {
  constructor(private client: FHIRClient) {}

  async warmCache(): Promise<void> {
    console.log('Warming cache with frequently accessed data...');
    
    // Warm with metadata
    await this.client.read('metadata', '');
    
    // Warm with common value sets
    const commonValueSets = [
      'administrative-gender',
      'marital-status',
      'contact-point-system'
    ];
    
    for (const valueSet of commonValueSets) {
      try {
        await this.client.query('ValueSet', { url: `http://hl7.org/fhir/ValueSet/${valueSet}` });
      } catch (error) {
        console.warn(`Failed to warm cache for ValueSet ${valueSet}:`, error.message);
      }
    }
    
    // Warm with recent patients (if appropriate for your use case)
    await this.client.patients()
      .where('_lastUpdated', `gt${new Date(Date.now() - 86400000).toISOString()}`) // Last 24 hours
      .limit(100)
      .execute();
    
    console.log('Cache warming complete');
  }
}

// Warm cache on application startup
const cacheWarmer = new CacheWarmer(client);
await cacheWarmer.warmCache();
```

## Query Optimization

### 1. Use Appropriate Search Parameters

Choose the most efficient search parameters for your queries:

```typescript
// ❌ Inefficient - uses contains search
const patients = await client.patients()
  .where('name:contains', 'Smith')
  .execute();

// ✅ More efficient - uses exact match on family name
const patients = await client.patients()
  .where('family', 'Smith')
  .execute();

// ✅ Even better - combine multiple specific parameters
const patients = await client.patients()
  .where('family', 'Smith')
  .where('given', 'John')
  .where('active', true)
  .execute();
```

### 2. Optimize Includes

Be selective with included resources:

```typescript
// ❌ Don't include everything
const patients = await client.patients()
  .include('*') // Includes all possible references
  .execute();

// ✅ Include only what you need
const patients = await client.patients()
  .include('Patient:general-practitioner')
  .include('Patient:organization')
  .execute();
```

### 3. Use Count Queries When Appropriate

Use count queries when you only need the total number:

```typescript
// ❌ Fetching data just to count
const bundle = await client.patients().where('active', true).execute();
const count = bundle.total;

// ✅ Use count query
const count = await client.patients().where('active', true).count();
```

## Authentication Patterns

### 1. Token Refresh Strategy

Implement proactive token refresh:

```typescript
class ProactiveTokenManager {
  private token: string | null = null;
  private tokenExpiry: number = 0;
  private refreshPromise: Promise<void> | null = null;

  async getToken(): Promise<string> {
    // If token is expiring soon and no refresh is in progress, start refresh
    if (this.isTokenExpiringSoon() && !this.refreshPromise) {
      this.refreshPromise = this.refreshToken();
    }

    // Wait for any ongoing refresh
    if (this.refreshPromise) {
      await this.refreshPromise;
      this.refreshPromise = null;
    }

    if (!this.token) {
      throw new Error('No valid token available');
    }

    return this.token;
  }

  private isTokenExpiringSoon(): boolean {
    const bufferTime = 300000; // 5 minutes buffer
    return Date.now() >= (this.tokenExpiry - bufferTime);
  }

  private async refreshToken(): Promise<void> {
    // Implement token refresh logic
    const response = await this.callTokenEndpoint();
    this.token = response.access_token;
    this.tokenExpiry = Date.now() + (response.expires_in * 1000);
  }
}
```

### 2. Multi-Tenant Authentication

Handle multiple tenants or contexts:

```typescript
class MultiTenantFHIRClient {
  private clients: Map<string, FHIRClient> = new Map();

  async getClient(tenantId: string): Promise<FHIRClient> {
    if (!this.clients.has(tenantId)) {
      const config = await this.getTenantConfig(tenantId);
      const client = new FHIRClient(config);
      this.clients.set(tenantId, client);
    }

    return this.clients.get(tenantId)!;
  }

  private async getTenantConfig(tenantId: string): Promise<FHIRClientConfig> {
    // Fetch tenant-specific configuration
    const tenantConfig = await this.fetchTenantConfig(tenantId);
    
    return {
      baseUrl: tenantConfig.fhirBaseUrl,
      auth: {
        type: 'bearer',
        token: await this.getTenantToken(tenantId)
      },
      cache: {
        enabled: true,
        maxSize: 50 * 1024 * 1024 // 50MB per tenant
      }
    };
  }

  async destroy(): Promise<void> {
    for (const client of this.clients.values()) {
      await client.destroy();
    }
    this.clients.clear();
  }
}
```

## Production Deployment

### 1. Environment Configuration

Use environment-specific configurations:

```typescript
interface AppConfig {
  fhir: FHIRClientConfig;
  logging: LoggingConfig;
  monitoring: MonitoringConfig;
}

function createProductionConfig(): AppConfig {
  return {
    fhir: {
      baseUrl: process.env.FHIR_BASE_URL!,
      timeout: parseInt(process.env.FHIR_TIMEOUT || '30000'),
      retries: parseInt(process.env.FHIR_RETRIES || '3'),
      
      auth: {
        type: 'oauth2',
        clientId: process.env.FHIR_CLIENT_ID!,
        clientSecret: process.env.FHIR_CLIENT_SECRET!,
        tokenUrl: process.env.FHIR_TOKEN_URL!,
        scopes: process.env.FHIR_SCOPES?.split(',') || ['patient/*.read']
      },
      
      cache: {
        enabled: true,
        maxSize: parseInt(process.env.FHIR_CACHE_SIZE || '104857600'), // 100MB
        defaultTTL: parseInt(process.env.FHIR_CACHE_TTL || '300000'), // 5 minutes
        respectCacheHeaders: true,
        staleWhileRevalidate: true
      },
      
      connectionPool: {
        maxConnections: parseInt(process.env.FHIR_MAX_CONNECTIONS || '50'),
        maxConnectionsPerHost: parseInt(process.env.FHIR_MAX_CONNECTIONS_PER_HOST || '20'),
        enableHttp2: process.env.FHIR_ENABLE_HTTP2 === 'true',
        connectionTimeout: parseInt(process.env.FHIR_CONNECTION_TIMEOUT || '30000')
      },
      
      circuitBreaker: {
        enabled: true,
        failureThreshold: parseInt(process.env.FHIR_CIRCUIT_BREAKER_THRESHOLD || '10'),
        resetTimeout: parseInt(process.env.FHIR_CIRCUIT_BREAKER_RESET || '60000')
      }
    },
    
    logging: {
      level: process.env.LOG_LEVEL || 'info',
      format: process.env.LOG_FORMAT || 'json'
    },
    
    monitoring: {
      enabled: process.env.MONITORING_ENABLED === 'true',
      endpoint: process.env.MONITORING_ENDPOINT
    }
  };
}
```

### 2. Health Checks

Implement health checks for monitoring:

```typescript
class HealthChecker {
  constructor(private client: FHIRClient) {}

  async checkHealth(): Promise<HealthStatus> {
    const checks: HealthCheck[] = [];

    // Check FHIR server connectivity
    checks.push(await this.checkFHIRConnectivity());
    
    // Check authentication
    checks.push(await this.checkAuthentication());
    
    // Check cache health
    checks.push(await this.checkCacheHealth());
    
    // Check memory usage
    checks.push(await this.checkMemoryUsage());

    const overallStatus = checks.every(check => check.status === 'healthy') 
      ? 'healthy' 
      : 'unhealthy';

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks
    };
  }

  private async checkFHIRConnectivity(): Promise<HealthCheck> {
    try {
      const start = Date.now();
      await this.client.read('metadata', '');
      const duration = Date.now() - start;

      return {
        name: 'fhir-connectivity',
        status: duration < 5000 ? 'healthy' : 'degraded',
        responseTime: duration,
        message: `FHIR server responded in ${duration}ms`
      };
    } catch (error) {
      return {
        name: 'fhir-connectivity',
        status: 'unhealthy',
        message: `FHIR server unreachable: ${error.message}`
      };
    }
  }

  private async checkCacheHealth(): Promise<HealthCheck> {
    const stats = this.client.getStats();
    const cacheUsagePercent = (stats.cache.size / stats.cache.maxSize) * 100;

    return {
      name: 'cache-health',
      status: cacheUsagePercent < 90 ? 'healthy' : 'degraded',
      metrics: {
        hitRate: stats.cache.hitRate,
        usagePercent: cacheUsagePercent,
        evictions: stats.cache.evictions
      }
    };
  }
}

// Use in health endpoint
app.get('/health', async (req, res) => {
  const healthChecker = new HealthChecker(client);
  const health = await healthChecker.checkHealth();
  
  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});
```

## Monitoring and Observability

### 1. Metrics Collection

Implement comprehensive metrics collection:

```typescript
class MetricsCollector implements FHIRPlugin {
  name = 'metrics-collector';
  private metrics = {
    requestCount: 0,
    errorCount: 0,
    responseTimes: [] as number[],
    cacheHits: 0,
    cacheMisses: 0
  };

  async beforeRequest(request: FHIRRequest): Promise<FHIRRequest> {
    request.context = { 
      ...request.context, 
      startTime: Date.now() 
    };
    return request;
  }

  async afterResponse(response: FHIRResponse): Promise<FHIRResponse> {
    this.metrics.requestCount++;
    
    const startTime = response.context?.startTime;
    if (startTime) {
      const responseTime = Date.now() - startTime;
      this.metrics.responseTimes.push(responseTime);
      
      // Keep only last 1000 response times
      if (this.metrics.responseTimes.length > 1000) {
        this.metrics.responseTimes = this.metrics.responseTimes.slice(-1000);
      }
    }

    // Track cache hits/misses
    if (response.headers?.['x-cache'] === 'HIT') {
      this.metrics.cacheHits++;
    } else {
      this.metrics.cacheMisses++;
    }

    return response;
  }

  async onError(error: any): Promise<any> {
    this.metrics.errorCount++;
    return error;
  }

  getMetrics() {
    const responseTimes = this.metrics.responseTimes;
    const sortedTimes = [...responseTimes].sort((a, b) => a - b);
    
    return {
      requests: {
        total: this.metrics.requestCount,
        errors: this.metrics.errorCount,
        errorRate: this.metrics.requestCount > 0 
          ? this.metrics.errorCount / this.metrics.requestCount 
          : 0
      },
      performance: {
        averageResponseTime: responseTimes.length > 0 
          ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
          : 0,
        p50: this.getPercentile(sortedTimes, 0.5),
        p95: this.getPercentile(sortedTimes, 0.95),
        p99: this.getPercentile(sortedTimes, 0.99)
      },
      cache: {
        hits: this.metrics.cacheHits,
        misses: this.metrics.cacheMisses,
        hitRate: (this.metrics.cacheHits + this.metrics.cacheMisses) > 0
          ? this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses)
          : 0
      }
    };
  }

  private getPercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil(sortedArray.length * percentile) - 1;
    return sortedArray[Math.max(0, index)];
  }
}
```

### 2. Structured Logging

Implement structured logging for better observability:

```typescript
class StructuredLoggingPlugin implements FHIRPlugin {
  name = 'structured-logging';
  
  constructor(private logger: Logger) {}

  async beforeRequest(request: FHIRRequest): Promise<FHIRRequest> {
    const requestId = this.generateRequestId();
    request.context = { ...request.context, requestId };

    this.logger.info('FHIR request started', {
      requestId,
      method: request.method,
      url: this.sanitizeUrl(request.url),
      timestamp: new Date().toISOString()
    });

    return request;
  }

  async afterResponse(response: FHIRResponse): Promise<FHIRResponse> {
    const requestId = response.context?.requestId;
    const startTime = response.context?.startTime;
    const duration = startTime ? Date.now() - startTime : undefined;

    this.logger.info('FHIR request completed', {
      requestId,
      status: response.status,
      duration,
      cacheHit: response.headers?.['x-cache'] === 'HIT',
      timestamp: new Date().toISOString()
    });

    return response;
  }

  async onError(error: any): Promise<any> {
    const requestId = error.context?.requestId;

    this.logger.error('FHIR request failed', {
      requestId,
      error: error.message,
      errorCode: error.code,
      statusCode: error.statusCode,
      timestamp: new Date().toISOString()
    });

    return error;
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private sanitizeUrl(url: string): string {
    // Remove sensitive information from URL for logging
    return url.replace(/([?&])(identifier|phone|email)=([^&]*)/gi, '$1$2=[REDACTED]');
  }
}
```

## Testing Strategies

### 1. Unit Testing with Mocks

Create comprehensive unit tests with proper mocking:

```typescript
import { jest } from '@jest/globals';
import { FHIRClient, getPatients } from 'fhir-patient-api';

describe('PatientService', () => {
  let mockClient: jest.Mocked<FHIRClient>;
  let patientService: PatientService;

  beforeEach(() => {
    mockClient = {
      patients: jest.fn(),
      query: jest.fn(),
      read: jest.fn(),
      getStats: jest.fn(),
      clearCache: jest.fn(),
      destroy: jest.fn()
    } as any;

    patientService = new PatientService(mockClient);
  });

  describe('getActivePatients', () => {
    it('should return active patients', async () => {
      const mockBundle = {
        resourceType: 'Bundle',
        total: 2,
        entry: [
          { resource: { resourceType: 'Patient', id: '1', active: true } },
          { resource: { resourceType: 'Patient', id: '2', active: true } }
        ]
      };

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(mockBundle)
      };

      mockClient.patients.mockReturnValue(mockQueryBuilder as any);

      const result = await patientService.getActivePatients(10);

      expect(mockClient.patients).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('active', true);
      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(10);
      expect(result).toHaveLength(2);
    });

    it('should handle server errors gracefully', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        execute: jest.fn().mockRejectedValue(new FHIRServerError('Server error', 500))
      };

      mockClient.patients.mockReturnValue(mockQueryBuilder as any);

      await expect(patientService.getActivePatients(10)).rejects.toThrow('Server error');
    });
  });
});
```

### 2. Integration Testing

Create integration tests with real FHIR servers:

```typescript
describe('FHIR Integration Tests', () => {
  let client: FHIRClient;

  beforeAll(async () => {
    client = new FHIRClient({
      baseUrl: process.env.TEST_FHIR_BASE_URL || 'https://hapi.fhir.org/baseR4',
      timeout: 30000
    });
  });

  afterAll(async () => {
    await client.destroy();
  });

  describe('Patient Operations', () => {
    it('should fetch patients successfully', async () => {
      const patients = await getPatients(client, { _count: 5 });
      
      expect(patients.resourceType).toBe('Bundle');
      expect(patients.entry).toBeDefined();
      expect(patients.entry!.length).toBeGreaterThan(0);
      expect(patients.entry!.length).toBeLessThanOrEqual(5);
    });

    it('should handle pagination correctly', async () => {
      const firstPage = await client.patients().limit(3).execute();
      expect(firstPage.entry).toHaveLength(3);

      // Check if there's a next link
      const nextLink = firstPage.link?.find(link => link.relation === 'next');
      if (nextLink) {
        // Fetch next page using the link
        const nextPageUrl = new URL(nextLink.url);
        const offsetParam = nextPageUrl.searchParams.get('_offset');
        
        const secondPage = await client.patients()
          .limit(3)
          .where('_offset', offsetParam!)
          .execute();
        
        expect(secondPage.entry).toBeDefined();
        
        // Ensure different patients on different pages
        const firstPageIds = firstPage.entry?.map(e => e.resource?.id) || [];
        const secondPageIds = secondPage.entry?.map(e => e.resource?.id) || [];
        
        expect(firstPageIds).not.toEqual(secondPageIds);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 errors for non-existent patients', async () => {
      await expect(
        getPatientById(client, 'non-existent-patient-id')
      ).rejects.toThrow();
    });

    it('should handle invalid search parameters', async () => {
      await expect(
        client.patients().where('invalid-parameter', 'value').execute()
      ).rejects.toThrow();
    });
  });
});
```

### 3. Performance Testing

Create performance tests to ensure scalability:

```typescript
describe('Performance Tests', () => {
  let client: FHIRClient;

  beforeAll(async () => {
    client = new FHIRClient({
      baseUrl: process.env.TEST_FHIR_BASE_URL || 'https://hapi.fhir.org/baseR4',
      cache: { enabled: true, maxSize: 10 * 1024 * 1024 }
    });
  });

  afterAll(async () => {
    await client.destroy();
  });

  it('should handle concurrent requests efficiently', async () => {
    const concurrentRequests = 10;
    const startTime = Date.now();

    const promises = Array.from({ length: concurrentRequests }, (_, i) =>
      client.patients().limit(5).where('_offset', (i * 5).toString()).execute()
    );

    const results = await Promise.all(promises);
    const duration = Date.now() - startTime;

    expect(results).toHaveLength(concurrentRequests);
    expect(duration).toBeLessThan(30000); // Should complete within 30 seconds
    
    console.log(`${concurrentRequests} concurrent requests completed in ${duration}ms`);
  });

  it('should demonstrate cache effectiveness', async () => {
    // First request (cache miss)
    const startTime1 = Date.now();
    const result1 = await client.patients().limit(5).execute();
    const duration1 = Date.now() - startTime1;

    // Second identical request (cache hit)
    const startTime2 = Date.now();
    const result2 = await client.patients().limit(5).execute();
    const duration2 = Date.now() - startTime2;

    expect(result1.total).toBe(result2.total);
    expect(duration2).toBeLessThan(duration1); // Cache should be faster
    
    console.log(`First request: ${duration1}ms, Second request: ${duration2}ms`);
  });

  it('should handle streaming large datasets efficiently', async () => {
    const startTime = Date.now();
    let count = 0;
    const maxPatients = 100;

    for await (const patient of client.patients().stream({ pageSize: 10 })) {
      count++;
      expect(patient.resourceType).toBe('Patient');
      
      if (count >= maxPatients) break;
    }

    const duration = Date.now() - startTime;
    const patientsPerSecond = (count / duration) * 1000;

    expect(count).toBe(maxPatients);
    console.log(`Streamed ${count} patients in ${duration}ms (${patientsPerSecond.toFixed(2)} patients/sec)`);
  });
});
```

These best practices will help you build robust, efficient, and maintainable applications using the FHIR Patient API. Remember to adapt these patterns to your specific use case and requirements.