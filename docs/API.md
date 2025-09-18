# API Reference

This document provides detailed information about all classes, interfaces, and functions available in the FHIR Patient API.

## Table of Contents

- [FHIRClient](#fhirclient)
- [PatientQueryBuilder](#patientquerybuilder)
- [Utility Functions](#utility-functions)
- [Type Definitions](#type-definitions)
- [Error Classes](#error-classes)
- [Configuration Interfaces](#configuration-interfaces)

## FHIRClient

The main client class for interacting with FHIR servers.

### Constructor

```typescript
new FHIRClient(config: FHIRClientConfig)
```

Creates a new FHIR client instance with the specified configuration.

**Parameters:**
- `config: FHIRClientConfig` - Client configuration object

**Example:**
```typescript
const client = new FHIRClient({
  baseUrl: 'https://hapi.fhir.org/baseR4',
  timeout: 30000,
  retries: 3
});
```

### Methods

#### `patients(): PatientQueryBuilder`

Creates a new patient query builder for constructing patient queries.

**Returns:** `PatientQueryBuilder` - A new query builder instance

**Example:**
```typescript
const queryBuilder = client.patients();
const patients = await queryBuilder
  .where('family', 'Smith')
  .limit(10)
  .execute();
```

#### `query<T>(resourceType: string, params: QueryParams): Promise<Bundle<T>>`

Executes a raw FHIR query with the specified parameters.

**Type Parameters:**
- `T extends FHIRResource` - The resource type to return

**Parameters:**
- `resourceType: string` - The FHIR resource type (e.g., 'Patient')
- `params: QueryParams` - Query parameters object

**Returns:** `Promise<Bundle<T>>` - A promise that resolves to a FHIR Bundle

**Example:**
```typescript
const bundle = await client.query('Patient', {
  'name:contains': 'Smith',
  '_count': 20
});
```

#### `read(resourceType: string, id: string): Promise<FHIRResource>`

Reads a single resource by its ID.

**Parameters:**
- `resourceType: string` - The FHIR resource type
- `id: string` - The resource ID

**Returns:** `Promise<FHIRResource>` - A promise that resolves to the resource

**Example:**
```typescript
const patient = await client.read('Patient', 'example-patient-id');
```

#### `getStats(): ClientStats`

Returns performance and usage statistics for the client.

**Returns:** `ClientStats` - Statistics object containing cache, performance, and connection metrics

**Example:**
```typescript
const stats = client.getStats();
console.log('Cache hit rate:', stats.cache.hitRate);
console.log('Total requests:', stats.performance.totalRequests);
```

#### `clearCache(): void`

Clears all cached data.

**Example:**
```typescript
client.clearCache();
```

#### `invalidateCache(pattern: string): number`

Invalidates cache entries matching the specified pattern.

**Parameters:**
- `pattern: string` - Pattern to match cache keys (supports wildcards)

**Returns:** `number` - Number of cache entries invalidated

**Example:**
```typescript
const invalidated = client.invalidateCache('/Patient*');
console.log(`Invalidated ${invalidated} cache entries`);
```

#### `use(plugin: FHIRPlugin): Promise<void>`

Adds a plugin to the client.

**Parameters:**
- `plugin: FHIRPlugin` - Plugin instance to add

**Example:**
```typescript
await client.use(new LoggingPlugin());
```

#### `destroy(): Promise<void>`

Cleans up resources and closes connections.

**Example:**
```typescript
await client.destroy();
```

## PatientQueryBuilder

Fluent interface for building patient queries with type safety.

### Methods

#### `where(field: PatientSearchField, value: string | number | boolean): PatientQueryBuilder`

Adds a search criterion to the query.

**Parameters:**
- `field: PatientSearchField` - The search field name
- `value: string | number | boolean` - The search value

**Returns:** `PatientQueryBuilder` - The query builder instance for chaining

**Example:**
```typescript
const patients = await client.patients()
  .where('family', 'Smith')
  .where('active', true)
  .execute();
```

#### `limit(count: number): PatientQueryBuilder`

Sets the maximum number of results to return.

**Parameters:**
- `count: number` - Maximum number of results (1-1000)

**Returns:** `PatientQueryBuilder` - The query builder instance for chaining

**Example:**
```typescript
const patients = await client.patients()
  .limit(50)
  .execute();
```

#### `sort(field: string, direction?: 'asc' | 'desc'): PatientQueryBuilder`

Adds sorting to the query.

**Parameters:**
- `field: string` - Field to sort by
- `direction?: 'asc' | 'desc'` - Sort direction (default: 'asc')

**Returns:** `PatientQueryBuilder` - The query builder instance for chaining

**Example:**
```typescript
const patients = await client.patients()
  .sort('family', 'asc')
  .sort('given', 'desc')
  .execute();
```

#### `include(resource: string): PatientQueryBuilder`

Includes related resources in the response.

**Parameters:**
- `resource: string` - Resource reference to include

**Returns:** `PatientQueryBuilder` - The query builder instance for chaining

**Example:**
```typescript
const patients = await client.patients()
  .include('Patient:general-practitioner')
  .include('Patient:organization')
  .execute();
```

#### `execute(): Promise<Bundle<Patient>>`

Executes the query and returns the results.

**Returns:** `Promise<Bundle<Patient>>` - A promise that resolves to a FHIR Bundle containing patients

**Example:**
```typescript
const bundle = await client.patients()
  .where('active', true)
  .execute();

console.log(`Found ${bundle.total} patients`);
bundle.entry?.forEach(entry => {
  console.log('Patient:', entry.resource?.name);
});
```

#### `stream(options?: StreamOptions): AsyncIterable<Patient>`

Returns an async iterable for streaming large result sets.

**Parameters:**
- `options?: StreamOptions` - Streaming options

**Returns:** `AsyncIterable<Patient>` - Async iterable of patient resources

**Example:**
```typescript
for await (const patient of client.patients().stream({ pageSize: 100 })) {
  console.log('Processing patient:', patient.id);
  await processPatient(patient);
}
```

#### `first(): Promise<Patient | null>`

Returns the first matching patient or null if no matches found.

**Returns:** `Promise<Patient | null>` - The first patient or null

**Example:**
```typescript
const patient = await client.patients()
  .where('identifier', 'MRN123')
  .first();

if (patient) {
  console.log('Found patient:', patient.name);
} else {
  console.log('No patient found');
}
```

#### `count(): Promise<number>`

Returns the total number of matching patients without fetching the data.

**Returns:** `Promise<number>` - Total count of matching patients

**Example:**
```typescript
const totalPatients = await client.patients()
  .where('active', true)
  .count();

console.log(`Total active patients: ${totalPatients}`);
```

#### `buildUrl(): string`

Builds the query URL without executing the request.

**Returns:** `string` - The constructed query URL

**Example:**
```typescript
const url = client.patients()
  .where('family', 'Smith')
  .limit(10)
  .buildUrl();

console.log('Query URL:', url);
```

#### `getParams(): QueryParams`

Returns the current query parameters.

**Returns:** `QueryParams` - Object containing all query parameters

**Example:**
```typescript
const params = client.patients()
  .where('family', 'Smith')
  .getParams();

console.log('Query params:', params);
```

## Utility Functions

### `getPatients(client: FHIRClient, params?: PatientSearchParams): Promise<Bundle<Patient>>`

Simple function to get patients with optional search parameters.

**Parameters:**
- `client: FHIRClient` - FHIR client instance
- `params?: PatientSearchParams` - Optional search parameters

**Returns:** `Promise<Bundle<Patient>>` - Bundle containing patients

**Example:**
```typescript
import { getPatients } from 'fhir-patient-api';

const patients = await getPatients(client, {
  family: 'Smith',
  _count: 20
});
```

### `getPatientById(client: FHIRClient, id: string): Promise<Patient>`

Gets a single patient by ID.

**Parameters:**
- `client: FHIRClient` - FHIR client instance
- `id: string` - Patient ID

**Returns:** `Promise<Patient>` - The patient resource

**Example:**
```typescript
import { getPatientById } from 'fhir-patient-api';

const patient = await getPatientById(client, 'patient-123');
```

### `searchPatients(client: FHIRClient, params: PatientSearchParams): Promise<Bundle<Patient>>`

Searches for patients with the specified criteria.

**Parameters:**
- `client: FHIRClient` - FHIR client instance
- `params: PatientSearchParams` - Search parameters

**Returns:** `Promise<Bundle<Patient>>` - Bundle containing matching patients

**Example:**
```typescript
import { searchPatients } from 'fhir-patient-api';

const results = await searchPatients(client, {
  given: 'John',
  gender: 'male',
  birthdate: 'gt1990-01-01'
});
```

## Type Definitions

### Patient

FHIR Patient resource interface with full type safety.

```typescript
interface Patient extends FHIRResource {
  resourceType: 'Patient';
  id?: string;
  meta?: Meta;
  identifier?: Identifier[];
  active?: boolean;
  name?: HumanName[];
  telecom?: ContactPoint[];
  gender?: 'male' | 'female' | 'other' | 'unknown';
  birthDate?: string;
  deceased?: boolean | string;
  address?: Address[];
  maritalStatus?: CodeableConcept;
  multipleBirth?: boolean | number;
  photo?: Attachment[];
  contact?: PatientContact[];
  communication?: PatientCommunication[];
  generalPractitioner?: Reference[];
  managingOrganization?: Reference;
  link?: PatientLink[];
}
```

### Bundle<T>

FHIR Bundle resource for search results.

```typescript
interface Bundle<T extends FHIRResource = FHIRResource> extends FHIRResource {
  resourceType: 'Bundle';
  id?: string;
  meta?: Meta;
  type: 'document' | 'message' | 'transaction' | 'transaction-response' | 
        'batch' | 'batch-response' | 'history' | 'searchset' | 'collection';
  timestamp?: string;
  total?: number;
  link?: BundleLink[];
  entry?: BundleEntry<T>[];
  signature?: Signature;
}
```

### PatientSearchParams

Search parameters for patient queries.

```typescript
interface PatientSearchParams extends BaseSearchParams {
  // Patient-specific search parameters
  identifier?: string;
  name?: string;
  family?: string;
  given?: string;
  gender?: 'male' | 'female' | 'other' | 'unknown';
  birthdate?: string;
  active?: boolean;
  address?: string;
  'address-city'?: string;
  'address-state'?: string;
  'address-country'?: string;
  'address-postalcode'?: string;
  phone?: string;
  email?: string;
  telecom?: string;
  deceased?: boolean;
  'general-practitioner'?: string;
  organization?: string;
  
  // Common search parameters
  _id?: string;
  _lastUpdated?: string;
  _count?: number;
  _offset?: number;
  _sort?: string;
  _include?: string | string[];
  _revinclude?: string | string[];
  _summary?: 'true' | 'text' | 'data' | 'count' | 'false';
  _elements?: string;
  _contained?: 'true' | 'false' | 'both';
  _containedType?: string;
}
```

## Error Classes

### FHIRError

Base class for all FHIR-related errors.

```typescript
abstract class FHIRError extends Error {
  abstract readonly code: string;
  readonly context?: Record<string, unknown>;
  readonly timestamp: Date;
  
  constructor(message: string, context?: Record<string, unknown>);
}
```

### FHIRServerError

Error thrown when the FHIR server returns an error response.

```typescript
class FHIRServerError extends FHIRError {
  readonly code = 'FHIR_SERVER_ERROR';
  readonly statusCode: number;
  readonly operationOutcome?: OperationOutcome;
  
  constructor(
    message: string,
    statusCode: number,
    operationOutcome?: OperationOutcome,
    context?: Record<string, unknown>
  );
}
```

### FHIRNetworkError

Error thrown when network issues occur.

```typescript
class FHIRNetworkError extends FHIRError {
  readonly code = 'FHIR_NETWORK_ERROR';
  readonly originalError: Error;
  
  constructor(message: string, originalError: Error, context?: Record<string, unknown>);
}
```

### FHIRValidationError

Error thrown when validation fails.

```typescript
class FHIRValidationError extends FHIRError {
  readonly code = 'FHIR_VALIDATION_ERROR';
  readonly validationErrors: string[];
  
  constructor(message: string, validationErrors: string[], context?: Record<string, unknown>);
}
```

### FHIRAuthenticationError

Error thrown when authentication fails.

```typescript
class FHIRAuthenticationError extends FHIRError {
  readonly code = 'FHIR_AUTHENTICATION_ERROR';
  readonly authType: string;
  
  constructor(message: string, authType: string, context?: Record<string, unknown>);
}
```

## Configuration Interfaces

### FHIRClientConfig

Main configuration interface for the FHIR client.

```typescript
interface FHIRClientConfig {
  // Required
  baseUrl: string;
  
  // Optional
  version?: 'R4' | 'R5';
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  retryMultiplier?: number;
  retryJitter?: boolean;
  
  // Authentication
  auth?: AuthConfig;
  
  // Caching
  cache?: CacheConfig;
  
  // Connection pooling
  connectionPool?: ConnectionPoolConfig;
  
  // Circuit breaker
  circuitBreaker?: CircuitBreakerConfig;
  
  // Debugging
  debug?: boolean;
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
  
  // Custom headers
  headers?: Record<string, string>;
  
  // User agent
  userAgent?: string;
}
```

### AuthConfig

Authentication configuration options.

```typescript
interface AuthConfig {
  type: 'none' | 'bearer' | 'oauth2' | 'custom';
  
  // Bearer token auth
  token?: string;
  
  // OAuth2 auth
  clientId?: string;
  clientSecret?: string;
  tokenUrl?: string;
  scopes?: string[];
  
  // Custom auth
  getToken?: () => Promise<string>;
  
  // Common options
  refreshToken?: string;
  tokenRefreshThreshold?: number; // seconds before expiry to refresh
}
```

### CacheConfig

Caching configuration options.

```typescript
interface CacheConfig {
  enabled: boolean;
  maxSize: number; // bytes
  defaultTTL: number; // milliseconds
  respectCacheHeaders?: boolean;
  staleWhileRevalidate?: boolean;
  strategy?: 'lru' | 'ttl' | 'adaptive';
  
  // Advanced options
  compression?: boolean;
  serialization?: 'json' | 'msgpack';
  persistToDisk?: boolean;
  diskCachePath?: string;
}
```

### ConnectionPoolConfig

Connection pooling configuration.

```typescript
interface ConnectionPoolConfig {
  maxConnections: number;
  maxConnectionsPerHost: number;
  connectionTimeout: number; // milliseconds
  idleTimeout: number; // milliseconds
  enableHttp2?: boolean;
  enableKeepAlive?: boolean;
  keepAliveTimeout?: number; // milliseconds
}
```

### CircuitBreakerConfig

Circuit breaker configuration for resilience.

```typescript
interface CircuitBreakerConfig {
  enabled: boolean;
  failureThreshold: number; // number of failures before opening
  resetTimeout: number; // milliseconds to wait before trying again
  monitoringPeriod: number; // milliseconds to monitor failures
  halfOpenMaxCalls?: number; // max calls in half-open state
}
```

### StreamOptions

Options for streaming large result sets.

```typescript
interface StreamOptions {
  pageSize?: number; // results per page (default: 100)
  maxPages?: number; // maximum pages to fetch
  concurrency?: number; // concurrent page requests
  bufferSize?: number; // internal buffer size
}
```

### ClientStats

Performance and usage statistics.

```typescript
interface ClientStats {
  cache: {
    hitRate: number;
    missRate: number;
    size: number;
    maxSize: number;
    evictions: number;
  };
  
  performance: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
  };
  
  connectionPool: {
    activeConnections: number;
    idleConnections: number;
    totalConnections: number;
    requestsQueued: number;
  };
  
  circuitBreaker: {
    state: 'closed' | 'open' | 'half-open';
    failures: number;
    successes: number;
    lastFailureTime?: Date;
  };
}
```

## Plugin System

### FHIRPlugin

Interface for creating custom plugins.

```typescript
interface FHIRPlugin {
  name: string;
  version?: string;
  description?: string;
  
  // Lifecycle hooks
  beforeRequest?(request: FHIRRequest): Promise<FHIRRequest>;
  afterResponse?(response: FHIRResponse): Promise<FHIRResponse>;
  onError?(error: FHIRError): Promise<FHIRError>;
  
  // Plugin lifecycle
  initialize?(client: FHIRClient): Promise<void>;
  destroy?(): Promise<void>;
}
```

### Built-in Plugins

#### LoggingPlugin

Logs requests and responses for debugging.

```typescript
class LoggingPlugin implements FHIRPlugin {
  constructor(options?: {
    logLevel?: 'error' | 'warn' | 'info' | 'debug';
    logRequests?: boolean;
    logResponses?: boolean;
    logErrors?: boolean;
  });
}
```

#### MetricsPlugin

Collects performance metrics.

```typescript
class MetricsPlugin implements FHIRPlugin {
  getMetrics(): {
    requestCount: number;
    errorCount: number;
    averageResponseTime: number;
    responseTimePercentiles: Record<string, number>;
  };
}
```

#### RequestIdPlugin

Adds unique request IDs for tracing.

```typescript
class RequestIdPlugin implements FHIRPlugin {
  constructor(options?: {
    headerName?: string; // default: 'X-Request-ID'
    generateId?: () => string;
  });
}
```