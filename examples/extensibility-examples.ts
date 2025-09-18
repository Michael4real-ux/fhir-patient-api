/**
 * Extensibility Framework Examples
 *
 * This file demonstrates how to use the extensibility framework to:
 * 1. Add support for new FHIR resource types
 * 2. Create custom plugins for middleware functionality
 * 3. Extend the FHIR client with additional capabilities
 */

import { 
  FHIRClient,
  FactoryResourceQueryBuilder,
  RegisterResource,
  PluginManager,
  LoggingPlugin,
  MetricsPlugin,
  RequestIdPlugin,
  FHIRPlugin,
  FHIRRequest,
  FHIRResponse,
  defaultResourceFactory,
  createResourceQueryBuilder,
  PractitionerQueryBuilder
} from '../src';
import { FHIRResource, Bundle, BaseSearchParams } from '../src/types';

// Example 1: Creating a new resource type (Organization)

interface Organization extends FHIRResource {
  resourceType: 'Organization';
  identifier?: Array<{
    system?: string;
    value?: string;
  }>;
  active?: boolean;
  name?: string;
  type?: Array<{
    coding?: Array<{
      system?: string;
      code?: string;
      display?: string;
    }>;
  }>;
  telecom?: Array<{
    system?: 'phone' | 'fax' | 'email' | 'pager' | 'url' | 'sms' | 'other';
    value?: string;
    use?: 'home' | 'work' | 'temp' | 'old' | 'mobile';
  }>;
  address?: Array<{
    line?: string[];
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  }>;
}

interface OrganizationSearchParams extends BaseSearchParams {
  identifier?: string;
  name?: string;
  active?: boolean;
  type?: string;
  address?: string;
  'address-city'?: string;
  'address-state'?: string;
  'address-country'?: string;
  'address-postalcode'?: string;
  phone?: string;
  email?: string;
}

@RegisterResource<Organization, OrganizationSearchParams>({
  resourceType: 'Organization',
  searchParameters: [
    'identifier', 'name', 'active', 'type', 'address',
    'address-city', 'address-state', 'address-country', 'address-postalcode',
    'phone', 'email',
    '_id', '_lastUpdated', '_count', '_offset', '_sort', '_include', '_summary'
  ],
  sortFields: ['name', 'identifier', '_lastUpdated', '_id'],
  validateSearchParams: (params: OrganizationSearchParams) => {
    const errors: string[] = [];
    
    if (params.active !== undefined && 
        typeof params.active !== 'boolean' && 
        !['true', 'false'].includes(String(params.active))) {
      errors.push('Active parameter must be a boolean or "true"/"false" string');
    }
    
    return { isValid: errors.length === 0, errors };
  }
})
class OrganizationQueryBuilder extends FactoryResourceQueryBuilder<Organization, OrganizationSearchParams> {
  protected readonly resourceType = 'Organization';

  constructor(
    baseUrl: string,
    executeFunction: (params: OrganizationSearchParams) => Promise<Bundle<Organization>>
  ) {
    super(baseUrl, executeFunction);
  }

  where(field: keyof OrganizationSearchParams, value: string | number | boolean): this {
    return this.addWhereClause(String(field), value);
  }

  // Organization-specific convenience methods
  whereName(name: string): this {
    return this.where('name', name);
  }

  whereType(type: string): this {
    return this.where('type', type);
  }

  whereActive(active: boolean): this {
    return this.where('active', active);
  }

  whereCity(city: string): this {
    return this.where('address-city', city);
  }

  clone(): this {
    const cloned = new OrganizationQueryBuilder(this.baseUrl, this.executeFunction) as this;
    cloned.params = { ...this.params };
    return cloned;
  }
}

// Example 2: Custom Authentication Plugin

class CustomAuthPlugin implements FHIRPlugin {
  name = 'custom-auth';
  version = '1.0.0';
  description = 'Custom authentication plugin with token refresh';

  private token: string;
  private tokenExpiry: number;

