# Troubleshooting Guide

This guide helps you diagnose and resolve common issues when using the FHIR Patient API.

## Table of Contents

- [Common Issues](#common-issues)
- [Connection Problems](#connection-problems)
- [Authentication Issues](#authentication-issues)
- [Performance Problems](#performance-problems)
- [Memory Issues](#memory-issues)
- [Cache Problems](#cache-problems)
- [Query Issues](#query-issues)
- [Error Handling](#error-handling)
- [Debugging](#debugging)
- [Best Practices](#best-practices)

## Common Issues

### Issue: "Connection timeout" errors

**Symptoms:**
- Requests fail with timeout errors
- Slow response times
- Intermittent connection failures

**Causes:**
- FHIR server is slow or overloaded
- Network connectivity issues
- Default timeout too low for your use case

**Solutions:**

1. **Increase timeout:**
```typescript
const client = new FHIRClient({
  baseUrl: 'https://your-server.com/fhir',
  timeout: 60000 // 60 seconds instead of default 30
});
```

2. **Enable retries with backoff:**
```typescript
const client = new FHIRClient({
  baseUrl: 'https://your-server.com/fhir',
  retries: 5,
  retryDelay: 2000,
  retryMultiplier: 2,
  retryJitter: true
});
```

3. **Check server status:**
```typescript
try {
  const metadata = await client.read('metadata', '');
  console.log('Server is responding');
} catch (error) {
  console.error('Server connectivity issue:', error);
}
```

### Issue: "Memory usage keeps growing"

**Symptoms:**
- Application memory usage increases over time
- Out of memory errors
- Slow performance after running for a while

**Causes:**
- Loading large datasets into memory
- Cache growing without bounds
- Not properly cleaning up resources

**Solutions:**

1. **Use streaming for large datasets:**
```typescript
// Instead of loading all patients at once
const allPatients = await client.patients().execute(); // ❌ Memory intensive

// Use streaming
for await (const patient of client.patients().stream({ pageSize: 100 })) {
  await processPatient(patient);
  // Each patient is processed individually, not stored in memory
}
```

2. **Configure cache limits:**
```typescript
const client = new FHIRClient({
  baseUrl: 'https://your-server.com/fhir',
  cache: {
    enabled: true,
    maxSize: 50 * 1024 * 1024, // 50MB limit
    defaultTTL: 300000 // 5 minutes
  }
});
```

3. **Clean up resources:**
```typescript
// Always destroy client when done
try {
  // Your code here
} finally {
  await client.destroy();
}
```

### Issue: "Authentication failed" errors

**Symptoms:**
- 401 Unauthorized responses
- 403 Forbidden responses
- Authentication-related error messages

**Causes:**
- Invalid or expired tokens
- Incorrect authentication configuration
- Server authentication requirements not met

**Solutions:**

1. **Verify token validity:**
```typescript
// Enable debug mode to see auth headers
const client = new FHIRClient({
  baseUrl: 'https://your-server.com/fhir',
  debug: true,
  auth: {
    type: 'bearer',
    token: 'your-token'
  }
});
```

2. **Implement token refresh:**
```typescript
const client = new FHIRClient({
  baseUrl: 'https://your-server.com/fhir',
  auth: {
    type: 'custom',
    getToken: async () => {
      // Refresh token logic
      const response = await fetch('/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: storedRefreshToken })
      });
      const data = await response.json();
      return data.accessToken;
    }
  }
});
```

3. **Check server requirements:**
```typescript
// Test with minimal auth first
const client = new FHIRClient({
  baseUrl: 'https://your-server.com/fhir',
  auth: { type: 'none' }
});

try {
  await client.read('metadata', '');
  console.log('Server allows anonymous access');
} catch (error) {
  console.log('Server requires authentication');
}
```

## Connection Problems

### Diagnosing Connection Issues

1. **Test basic connectivity:**
```typescript
import { FHIRClient } from 'fhir-patient-api';

async function testConnection(baseUrl: string) {
  const client = new FHIRClient({
    baseUrl,
    timeout: 10000,
    debug: true
  });

  try {
    console.log('Testing connection to:', baseUrl);
    const start = Date.now();
    
    const metadata = await client.read('metadata', '');
    const duration = Date.now() - start;
    
    console.log(`✅ Connection successful (${duration}ms)`);
    console.log('Server version:', metadata.fhirVersion);
    
    return true;
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    return false;
  } finally {
    await client.destroy();
  }
}

// Test your server
await testConnection('https://your-server.com/fhir');
```

2. **Check network configuration:**
```typescript
const client = new FHIRClient({
  baseUrl: 'https://your-server.com/fhir',
  connectionPool: {
    maxConnections: 10,
    maxConnectionsPerHost: 5,
    connectionTimeout: 30000,
    enableHttp2: false // Disable if server doesn't support it
  }
});
```

### Proxy and Firewall Issues

If you're behind a corporate firewall or proxy:

```typescript
// Configure proxy (if using Node.js)
process.env.HTTP_PROXY = 'http://proxy.company.com:8080';
process.env.HTTPS_PROXY = 'http://proxy.company.com:8080';

const client = new FHIRClient({
  baseUrl: 'https://external-fhir-server.com/fhir',
  headers: {
    'User-Agent': 'MyApp/1.0.0'
  }
});
```

## Authentication Issues

### OAuth 2.0 Troubleshooting

1. **Verify OAuth configuration:**
```typescript
const client = new FHIRClient({
  baseUrl: 'https://your-server.com/fhir',
  auth: {
    type: 'oauth2',
    clientId: 'your-client-id',
    clientSecret: 'your-client-secret',
    tokenUrl: 'https://auth-server.com/oauth/token',
    scopes: ['patient/*.read', 'user/*.read']
  },
  debug: true // Enable to see auth flow
});
```

2. **Handle token expiration:**
```typescript
class TokenManager {
  private token: string | null = null;
  private tokenExpiry: number = 0;

  async getValidToken(): Promise<string> {
    if (!this.token || Date.now() >= this.tokenExpiry) {
      await this.refreshToken();
    }
    return this.token!;
  }

  private async refreshToken(): Promise<void> {
    const response = await fetch('https://auth-server.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: 'your-client-id',
        client_secret: 'your-client-secret',
        scope: 'patient/*.read'
      })
    });

    const data = await response.json();
    this.token = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // 1 minute buffer
  }
}

const tokenManager = new TokenManager();

const client = new FHIRClient({
  baseUrl: 'https://your-server.com/fhir',
  auth: {
    type: 'custom',
    getToken: () => tokenManager.getValidToken()
  }
});
```

### JWT Token Issues

1. **Validate JWT tokens:**
```typescript
import jwt from 'jsonwebtoken';

function validateToken(token: string) {
  try {
    const decoded = jwt.decode(token, { complete: true });
    console.log('Token header:', decoded?.header);
    console.log('Token payload:', decoded?.payload);
    
    // Check expiration
    const payload = decoded?.payload as any;
    if (payload?.exp && payload.exp < Date.now() / 1000) {
      console.warn('Token is expired');
    }
    
    return true;
  } catch (error) {
    console.error('Invalid token:', error);
    return false;
  }
}
```

## Performance Problems

### Slow Query Performance

1. **Optimize queries:**
```typescript
// ❌ Inefficient - fetches all data
const allPatients = await client.patients().execute();

// ✅ Efficient - limit results
const recentPatients = await client.patients()
  .where('_lastUpdated', 'gt2023-01-01')
  .limit(100)
  .sort('_lastUpdated', 'desc')
  .execute();
```

2. **Use appropriate search parameters:**
```typescript
// ❌ Broad search
const patients = await client.patients()
  .where('name', 'Smith')
  .execute();

// ✅ More specific search
const patients = await client.patients()
  .where('family', 'Smith')
  .where('given', 'John')
  .where('active', true)
  .execute();
```

3. **Enable caching:**
```typescript
const client = new FHIRClient({
  baseUrl: 'https://your-server.com/fhir',
  cache: {
    enabled: true,
    maxSize: 100 * 1024 * 1024, // 100MB
    defaultTTL: 600000, // 10 minutes
    respectCacheHeaders: true
  }
});
```

### Connection Pool Optimization

```typescript
const client = new FHIRClient({
  baseUrl: 'https://your-server.com/fhir',
  connectionPool: {
    maxConnections: 50, // Increase for high concurrency
    maxConnectionsPerHost: 20,
    connectionTimeout: 30000,
    idleTimeout: 60000,
    enableHttp2: true, // If server supports it
    enableKeepAlive: true
  }
});
```

## Memory Issues

### Monitoring Memory Usage

```typescript
function logMemoryUsage(label: string) {
  const usage = process.memoryUsage();
  console.log(`${label} - Memory usage:`, {
    rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
    heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
    external: `${Math.round(usage.external / 1024 / 1024)}MB`
  });
}

// Monitor memory during processing
logMemoryUsage('Before processing');

let processedCount = 0;
for await (const patient of client.patients().stream({ pageSize: 50 })) {
  await processPatient(patient);
  processedCount++;
  
  if (processedCount % 1000 === 0) {
    logMemoryUsage(`After ${processedCount} patients`);
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }
}

logMemoryUsage('After processing');
```

### Memory-Efficient Processing

```typescript
// ❌ Memory intensive
async function processAllPatients() {
  const bundle = await client.patients().limit(10000).execute();
  
  for (const entry of bundle.entry || []) {
    await processPatient(entry.resource);
  }
}

// ✅ Memory efficient
async function processAllPatientsStreaming() {
  for await (const patient of client.patients().stream({ pageSize: 100 })) {
    await processPatient(patient);
    // Each patient is garbage collected after processing
  }
}
```

## Cache Problems

### Cache Not Working

1. **Verify cache configuration:**
```typescript
const client = new FHIRClient({
  baseUrl: 'https://your-server.com/fhir',
  cache: {
    enabled: true, // Make sure this is true
    maxSize: 50 * 1024 * 1024,
    defaultTTL: 300000
  },
  debug: true // Enable to see cache hits/misses
});
```

2. **Check cache statistics:**
```typescript
const stats = client.getStats();
console.log('Cache stats:', stats.cache);

if (stats.cache.hitRate < 0.1) {
  console.warn('Low cache hit rate - check if caching is working properly');
}
```

### Cache Taking Too Much Memory

```typescript
// Configure cache limits
const client = new FHIRClient({
  baseUrl: 'https://your-server.com/fhir',
  cache: {
    enabled: true,
    maxSize: 25 * 1024 * 1024, // Reduce cache size
    defaultTTL: 180000, // Reduce TTL to 3 minutes
    strategy: 'lru' // Use LRU eviction
  }
});

// Monitor and clear cache when needed
setInterval(() => {
  const stats = client.getStats();
  if (stats.cache.size > 20 * 1024 * 1024) { // 20MB threshold
    console.log('Cache size exceeded threshold, clearing...');
    client.clearCache();
  }
}, 60000); // Check every minute
```

### Stale Cache Data

```typescript
// Enable cache header compliance
const client = new FHIRClient({
  baseUrl: 'https://your-server.com/fhir',
  cache: {
    enabled: true,
    respectCacheHeaders: true, // Use server cache headers
    staleWhileRevalidate: true, // Serve stale while fetching fresh
    defaultTTL: 300000
  }
});

// Manually invalidate cache when needed
client.invalidateCache('/Patient'); // Invalidate all patient cache entries
```

## Query Issues

### Invalid Search Parameters

```typescript
// Enable validation to catch parameter errors early
const client = new FHIRClient({
  baseUrl: 'https://your-server.com/fhir',
  debug: true
});

try {
  const patients = await client.patients()
    .where('invalid-parameter', 'value') // This will be caught
    .execute();
} catch (error) {
  if (error instanceof FHIRValidationError) {
    console.error('Validation errors:', error.validationErrors);
  }
}
```

### Complex Query Building

```typescript
// Build complex queries step by step
const queryBuilder = client.patients();

// Add conditions based on user input
if (familyName) {
  queryBuilder.where('family', familyName);
}

if (givenName) {
  queryBuilder.where('given', givenName);
}

if (birthDateRange) {
  queryBuilder.where('birthdate', `ge${birthDateRange.start}`);
  queryBuilder.where('birthdate', `le${birthDateRange.end}`);
}

// Debug the final query
console.log('Query URL:', queryBuilder.buildUrl());
console.log('Query params:', queryBuilder.getParams());

const results = await queryBuilder.execute();
```

### Pagination Issues

```typescript
// Handle pagination properly
async function getAllPatients() {
  const allPatients: Patient[] = [];
  let hasMore = true;
  let offset = 0;
  const pageSize = 100;

  while (hasMore) {
    const bundle = await client.patients()
      .limit(pageSize)
      .where('_offset', offset.toString())
      .execute();

    if (bundle.entry) {
      allPatients.push(...bundle.entry.map(e => e.resource!));
    }

    hasMore = bundle.entry?.length === pageSize;
    offset += pageSize;

    console.log(`Fetched ${allPatients.length} patients so far...`);
  }

  return allPatients;
}

// Or use streaming (recommended)
async function processAllPatients() {
  for await (const patient of client.patients().stream()) {
    await processPatient(patient);
  }
}
```

## Error Handling

### Comprehensive Error Handling

```typescript
import { 
  FHIRServerError, 
  FHIRNetworkError, 
  FHIRValidationError, 
  FHIRAuthenticationError 
} from 'fhir-patient-api';

async function robustPatientFetch(patientId: string) {
  try {
    const patient = await getPatientById(client, patientId);
    return patient;
  } catch (error) {
    if (error instanceof FHIRServerError) {
      console.error(`Server error (${error.statusCode}):`, error.message);
      
      if (error.operationOutcome) {
        console.error('Operation outcome:', error.operationOutcome);
      }
      
      // Handle specific status codes
      switch (error.statusCode) {
        case 404:
          console.log('Patient not found');
          return null;
        case 429:
          console.log('Rate limited, waiting before retry...');
          await new Promise(resolve => setTimeout(resolve, 5000));
          return robustPatientFetch(patientId); // Retry
        default:
          throw error; // Re-throw for other server errors
      }
    } else if (error instanceof FHIRNetworkError) {
      console.error('Network error:', error.message);
      console.error('Original error:', error.originalError);
      
      // Implement retry logic for network errors
      return retryWithBackoff(() => getPatientById(client, patientId));
    } else if (error instanceof FHIRAuthenticationError) {
      console.error('Authentication error:', error.message);
      
      // Try to refresh token and retry
      await refreshAuthToken();
      return getPatientById(client, patientId);
    } else if (error instanceof FHIRValidationError) {
      console.error('Validation error:', error.message);
      console.error('Validation errors:', error.validationErrors);
      
      // Don't retry validation errors
      throw error;
    } else {
      console.error('Unexpected error:', error);
      throw error;
    }
  }
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>, 
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error('Max retries exceeded');
}
```

## Debugging

### Enable Debug Mode

```typescript
const client = new FHIRClient({
  baseUrl: 'https://your-server.com/fhir',
  debug: true,
  logLevel: 'debug'
});

// This will log:
// - Request URLs and headers
// - Response status and headers
// - Cache hits/misses
// - Authentication flows
// - Performance metrics
```

### Custom Logging Plugin

```typescript
import { FHIRPlugin, FHIRRequest, FHIRResponse } from 'fhir-patient-api';

class DetailedLoggingPlugin implements FHIRPlugin {
  name = 'detailed-logging';

  async beforeRequest(request: FHIRRequest): Promise<FHIRRequest> {
    console.log('🚀 Request:', {
      method: request.method,
      url: request.url,
      headers: request.headers,
      timestamp: new Date().toISOString()
    });
    return request;
  }

  async afterResponse(response: FHIRResponse): Promise<FHIRResponse> {
    console.log('✅ Response:', {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      dataSize: JSON.stringify(response.data).length,
      timestamp: new Date().toISOString()
    });
    return response;
  }

  async onError(error: any): Promise<any> {
    console.error('❌ Error:', {
      message: error.message,
      code: error.code,
      context: error.context,
      timestamp: new Date().toISOString()
    });
    return error;
  }
}

await client.use(new DetailedLoggingPlugin());
```

### Performance Monitoring

```typescript
class PerformanceMonitor {
  private requestTimes: Map<string, number> = new Map();

  startRequest(requestId: string): void {
    this.requestTimes.set(requestId, Date.now());
  }

  endRequest(requestId: string): number {
    const startTime = this.requestTimes.get(requestId);
    if (!startTime) return 0;
    
    const duration = Date.now() - startTime;
    this.requestTimes.delete(requestId);
    
    console.log(`Request ${requestId} took ${duration}ms`);
    return duration;
  }
}

const monitor = new PerformanceMonitor();

// Use with requests
const requestId = 'patient-search-' + Date.now();
monitor.startRequest(requestId);

try {
  const patients = await client.patients().where('active', true).execute();
  console.log(`Found ${patients.total} patients`);
} finally {
  monitor.endRequest(requestId);
}
```

## Best Practices

### 1. Resource Management

```typescript
// Always clean up resources
class PatientService {
  private client: FHIRClient;

  constructor(config: FHIRClientConfig) {
    this.client = new FHIRClient(config);
  }

  async getPatients(criteria: any): Promise<Patient[]> {
    // Your logic here
  }

  async destroy(): Promise<void> {
    await this.client.destroy();
  }
}

// Use try-finally or try-with-resources pattern
const service = new PatientService(config);
try {
  const patients = await service.getPatients(criteria);
  return patients;
} finally {
  await service.destroy();
}
```

### 2. Error Recovery

```typescript
class ResilientFHIRClient {
  private client: FHIRClient;
  private circuitBreaker: CircuitBreaker;

  constructor(config: FHIRClientConfig) {
    this.client = new FHIRClient({
      ...config,
      retries: 3,
      circuitBreaker: {
        enabled: true,
        failureThreshold: 5,
        resetTimeout: 60000
      }
    });
  }

  async getPatientWithFallback(id: string): Promise<Patient | null> {
    try {
      return await getPatientById(this.client, id);
    } catch (error) {
      console.warn(`Failed to get patient ${id}, trying fallback...`);
      
      // Try alternative approach or cached data
      return await this.getFallbackPatient(id);
    }
  }

  private async getFallbackPatient(id: string): Promise<Patient | null> {
    // Implement fallback logic (cache, alternative server, etc.)
    return null;
  }
}
```

### 3. Configuration Management

```typescript
// Use environment-specific configurations
function createFHIRClient(): FHIRClient {
  const config: FHIRClientConfig = {
    baseUrl: process.env.FHIR_BASE_URL!,
    timeout: parseInt(process.env.FHIR_TIMEOUT || '30000'),
    retries: parseInt(process.env.FHIR_RETRIES || '3'),
    
    auth: {
      type: 'bearer',
      token: process.env.FHIR_TOKEN
    },
    
    cache: {
      enabled: process.env.NODE_ENV === 'production',
      maxSize: parseInt(process.env.FHIR_CACHE_SIZE || '52428800'), // 50MB
      defaultTTL: parseInt(process.env.FHIR_CACHE_TTL || '300000') // 5 minutes
    },
    
    debug: process.env.NODE_ENV === 'development'
  };

  return new FHIRClient(config);
}
```

### 4. Testing

```typescript
// Mock FHIR client for testing
class MockFHIRClient extends FHIRClient {
  private mockData: Map<string, any> = new Map();

  setMockData(key: string, data: any): void {
    this.mockData.set(key, data);
  }

  async query<T>(resourceType: string, params: any): Promise<Bundle<T>> {
    const key = `${resourceType}:${JSON.stringify(params)}`;
    const mockData = this.mockData.get(key);
    
    if (mockData) {
      return mockData;
    }
    
    // Return empty bundle if no mock data
    return {
      resourceType: 'Bundle',
      type: 'searchset',
      total: 0,
      entry: []
    } as Bundle<T>;
  }
}

// Use in tests
const mockClient = new MockFHIRClient({ baseUrl: 'http://mock' });
mockClient.setMockData('Patient:{}', {
  resourceType: 'Bundle',
  total: 1,
  entry: [{ resource: { resourceType: 'Patient', id: 'test' } }]
});
```

## Getting Help

If you're still experiencing issues:

1. **Check the logs** - Enable debug mode and examine the output
2. **Review server documentation** - Each FHIR server may have specific requirements
3. **Test with a known working server** - Try with a public test server like HAPI FHIR
4. **Create a minimal reproduction** - Isolate the issue with the smallest possible code example
5. **Check GitHub issues** - Look for similar problems and solutions
6. **Open an issue** - Provide detailed information about your setup and the problem

### Minimal Reproduction Template

```typescript
import { FHIRClient } from 'fhir-patient-api';

async function reproduce() {
  const client = new FHIRClient({
    baseUrl: 'https://hapi.fhir.org/baseR4', // Use public server for testing
    debug: true
  });

  try {
    // Your problematic code here
    const result = await client.patients().execute();
    console.log('Success:', result);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.destroy();
  }
}

reproduce().catch(console.error);
```