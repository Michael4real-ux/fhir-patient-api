/**
 * Extensibility Framework Tests
 *
 * Comprehensive tests for the extensibility framework including
 * base resource query builder, plugin system, and resource factory.
 */

import { Bundle, FHIRResource, BaseSearchParams } from '../types';
import { FHIRValidationError } from '../errors';
import { BaseResourceQueryBuilder } from './base-resource-query-builder';
import { 
  ResourceFactory
} from './resource-factory';
import { 
  PluginManager, 
  LoggingPlugin, 
  MetricsPlugin, 
  RequestIdPlugin,
  FHIRPlugin,
  FHIRRequest,
  FHIRResponse
} from './plugin-system';
import { 
  PractitionerQueryBuilder, 
  Practitioner, 
  PractitionerSearchParams 
} from './examples/practitioner-query-builder';

// Test resource types
interface TestResource extends FHIRResource {
  resourceType: 'TestResource';
  name?: string;
  active?: boolean;
}

interface TestSearchParams extends BaseSearchParams {
  name?: string;
  active?: boolean;
}

// Test query builder implementation
class TestResourceQueryBuilder extends BaseResourceQueryBuilder<TestResource, TestSearchParams> {
  protected readonly resourceType = 'TestResource';

  where(field: keyof TestSearchParams, value: string | number | boolean): this {
    return this.addWhereClause(String(field), value);
  }

  clone(): this {
    const cloned = new TestResourceQueryBuilder(this.baseUrl, this.executeFunction) as this;
    cloned.params = { ...this.params };
    return cloned;
  }

  protected isValidSortField(field: string): boolean {
    return ['name', 'active', '_id', '_lastUpdated'].includes(field);
  }
}