  constructor(initialToken: string, _refreshToken: string) {
    this.token = initialToken;
    this.tokenExpiry = Date.now() + 3600000; // 1 hour from now
  }

  async beforeRequest(request: FHIRRequest): Promise<FHIRRequest> {
    // Check if token needs refresh
    if (Date.now() >= this.tokenExpiry) {
      await this.refreshAccessToken();
    }

    // Add authorization header
    return {
      ...request,
      headers: {
        ...request.headers,
        'Authorization': `Bearer ${this.token}`
      }
    };
  }

  private async refreshAccessToken(): Promise<void> {
    // Simulate token refresh API call
    console.log('Refreshing access token...');
    
    // In a real implementation, you would make an HTTP request to your auth server
    // const response = await fetch('/auth/refresh', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ refreshToken: this.refreshToken })
    // });
    // const data = await response.json();
    // this.token = data.accessToken;
    // this.tokenExpiry = Date.now() + data.expiresIn * 1000;

    // For demo purposes, just update the token
    this.token = `refreshed_token_${Date.now()}`;
    this.tokenExpiry = Date.now() + 3600000;
  }
}

// Example 3: Rate Limiting Plugin

class RateLimitPlugin implements FHIRPlugin {
  name = 'rate-limit';
  version = '1.0.0';
  description = 'Rate limiting plugin to prevent API abuse';

  private requestTimes: number[] = [];
  private maxRequestsPerMinute: number;

  constructor(maxRequestsPerMinute: number = 60) {
    this.maxRequestsPerMinute = maxRequestsPerMinute;
  }

  async beforeRequest(request: FHIRRequest): Promise<FHIRRequest> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Remove requests older than 1 minute
    this.requestTimes = this.requestTimes.filter(time => time > oneMinuteAgo);

    // Check if we've exceeded the rate limit
    if (this.requestTimes.length >= this.maxRequestsPerMinute) {
      const oldestRequest = Math.min(...this.requestTimes);
      const waitTime = 60000 - (now - oldestRequest);
      
      throw new Error(`Rate limit exceeded. Please wait ${Math.ceil(waitTime / 1000)} seconds.`);
    }

    // Record this request
    this.requestTimes.push(now);

    return request;
  }
}

// Example 4: Response Caching Plugin

class ResponseCachePlugin implements FHIRPlugin {
  name = 'response-cache';
  version = '1.0.0';
  description = 'Simple in-memory response caching';

  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private defaultTTL: number;

  constructor(defaultTTL: number = 300000) { // 5 minutes default
    this.defaultTTL = defaultTTL;
  }

  async beforeRequest(request: FHIRRequest): Promise<FHIRRequest> {
    // Only cache GET requests
    if (request.method !== 'GET') {
      return request;
    }

    const cacheKey = this.getCacheKey(request);
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() < cached.timestamp + cached.ttl) {
      // Return cached response by throwing a special error that contains the cached data
      // In a real implementation, you'd need a way to short-circuit the request
      request.context = { ...request.context, cachedResponse: cached.data };
    }

