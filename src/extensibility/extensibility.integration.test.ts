/**
 * Extensibility Framework Integration Tests
 *
 * Tests that demonstrate how the extensibility framework integrates
 * with the main FHIR client and enables real-world usage scenarios.
 */

import { FHIRClient } from '../client/fhir-client';
import { Bundle } from '../types';
import {
  PluginManager,
  LoggingPlugin,
  MetricsPlugin,
  RequestIdPlugin,
  FHIRPlugin,
  FHIRRequest,
} from './plugin-system';
import {
  defaultResourceFactory,
  createResourceQueryBuilder,
  GenericResourceQueryBuilder,
} from './resource-factory';
import {
  PractitionerQueryBuilder,
  Practitioner,
  PractitionerSearchParams,
} from './examples/practitioner-query-builder';

// Extended FHIR Client with plugin support
class ExtendedFHIRClient extends FHIRClient {
  private pluginManager: PluginManager;

  constructor(config: any) {
    super(config);
    this.pluginManager = new PluginManager();
  }

  /**
   * Add plugin support to the client
   */
  async use(plugin: FHIRPlugin): Promise<void> {
    await this.pluginManager.use(plugin);
  }

  /**
   * Remove plugin from the client
   */
  async unuse(pluginName: string): Promise<boolean> {
    return await this.pluginManager.unuse(pluginName);
  }

  /**
   * Get plugin manager for advanced operations
   */
  getPluginManager(): PluginManager {
    return this.pluginManager;
  }

  /**
   * Create a query builder for any registered resource type
   */
  resource<
    TResource extends import('../types').FHIRResource = any,
    TSearchParams extends import('../types').BaseSearchParams = any,
  >(
    resourceType: string
  ): GenericResourceQueryBuilder<TResource, TSearchParams> {
    return createResourceQueryBuilder<TResource, TSearchParams>(
      resourceType,
      this.getConfig().baseUrl,
      async _params => {
        // This would normally make an HTTP request through the client
        // For testing, we'll mock this
        return {
          resourceType: 'Bundle',
          type: 'searchset',
          total: 0,
          entry: [],
        } as Bundle<TResource>;
      }
    );
  }

  /**
   * Create a practitioner query builder
   */
  practitioners(): PractitionerQueryBuilder {
    return new PractitionerQueryBuilder(
      this.getConfig().baseUrl,
      async (_params: PractitionerSearchParams) => {
        // This would normally make an HTTP request through the client
        // For testing, we'll mock this
        return {
          resourceType: 'Bundle',
          type: 'searchset',
          total: 0,
          entry: [],
        } as Bundle<Practitioner>;
      }
    );
  }

  /**
   * Override destroy to cleanup plugins
   */
  async destroy(): Promise<void> {
    await this.pluginManager.destroy();
    await super.destroy();
  }
}