describe('BaseResourceQueryBuilder', () => {
  let queryBuilder: TestResourceQueryBuilder;
  let mockExecuteFunction: jest.MockedFunction<(params: TestSearchParams) => Promise<Bundle<TestResource>>>;

  beforeEach(() => {
    mockExecuteFunction = jest.fn();
    queryBuilder = new TestResourceQueryBuilder('https://example.com/fhir', mockExecuteFunction);
  });

  describe('Basic functionality', () => {
    it('should initialize with correct base URL and execute function', () => {
      expect(queryBuilder.buildUrl()).toBe('https://example.com/fhir/TestResource');
    });

    it('should handle limit parameter', () => {
      queryBuilder.limit(50);
      expect(queryBuilder.getParams()._count).toBe(50);
    });

    it('should validate limit parameter', () => {
      expect(() => queryBuilder.limit(-1)).toThrow(FHIRValidationError);
      expect(() => queryBuilder.limit(1001)).toThrow(FHIRValidationError);
      expect(() => queryBuilder.limit(1.5)).toThrow(FHIRValidationError);
    });

    it('should handle offset parameter', () => {
      queryBuilder.offset(10);
      expect(queryBuilder.getParams()._offset).toBe(10);
    });

    it('should validate offset parameter', () => {
      expect(() => queryBuilder.offset(-1)).toThrow(FHIRValidationError);
      expect(() => queryBuilder.offset(1.5)).toThrow(FHIRValidationError);
    });

    it('should handle sort parameter', () => {
      queryBuilder.sort('name', 'desc');
      expect(queryBuilder.getParams()._sort).toBe('-name');
    });

    it('should handle multiple sort fields', () => {
      queryBuilder.sort('name').sort('_id', 'desc');
      expect(queryBuilder.getParams()._sort).toBe('name,-_id');
    });

    it('should validate sort fields', () => {
      expect(() => queryBuilder.sort('invalid-field')).toThrow(FHIRValidationError);
    });

    it('should handle include parameter', () => {
      queryBuilder.include('TestResource:related');
      expect(queryBuilder.getParams()._include).toEqual(['TestResource:related']);
    });

    it('should validate include format', () => {
      expect(() => queryBuilder.include('invalid-format')).toThrow(FHIRValidationError);
    });

    it('should handle summary parameter', () => {
      queryBuilder.summary('count');
      expect(queryBuilder.getParams()._summary).toBe('count');
    });

    it('should validate summary parameter', () => {
      expect(() => queryBuilder.summary('invalid' as any)).toThrow(FHIRValidationError);
    });

    it('should handle elements parameter', () => {
      queryBuilder.elements(['name', 'active']);
      expect(queryBuilder.getParams()._elements).toEqual(['name', 'active']);
    });

    it('should validate elements parameter', () => {
      expect(() => queryBuilder.elements([])).toThrow(FHIRValidationError);
      expect(() => queryBuilder.elements(['', 'name'])).toThrow(FHIRValidationError);
    });
  });

  describe('Query execution', () => {
    it('should execute query with parameters', async () => {
      const mockBundle: Bundle<TestResource> = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: 1,
        entry: [
          {
            resource: {
              resourceType: 'TestResource',
              id: '1',
              name: 'Test'
            }
          }
        ]
      };

      mockExecuteFunction.mockResolvedValue(mockBundle);

      queryBuilder.where('name', 'Test').limit(10);
      const result = await queryBuilder.execute();

      expect(mockExecuteFunction).toHaveBeenCalledWith({
        name: 'Test',
        _count: 10
      });
      expect(result).toBe(mockBundle);
    });

    it('should return first result', async () => {
      const mockBundle: Bundle<TestResource> = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: 1,
        entry: [
          {
            resource: {
              resourceType: 'TestResource',
              id: '1',
              name: 'Test'
            }
          }
        ]
      };

      mockExecuteFunction.mockResolvedValue(mockBundle);

      const result = await queryBuilder.first();
      expect(result).toEqual({
        resourceType: 'TestResource',
        id: '1',
        name: 'Test'
      });
    });

    it('should return null when no results', async () => {
      const mockBundle: Bundle<TestResource> = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: 0,
        entry: []
      };

      mockExecuteFunction.mockResolvedValue(mockBundle);

      const result = await queryBuilder.first();
      expect(result).toBeNull();
    });

    it('should return count', async () => {
      const mockBundle: Bundle<TestResource> = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: 42
      };

      mockExecuteFunction.mockResolvedValue(mockBundle);

      const count = await queryBuilder.count();
      expect(count).toBe(42);
    });
  });

  describe('Utility methods', () => {
    it('should clone query builder', () => {
      queryBuilder.where('name', 'Test').limit(10);
      const cloned = queryBuilder.clone();

      expect(cloned.getParams()).toEqual(queryBuilder.getParams());
      expect(cloned).not.toBe(queryBuilder);
    });

    it('should reset query builder', () => {
      queryBuilder.where('name', 'Test').limit(10);
      queryBuilder.reset();

      expect(queryBuilder.getParams()).toEqual({});
    });

    it('should build URL', () => {
      queryBuilder.where('name', 'Test').limit(10);
      const url = queryBuilder.buildUrl();

      expect(url).toContain('TestResource');
      expect(url).toContain('name=Test');
      expect(url).toContain('_count=10');
    });
  });
});