    return request;
  }

  async afterResponse(response: FHIRResponse): Promise<FHIRResponse> {
    // Cache successful GET responses
    if (response.status === 200 && response.requestId) {
      const cacheKey = `${response.requestId}`;
      this.cache.set(cacheKey, {
        data: response.data,
        timestamp: Date.now(),
        ttl: this.defaultTTL
      });
    }

    return response;
  }

  private getCacheKey(request: FHIRRequest): string {
    return `${request.method}:${request.url}`;
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

// Example 5: Extended FHIR Client with Extensibility

class ExtendedFHIRClient extends FHIRClient {
  private pluginManager: PluginManager;

  constructor(config: any) {
    super(config);
    this.pluginManager = new PluginManager();
  }

  // Plugin management
  async use(plugin: FHIRPlugin): Promise<void> {
    await this.pluginManager.use(plugin);
  }

  async unuse(pluginName: string): Promise<boolean> {
    return await this.pluginManager.unuse(pluginName);
  }

  getPluginManager(): PluginManager {
    return this.pluginManager;
  }

  // Resource query builders
  organizations(): OrganizationQueryBuilder {
    return new OrganizationQueryBuilder(
      this.getConfig().baseUrl,
      async (_params) => {
        // In a real implementation, this would make an HTTP request
        // For now, return empty bundle
        return {
          resourceType: 'Bundle',
          type: 'searchset',
          total: 0,
          entry: []
        } as Bundle<Organization>;
      }
    );
  }

  // Generic resource query builder
  resource<TResource extends FHIRResource = FHIRResource>(
    resourceType: string
  ): any {
    return createResourceQueryBuilder(
      resourceType,
      this.getConfig().baseUrl,
      async (_params) => {
        // In a real implementation, this would make an HTTP request
        return {
          resourceType: 'Bundle',
          type: 'searchset',
          total: 0,
          entry: []
        } as Bundle<TResource>;
      }
    );
  }

  override async destroy(): Promise<void> {
    await this.pluginManager.destroy();
    await super.destroy();
  }
}

// Example Usage Scenarios

async function demonstrateExtensibility() {
  console.log('=== FHIR Client Extensibility Examples ===\n');

  // Create extended client
  const client = new ExtendedFHIRClient({
    baseUrl: 'https://hapi.fhir.org/baseR4',
    auth: { type: 'none' }
  });

  try {
    // Example 1: Add plugins
    console.log('1. Adding plugins...');
    
    await client.use(new LoggingPlugin({ logLevel: 'info' }));
    await client.use(new MetricsPlugin());
    await client.use(new RequestIdPlugin());
    await client.use(new CustomAuthPlugin('initial_token', 'refresh_token'));
    await client.use(new RateLimitPlugin(100)); // 100 requests per minute
    await client.use(new ResponseCachePlugin(600000)); // 10 minute cache

    console.log('✓ Plugins added successfully\n');

    // Example 2: Use Organization query builder
    console.log('2. Building Organization queries...');
    
    const orgQuery = client.organizations()
      .whereName('General Hospital')
      .whereActive(true)
      .whereCity('Boston')
      .sort('name')
      .limit(10);

    console.log('Organization query URL:', orgQuery.buildUrl());
    console.log('Organization query params:', orgQuery.getParams());
    console.log('✓ Organization query built successfully\n');

    // Example 3: Use generic resource query builder
    console.log('3. Using generic resource query builder...');
    
    // Ensure Practitioner is registered by importing it
    console.log('Registered resources:', defaultResourceFactory.getRegisteredResourceTypes());
    
    if (defaultResourceFactory.isRegistered('Practitioner')) {
      const practitionerQuery = client.resource('Practitioner')
        .where('specialty', 'cardiology')
        .where('active', 'true')
        .limit(20);

      console.log('Practitioner query URL:', practitionerQuery.buildUrl());
    } else {
      console.log('Practitioner not registered, skipping generic query example');
    }
    console.log('✓ Generic resource query built successfully\n');

    // Example 4: Demonstrate plugin metrics
    console.log('4. Checking plugin metrics...');
    
    const metricsPlugin = client.getPluginManager().getPlugin('metrics') as MetricsPlugin;
    if (metricsPlugin) {
      console.log('Current metrics:', metricsPlugin.getMetrics());
    }
    console.log('✓ Metrics checked successfully\n');

    // Example 5: Resource factory information
    console.log('5. Resource factory information...');
    
    const registeredResources = defaultResourceFactory.getRegisteredResourceTypes();
    console.log('Registered resource types:', registeredResources);
    
    for (const resourceType of registeredResources) {
      const config = defaultResourceFactory.getResourceConfig(resourceType);
      if (config) {
        console.log(`${resourceType}:`, {
          searchParameters: config.searchParameters.slice(0, 5), // Show first 5
          sortFields: config.sortFields
        });
      }
    }
    console.log('✓ Resource factory information displayed\n');

    // Example 6: Streaming with plugins
    console.log('6. Demonstrating streaming with plugins...');
    
    // This would work with real data
    // for await (const org of orgQuery.stream({ pageSize: 10 })) {
    //   console.log('Organization:', org.name);
    // }
    console.log('✓ Streaming setup complete (would work with real data)\n');

  } catch (error) {
    console.error('Error during demonstration:', error);
  } finally {
    // Cleanup
    await client.destroy();
    console.log('✓ Client destroyed and plugins cleaned up');
  }
}

// Example 6: Custom Resource Type with Complex Validation

interface Medication extends FHIRResource {
  resourceType: 'Medication';
  code?: {
    coding?: Array<{
      system?: string;
      code?: string;
      display?: string;
    }>;
    text?: string;
  };
  status?: 'active' | 'inactive' | 'entered-in-error';
  manufacturer?: {
    reference?: string;
    display?: string;
  };
  form?: {
    coding?: Array<{
      system?: string;
      code?: string;
      display?: string;
    }>;
  };
  ingredient?: Array<{
    itemCodeableConcept?: {
      coding?: Array<{
        system?: string;
        code?: string;
        display?: string;
      }>;
    };
    strength?: {
      numerator?: {
        value?: number;
        unit?: string;
      };
      denominator?: {
        value?: number;
        unit?: string;
      };
    };
  }>;
}

interface MedicationSearchParams extends BaseSearchParams {
  code?: string;
  status?: 'active' | 'inactive' | 'entered-in-error';
  manufacturer?: string;
  form?: string;
  ingredient?: string;
  'ingredient-code'?: string;
}

@RegisterResource<Medication, MedicationSearchParams>({
  resourceType: 'Medication',
  searchParameters: [
    'code', 'status', 'manufacturer', 'form', 'ingredient', 'ingredient-code',
    '_id', '_lastUpdated', '_count', '_offset', '_sort', '_include', '_summary'
  ],
  sortFields: ['code', 'status', '_lastUpdated', '_id'],
  validateSearchParams: (params: MedicationSearchParams) => {
    const errors: string[] = [];
    
    if (params.status && !['active', 'inactive', 'entered-in-error'].includes(params.status)) {
      errors.push(`Invalid status value: ${params.status}`);
    }
    
    return { isValid: errors.length === 0, errors };
  },
  transformParams: (params: MedicationSearchParams) => {
    // Example transformation: convert status to lowercase
    if (params.status) {
      params.status = params.status.toLowerCase() as any;
    }
    return params;
  }
})
class MedicationQueryBuilder extends FactoryResourceQueryBuilder<Medication, MedicationSearchParams> {
  protected readonly resourceType = 'Medication';

  constructor(
    baseUrl: string,
    executeFunction: (params: MedicationSearchParams) => Promise<Bundle<Medication>>
  ) {
    super(baseUrl, executeFunction);
  }

  where(field: keyof MedicationSearchParams, value: string | number | boolean): this {
    return this.addWhereClause(String(field), value);
  }

  whereCode(code: string): this {
    return this.where('code', code);
  }

  whereStatus(status: 'active' | 'inactive' | 'entered-in-error'): this {
    return this.where('status', status);
  }

  whereManufacturer(manufacturer: string): this {
    return this.where('manufacturer', manufacturer);
  }

  whereIngredient(ingredient: string): this {
    return this.where('ingredient', ingredient);
  }

  clone(): this {
    const cloned = new MedicationQueryBuilder(this.baseUrl, this.executeFunction) as this;
    cloned.params = { ...this.params };
    return cloned;
  }
}

// Run the demonstration
if (require.main === module) {
  demonstrateExtensibility().catch(console.error);
}

export {
  ExtendedFHIRClient,
  OrganizationQueryBuilder,
  MedicationQueryBuilder,
  CustomAuthPlugin,
  RateLimitPlugin,
  ResponseCachePlugin,
  demonstrateExtensibility
};