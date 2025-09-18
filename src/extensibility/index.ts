/**
 * Extensibility Framework for FHIR Patient API
 *
 * This module exports all the extensibility components that allow users
 * to extend the FHIR client with new resource types, plugins, and custom functionality.
 */

// Base classes and interfaces
export { BaseResourceQueryBuilder } from './base-resource-query-builder';
export {
  FactoryResourceQueryBuilder,
  GenericResourceQueryBuilder,
  ResourceFactory,
  RegisterResource,
  defaultResourceFactory,
  createResourceQueryBuilder,
} from './resource-factory';
export type { ResourceConfig } from './resource-factory';

// Plugin system
export {
  PluginManager,
  LoggingPlugin,
  MetricsPlugin,
  RequestIdPlugin,
} from './plugin-system';
export type {
  FHIRPlugin,
  FHIRRequest,
  FHIRResponse,
  PluginContext,
} from './plugin-system';

// Example implementations
export {
  PractitionerQueryBuilder,
  type Practitioner,
  type PractitionerSearchParams,
  type PractitionerSearchField,
} from './examples/practitioner-query-builder';

// Import types for utility functions
import { ResourceConfig, defaultResourceFactory } from './resource-factory';

/**
 * Utility functions for extensibility
 */

/**
 * Register multiple resource types at once
 */
export function registerResources(
  configs: Array<ResourceConfig<any, any>>
): void {
  configs.forEach(config => {
    defaultResourceFactory.register(config);
  });
}

/**
 * Get information about all registered resources
 */
export function getRegisteredResourcesInfo(): Array<{
  resourceType: string;
  searchParameters: string[];
  sortFields: string[];
}> {
  return defaultResourceFactory
    .getRegisteredResourceTypes()
    .map((resourceType: string) => {
      const config = defaultResourceFactory.getResourceConfig(resourceType);
      return {
        resourceType,
        searchParameters: config?.searchParameters || [],
        sortFields: config?.sortFields || [],
      };
    });
}

/**
 * Check if extensibility framework is properly initialized
 */
export function isExtensibilityReady(): boolean {
  const registeredTypes = defaultResourceFactory.getRegisteredResourceTypes();
  return registeredTypes.length > 0;
}

/**
 * Reset the extensibility framework (useful for testing)
 */
export function resetExtensibilityFramework(): void {
  const registeredTypes = defaultResourceFactory.getRegisteredResourceTypes();
  registeredTypes.forEach((type: string) => {
    defaultResourceFactory.unregister(type);
  });
}