describe('ResourceFactory', () => {
  let factory: ResourceFactory;

  beforeEach(() => {
    factory = new ResourceFactory();
  });

  describe('Resource registration', () => {
    it('should register a resource type', () => {
      const config = {
        resourceType: 'TestResource',
        searchParameters: ['name', 'active'],
        sortFields: ['name', '_id'],
        queryBuilderClass: TestResourceQueryBuilder
      };

      factory.register(config);

      expect(factory.isRegistered('TestResource')).toBe(true);
      expect(factory.getRegisteredResourceTypes()).toContain('TestResource');
    });

    it('should prevent duplicate registration', () => {
      const config = {
        resourceType: 'TestResource',
        searchParameters: ['name'],
        sortFields: ['name'],
        queryBuilderClass: TestResourceQueryBuilder
      };

      factory.register(config);
      expect(() => factory.register(config)).toThrow('already registered');
    });

    it('should unregister a resource type', () => {
      const config = {
        resourceType: 'TestResource',
        searchParameters: ['name'],
        sortFields: ['name'],
        queryBuilderClass: TestResourceQueryBuilder
      };

      factory.register(config);
      expect(factory.isRegistered('TestResource')).toBe(true);

      const result = factory.unregister('TestResource');
      expect(result).toBe(true);
      expect(factory.isRegistered('TestResource')).toBe(false);
    });

    it('should return false when unregistering non-existent resource', () => {
      const result = factory.unregister('NonExistent');
      expect(result).toBe(false);
    });
  });

  describe('Query builder creation', () => {
    it('should create query builder for registered resource', () => {
      const config = {
        resourceType: 'TestResource',
        searchParameters: ['name'],
        sortFields: ['name'],
        queryBuilderClass: TestResourceQueryBuilder
      };

      factory.register(config);

      const mockExecuteFunction = jest.fn();
      const queryBuilder = factory.createQueryBuilder('TestResource', 'https://example.com', mockExecuteFunction);

      expect(queryBuilder).toBeInstanceOf(TestResourceQueryBuilder);
    });

    it('should throw error for unregistered resource', () => {
      const mockExecuteFunction = jest.fn();
      expect(() => factory.createQueryBuilder('UnknownResource', 'https://example.com', mockExecuteFunction))
        .toThrow('not registered');
    });
  });

  describe('Parameter validation', () => {
    beforeEach(() => {
      const config = {
        resourceType: 'TestResource',
        searchParameters: ['name', 'active'],
        sortFields: ['name'],
        queryBuilderClass: TestResourceQueryBuilder
      };

      factory.register(config);
    });

    it('should validate search parameters', () => {
      const result = factory.validateSearchParams('TestResource', { name: 'test' });
      expect(result.isValid).toBe(true);
    });

    it('should reject invalid search parameters', () => {
      const result = factory.validateSearchParams('TestResource', { invalid: 'test' } as any);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Invalid search parameter 'invalid' for resource type 'TestResource'");
    });

    it('should validate sort fields', () => {
      expect(factory.isValidSortField('TestResource', 'name')).toBe(true);
      expect(factory.isValidSortField('TestResource', 'invalid')).toBe(false);
    });
  });
});