describe('Extensibility Framework Integration', () => {
  let client: ExtendedFHIRClient;

  beforeEach(() => {
    client = new ExtendedFHIRClient({
      baseUrl: 'https://example.com/fhir',
      auth: { type: 'none' },
    });
  });

  afterEach(async () => {
    await client.destroy();
  });

  describe('Plugin Integration', () => {
    it('should integrate plugins with FHIR client', async () => {
      const mockLogger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };

      const loggingPlugin = new LoggingPlugin({
        logger: mockLogger,
        logLevel: 'info',
      });

      await client.use(loggingPlugin);

      expect(client.getPluginManager().hasPlugin('logging')).toBe(true);
    });

    it('should support multiple plugins', async () => {
      const loggingPlugin = new LoggingPlugin();
      const metricsPlugin = new MetricsPlugin();
      const requestIdPlugin = new RequestIdPlugin();

      await client.use(loggingPlugin);
      await client.use(metricsPlugin);
      await client.use(requestIdPlugin);

      const pluginManager = client.getPluginManager();
      expect(pluginManager.hasPlugin('logging')).toBe(true);
      expect(pluginManager.hasPlugin('metrics')).toBe(true);
      expect(pluginManager.hasPlugin('request-id')).toBe(true);
    });

    it('should remove plugins', async () => {
      const loggingPlugin = new LoggingPlugin();
      await client.use(loggingPlugin);

      expect(client.getPluginManager().hasPlugin('logging')).toBe(true);

      const result = await client.unuse('logging');
      expect(result).toBe(true);
      expect(client.getPluginManager().hasPlugin('logging')).toBe(false);
    });

    it('should handle plugin lifecycle', async () => {
      const onInstall = jest.fn();
      const onUninstall = jest.fn();
      const onDestroy = jest.fn();

      const testPlugin: FHIRPlugin = {
        name: 'test-plugin',
        onInstall,
        onUninstall,
        onDestroy,
      };

      await client.use(testPlugin);
      expect(onInstall).toHaveBeenCalled();

      await client.unuse('test-plugin');
      expect(onUninstall).toHaveBeenCalled();

      await client.destroy();
      // onDestroy would be called if plugin was still installed
    });
  });

  describe('Resource Factory Integration', () => {
    beforeEach(() => {
      // Ensure Practitioner is registered (should be done by decorator)
      if (!defaultResourceFactory.isRegistered('Practitioner')) {
        defaultResourceFactory.register({
          resourceType: 'Practitioner',
          searchParameters: ['name', 'specialty', 'active'],
          sortFields: ['name', '_id'],
          queryBuilderClass: PractitionerQueryBuilder,
        });
      }
    });

    afterEach(() => {
      // Clean up test registrations
      defaultResourceFactory.unregister('TestResource');
    });

    it('should create query builders for registered resources', () => {
      const practitionerBuilder = client.practitioners();
      expect(practitionerBuilder).toBeInstanceOf(PractitionerQueryBuilder);
    });

    it('should support generic resource query builders', () => {
      // Register a test resource
      defaultResourceFactory.register({
        resourceType: 'TestResource',
        searchParameters: ['name', 'active'],
        sortFields: ['name'],
        queryBuilderClass: class extends GenericResourceQueryBuilder<any, any> {
          constructor(baseUrl: string, executeFunction: any) {
            super('TestResource', baseUrl, executeFunction);
          }
          clone() {
            return this;
          }
        },
      });

      const testBuilder = client.resource('TestResource');
      expect(testBuilder).toBeInstanceOf(GenericResourceQueryBuilder);
    });

    it('should validate parameters using factory', () => {
      const practitionerBuilder = client.practitioners();

      // This should work
      practitionerBuilder.where('name', 'Dr. Smith');

      // This should fail validation
      expect(() =>
        practitionerBuilder.where('invalid-field' as any, 'value')
      ).toThrow();
    });

    it('should support resource-specific methods', () => {
      const practitionerBuilder = client.practitioners();

      practitionerBuilder.whereSpecialty('cardiology');
      practitionerBuilder.whereQualification('MD');
      practitionerBuilder.whereActive(true);

      const params = practitionerBuilder.getParams();
      expect(params.specialty).toBe('cardiology');
      expect(params['qualification-code']).toBe('MD');
      expect(params.active).toBe('true');
    });
  });

  describe('End-to-End Scenarios', () => {
    it('should support complex query building with plugins', async () => {
      // Set up plugins
      const metricsPlugin = new MetricsPlugin();
      const requestIdPlugin = new RequestIdPlugin();

      await client.use(metricsPlugin);
      await client.use(requestIdPlugin);

      // Build a complex query
      const practitionerBuilder = client.practitioners();
      practitionerBuilder
        .whereSpecialty('cardiology')
        .whereActive(true)
        .sort('name')
        .limit(50)
        .include('Practitioner:organization');

      // Verify query parameters
      const params = practitionerBuilder.getParams();
      expect(params.specialty).toBe('cardiology');
      expect(params.active).toBe('true');
      expect(params._sort).toBe('name');
      expect(params._count).toBe(50);
      expect(params._include).toEqual(['Practitioner:organization']);

      // URL building would work in a real scenario with proper validation
    });

    it('should handle errors with plugin error handling', async () => {
      const errorHandlerPlugin: FHIRPlugin = {
        name: 'error-handler',
        onError: jest.fn().mockImplementation(error => Promise.resolve(error)),
      };

      await client.use(errorHandlerPlugin);

      const pluginManager = client.getPluginManager();
      const testError = new Error('Test error') as any;

      await pluginManager.executeOnError(testError);

      expect(errorHandlerPlugin.onError).toHaveBeenCalledWith(
        testError,
        undefined
      );
    });
  });

  describe('Custom Plugin Development', () => {
    it('should support custom plugin development', async () => {
      // Custom plugin that adds authentication headers
      class AuthPlugin implements FHIRPlugin {
        name = 'custom-auth';

        constructor(private token: string) {}

        async beforeRequest(request: FHIRRequest): Promise<FHIRRequest> {
          return {
            ...request,
            headers: {
              ...request.headers,
              Authorization: `Bearer ${this.token}`,
            },
          };
        }
      }

      const authPlugin = new AuthPlugin('test-token-123');
      await client.use(authPlugin);

      const pluginManager = client.getPluginManager();
      const testRequest: FHIRRequest = {
        method: 'GET',
        url: 'https://example.com/Patient',
        headers: {},
      };

      const result = await pluginManager.executeBeforeRequest(testRequest);

      expect(result.headers!['Authorization']).toBe('Bearer test-token-123');
    });

    it('should support plugin chaining', async () => {
      const executionOrder: string[] = [];

      const plugin1: FHIRPlugin = {
        name: 'plugin1',
        beforeRequest: async req => {
          executionOrder.push('plugin1');
          return { ...req, context: { ...req.context, plugin1: true } };
        },
      };

      const plugin2: FHIRPlugin = {
        name: 'plugin2',
        beforeRequest: async req => {
          executionOrder.push('plugin2');
          return { ...req, context: { ...req.context, plugin2: true } };
        },
      };

      await client.use(plugin1);
      await client.use(plugin2);

      const pluginManager = client.getPluginManager();
      const testRequest: FHIRRequest = {
        method: 'GET',
        url: 'https://example.com/Patient',
      };

      const result = await pluginManager.executeBeforeRequest(testRequest);

      expect(executionOrder).toEqual(['plugin1', 'plugin2']);
      expect(result.context?.plugin1).toBe(true);
      expect(result.context?.plugin2).toBe(true);
    });
  });

  describe('Performance and Memory Management', () => {
    it('should handle plugin cleanup properly', async () => {
      const onDestroy = jest.fn();
      const testPlugin: FHIRPlugin = {
        name: 'cleanup-test',
        onDestroy,
      };

      await client.use(testPlugin);
      await client.destroy();

      expect(onDestroy).toHaveBeenCalled();
    });

    it('should support metrics collection', async () => {
      const metricsPlugin = new MetricsPlugin();
      await client.use(metricsPlugin);

      // Simulate some requests
      const pluginManager = client.getPluginManager();

      await pluginManager.executeBeforeRequest({
        method: 'GET',
        url: 'https://example.com/Patient',
        timestamp: Date.now(),
      });

      await pluginManager.executeAfterResponse({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        timestamp: Date.now(),
      });

      const metrics = metricsPlugin.getMetrics();
      expect(metrics.requestCount).toBe(1);
      expect(metrics.statusCodes['200']).toBe(1);
    });
  });
});