describe('PluginManager', () => {
  let pluginManager: PluginManager;

  beforeEach(() => {
    pluginManager = new PluginManager();
  });

  afterEach(async () => {
    await pluginManager.destroy();
  });

  describe('Plugin installation', () => {
    it('should install a plugin', async () => {
      const plugin: FHIRPlugin = {
        name: 'test-plugin',
        version: '1.0.0'
      };

      await pluginManager.use(plugin);

      expect(pluginManager.hasPlugin('test-plugin')).toBe(true);
      expect(pluginManager.getPlugin('test-plugin')).toBe(plugin);
    });

    it('should prevent duplicate plugin installation', async () => {
      const plugin: FHIRPlugin = {
        name: 'test-plugin'
      };

      await pluginManager.use(plugin);
      await expect(pluginManager.use(plugin)).rejects.toThrow('already installed');
    });

    it('should call plugin onInstall hook', async () => {
      const onInstall = jest.fn();
      const plugin: FHIRPlugin = {
        name: 'test-plugin',
        onInstall
      };

      await pluginManager.use(plugin);

      expect(onInstall).toHaveBeenCalledWith(pluginManager);
    });

    it('should uninstall a plugin', async () => {
      const onUninstall = jest.fn();
      const plugin: FHIRPlugin = {
        name: 'test-plugin',
        onUninstall
      };

      await pluginManager.use(plugin);
      const result = await pluginManager.unuse('test-plugin');

      expect(result).toBe(true);
      expect(pluginManager.hasPlugin('test-plugin')).toBe(false);
      expect(onUninstall).toHaveBeenCalledWith(pluginManager);
    });

    it('should return false when uninstalling non-existent plugin', async () => {
      const result = await pluginManager.unuse('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('Plugin execution', () => {
    it('should execute beforeRequest hooks', async () => {
      const beforeRequest = jest.fn().mockImplementation((req: FHIRRequest) => Promise.resolve(req));
      const plugin: FHIRPlugin = {
        name: 'test-plugin',
        beforeRequest
      };

      await pluginManager.use(plugin);

      const request: FHIRRequest = {
        method: 'GET',
        url: 'https://example.com/Patient'
      };

      const result = await pluginManager.executeBeforeRequest(request);

      expect(beforeRequest).toHaveBeenCalledWith(request);
      expect(result).toEqual(request);
    });

    it('should execute afterResponse hooks', async () => {
      const afterResponse = jest.fn().mockImplementation((res: FHIRResponse) => Promise.resolve(res));
      const plugin: FHIRPlugin = {
        name: 'test-plugin',
        afterResponse
      };

      await pluginManager.use(plugin);

      const response: FHIRResponse = {
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {}
      };

      const result = await pluginManager.executeAfterResponse(response);

      expect(afterResponse).toHaveBeenCalledWith(response);
      expect(result).toEqual(response);
    });

    it('should execute onError hooks', async () => {
      const onError = jest.fn().mockImplementation((err: any) => Promise.resolve(err));
      const plugin: FHIRPlugin = {
        name: 'test-plugin',
        onError
      };

      await pluginManager.use(plugin);

      const error = new Error('Test error') as any;
      const result = await pluginManager.executeOnError(error);

      expect(onError).toHaveBeenCalledWith(error, undefined);
      expect(result).toBe(error);
    });

    it('should execute plugins in order', async () => {
      const executionOrder: string[] = [];

      const plugin1: FHIRPlugin = {
        name: 'plugin1',
        beforeRequest: async (req) => {
          executionOrder.push('plugin1');
          return req;
        }
      };

      const plugin2: FHIRPlugin = {
        name: 'plugin2',
        beforeRequest: async (req) => {
          executionOrder.push('plugin2');
          return req;
        }
      };

      await pluginManager.use(plugin1);
      await pluginManager.use(plugin2);

      await pluginManager.executeBeforeRequest({
        method: 'GET',
        url: 'https://example.com/Patient'
      });

      expect(executionOrder).toEqual(['plugin1', 'plugin2']);
    });
  });

  describe('Plugin destruction', () => {
    it('should call onDestroy hooks when destroyed', async () => {
      const onDestroy = jest.fn();
      const plugin: FHIRPlugin = {
        name: 'test-plugin',
        onDestroy
      };

      await pluginManager.use(plugin);
      await pluginManager.destroy();

      expect(onDestroy).toHaveBeenCalled();
    });

    it('should prevent operations after destruction', async () => {
      await pluginManager.destroy();

      const plugin: FHIRPlugin = {
        name: 'test-plugin'
      };

      await expect(pluginManager.use(plugin)).rejects.toThrow('destroyed');
    });
  });
});

describe('Built-in Plugins', () => {
  describe('LoggingPlugin', () => {
    it('should log requests and responses', async () => {
      const mockLogger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      };

      const plugin = new LoggingPlugin({
        logger: mockLogger,
        logLevel: 'info'
      });

      const request: FHIRRequest = {
        method: 'GET',
        url: 'https://example.com/Patient',
        requestId: 'test-123'
      };

      const response: FHIRResponse = {
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        requestId: 'test-123'
      };

      await plugin.beforeRequest!(request);
      await plugin.afterResponse!(response);

      expect(mockLogger.info).toHaveBeenCalledTimes(2);
    });

    it('should log errors', async () => {
      const mockLogger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      };

      const plugin = new LoggingPlugin({
        logger: mockLogger
      });

      const error = new Error('Test error') as any;
      const request: FHIRRequest = {
        method: 'GET',
        url: 'https://example.com/Patient'
      };

      await plugin.onError!(error, request);

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('MetricsPlugin', () => {
    it('should collect metrics', async () => {
      const plugin = new MetricsPlugin();

      const request: FHIRRequest = {
        method: 'GET',
        url: 'https://example.com/Patient',
        timestamp: Date.now()
      };

      const response: FHIRResponse = {
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        timestamp: Date.now()
      };

      await plugin.beforeRequest!(request);
      await plugin.afterResponse!(response);

      const metrics = plugin.getMetrics();
      expect(metrics.requestCount).toBe(1);
      expect(metrics.statusCodes['200']).toBe(1);
    });

    it('should track errors', async () => {
      const plugin = new MetricsPlugin();

      const error = new Error('Test error') as any;
      await plugin.onError!(error);

      const metrics = plugin.getMetrics();
      expect(metrics.errorCount).toBe(1);
    });

    it('should reset metrics', () => {
      const plugin = new MetricsPlugin();
      
      // Add some metrics
      plugin.beforeRequest!({
        method: 'GET',
        url: 'https://example.com/Patient'
      });

      plugin.resetMetrics();
      const metrics = plugin.getMetrics();
      expect(metrics.requestCount).toBe(0);
    });
  });

  describe('RequestIdPlugin', () => {
    it('should add request IDs', async () => {
      const plugin = new RequestIdPlugin();

      const request: FHIRRequest = {
        method: 'GET',
        url: 'https://example.com/Patient',
        headers: {}
      };

      const result = await plugin.beforeRequest!(request);

      expect(result.requestId).toBeDefined();
      expect(result.headers!['X-Request-ID']).toBeDefined();
    });

    it('should use custom header name', async () => {
      const plugin = new RequestIdPlugin({
        header: 'Custom-Request-ID'
      });

      const request: FHIRRequest = {
        method: 'GET',
        url: 'https://example.com/Patient',
        headers: {}
      };

      const result = await plugin.beforeRequest!(request);

      expect(result.headers!['Custom-Request-ID']).toBeDefined();
    });
  });
});

describe('PractitionerQueryBuilder Example', () => {
  let queryBuilder: PractitionerQueryBuilder;
  let mockExecuteFunction: jest.MockedFunction<(params: PractitionerSearchParams) => Promise<Bundle<Practitioner>>>;

  beforeEach(() => {
    mockExecuteFunction = jest.fn();
    queryBuilder = new PractitionerQueryBuilder('https://example.com/fhir', mockExecuteFunction);
  });

  it('should create practitioner query builder', () => {
    expect(queryBuilder).toBeInstanceOf(PractitionerQueryBuilder);
    expect(queryBuilder.buildUrl()).toBe('https://example.com/fhir/Practitioner');
  });

  it('should handle practitioner-specific where clauses', () => {
    queryBuilder.where('name', 'Dr. Smith');
    expect(queryBuilder.getParams().name).toBe('Dr. Smith');
  });

  it('should handle specialty filtering', () => {
    queryBuilder.whereSpecialty('cardiology');
    expect(queryBuilder.getParams().specialty).toBe('cardiology');
  });

  it('should handle qualification filtering', () => {
    queryBuilder.whereQualification('MD');
    expect(queryBuilder.getParams()['qualification-code']).toBe('MD');
  });

  it('should handle active status filtering', () => {
    queryBuilder.whereActive(true);
    expect(queryBuilder.getParams().active).toBe('true');
  });

  it('should validate gender values', () => {
    expect(() => queryBuilder.where('gender', 'invalid')).toThrow(FHIRValidationError);
  });

  it('should clone correctly', () => {
    queryBuilder.where('name', 'Dr. Smith').limit(10);
    const cloned = queryBuilder.clone();

    expect(cloned.getParams()).toEqual(queryBuilder.getParams());
    expect(cloned).not.toBe(queryBuilder);
  });
});