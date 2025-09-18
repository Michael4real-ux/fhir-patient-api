/**
 * Resource factory pattern for easy resource addition
 *
 * This module provides a factory pattern that makes it easy to add support
 * for new FHIR resource types without modifying the core client code.
 */

import { FHIRResource, Bundle, BaseSearchParams } from '../types';
import { BaseResourceQueryBuilder } from './base-resource-query-builder';
import { FHIRValidationError } from '../errors';

/**
 * Resource configuration for factory registration
 */
export interface ResourceConfig<
  TResource extends FHIRResource,
  TSearchParams extends BaseSearchParams = BaseSearchParams
> {
  /** FHIR resource type name */
  resourceType: string;
  
  /** Valid search parameters for this resource */
  searchParameters: string[];
  
  /** Valid sort fields for this resource */
  sortFields: string[];
  
  /** Query builder class constructor */
  queryBuilderClass: new (
    baseUrl: string,
    executeFunction: (params: TSearchParams) => Promise<Bundle<TResource>>
  ) => BaseResourceQueryBuilder<TResource, TSearchParams>;
  
  /** Optional validation function for resource-specific parameters */
  validateSearchParams?: (params: TSearchParams) => { isValid: boolean; errors: string[] };
  
  /** Optional parameter transformation function */
  transformParams?: (params: TSearchParams) => TSearchParams;
}

/**
 * Resource factory for creating query builders and managing resource types
 */
export class ResourceFactory {
  private resources = new Map<string, ResourceConfig<any, any>>();

  /**
   * Register a new resource type
   */
  register<TResource extends FHIRResource, TSearchParams extends BaseSearchParams = BaseSearchParams>(
    config: ResourceConfig<TResource, TSearchParams>
  ): void {
    if (!config.resourceType) {
      throw new Error('Resource type is required');
    }

    if (this.resources.has(config.resourceType)) {
      throw new Error(`Resource type '${config.resourceType}' is already registered`);
    }

    // Validate configuration
    if (!config.queryBuilderClass) {
      throw new Error('Query builder class is required');
    }

    if (!Array.isArray(config.searchParameters)) {
      throw new Error('Search parameters must be an array');
    }

    if (!Array.isArray(config.sortFields)) {
      throw new Error('Sort fields must be an array');
    }

    this.resources.set(config.resourceType, config);
  }

  /**
   * Unregister a resource type
   */
  unregister(resourceType: string): boolean {
    return this.resources.delete(resourceType);
  }

  /**
   * Check if a resource type is registered
   */
  isRegistered(resourceType: string): boolean {
    return this.resources.has(resourceType);
  }

  /**
   * Get resource configuration
   */
  getResourceConfig<TResource extends FHIRResource, TSearchParams extends BaseSearchParams = BaseSearchParams>(
    resourceType: string
  ): ResourceConfig<TResource, TSearchParams> | undefined {
    return this.resources.get(resourceType);
  }

  /**
   * Get all registered resource types
   */
  getRegisteredResourceTypes(): string[] {
    return Array.from(this.resources.keys());
  }

  /**
   * Create a query builder for a specific resource type
   */
  createQueryBuilder<TResource extends FHIRResource, TSearchParams extends BaseSearchParams = BaseSearchParams>(
    resourceType: string,
    baseUrl: string,
    executeFunction: (params: TSearchParams) => Promise<Bundle<TResource>>
  ): BaseResourceQueryBuilder<TResource, TSearchParams> {
    const config = this.resources.get(resourceType);
    if (!config) {
      throw new Error(`Resource type '${resourceType}' is not registered`);
    }

    return new config.queryBuilderClass(baseUrl, executeFunction);
  }

  /**
   * Validate search parameters for a resource type
   */
  validateSearchParams<TSearchParams extends BaseSearchParams>(
    resourceType: string,
    params: TSearchParams
  ): { isValid: boolean; errors: string[] } {
    const config = this.resources.get(resourceType);
    if (!config) {
      return { isValid: false, errors: [`Resource type '${resourceType}' is not registered`] };
    }

    const errors: string[] = [];

    // Validate that all parameters are allowed for this resource
    for (const paramName of Object.keys(params)) {
      if (!config.searchParameters.includes(paramName)) {
        errors.push(`Invalid search parameter '${paramName}' for resource type '${resourceType}'`);
      }
    }

    // Run resource-specific validation if provided
    if (config.validateSearchParams) {
      const resourceValidation = config.validateSearchParams(params);
      if (!resourceValidation.isValid) {
        errors.push(...resourceValidation.errors);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Transform search parameters for a resource type
   */
  transformSearchParams<TSearchParams extends BaseSearchParams>(
    resourceType: string,
    params: TSearchParams
  ): TSearchParams {
    const config = this.resources.get(resourceType);
    if (!config) {
      throw new Error(`Resource type '${resourceType}' is not registered`);
    }

    if (config.transformParams) {
      return config.transformParams(params);
    }

    return params;
  }

  /**
   * Check if a sort field is valid for a resource type
   */
  isValidSortField(resourceType: string, field: string): boolean {
    const config = this.resources.get(resourceType);
    if (!config) {
      return false;
    }

    return config.sortFields.includes(field);
  }
}

/**
 * Default resource factory instance
 */
export const defaultResourceFactory = new ResourceFactory();

/**
 * Decorator for automatically registering resource query builders
 */
export function RegisterResource<TResource extends FHIRResource, TSearchParams extends BaseSearchParams = BaseSearchParams>(
  config: Omit<ResourceConfig<TResource, TSearchParams>, 'queryBuilderClass'>
) {
  return function <T extends new (...args: any[]) => BaseResourceQueryBuilder<TResource, TSearchParams>>(
    constructor: T
  ): T {
    // Register the resource with the default factory
    defaultResourceFactory.register({
      ...config,
      queryBuilderClass: constructor as any
    });

    return constructor;
  };
}

/**
 * Base class for resource-specific query builders with factory integration
 */
export abstract class FactoryResourceQueryBuilder<
  TResource extends FHIRResource,
  TSearchParams extends BaseSearchParams = BaseSearchParams
> extends BaseResourceQueryBuilder<TResource, TSearchParams> {
  
  constructor(
    baseUrl: string,
    executeFunction: (params: TSearchParams) => Promise<Bundle<TResource>>
  ) {
    super(baseUrl, executeFunction);
  }

  /**
   * Validate parameters using the resource factory
   */
  protected override validateParams(): { isValid: boolean; errors: { field: string; message: string; code: string }[] } {
    const factoryValidation = defaultResourceFactory.validateSearchParams(this.resourceType, this.params);
    
    if (!factoryValidation.isValid) {
      return {
        isValid: false,
        errors: factoryValidation.errors.map(error => ({
          field: 'unknown',
          message: error,
          code: 'validation-error'
        }))
      };
    }

    // Also run base validation
    return super.validateParams();
  }

  /**
   * Check if sort field is valid using the resource factory
   */
  protected isValidSortField(field: string): boolean {
    return defaultResourceFactory.isValidSortField(this.resourceType, field);
  }

  /**
   * Transform parameters using the resource factory
   */
  protected transformParams(params: TSearchParams): TSearchParams {
    return defaultResourceFactory.transformSearchParams(this.resourceType, params);
  }
}

/**
 * Generic resource query builder that can be used for any registered resource
 */
export class GenericResourceQueryBuilder<
  TResource extends FHIRResource = FHIRResource,
  TSearchParams extends BaseSearchParams = BaseSearchParams
> extends FactoryResourceQueryBuilder<TResource, TSearchParams> {
  
  constructor(
    resourceType: string,
    baseUrl: string,
    executeFunction: (params: TSearchParams) => Promise<Bundle<TResource>>
  ) {
    super(baseUrl, executeFunction);
    (this as any).resourceType = resourceType; // Set the resource type dynamically
  }

  protected readonly resourceType!: string; // Will be set in constructor

  /**
   * Add a where clause with factory validation
   */
  where(field: keyof TSearchParams, value: string | number | boolean): this {
    // Validate field using factory
    const config = defaultResourceFactory.getResourceConfig(this.resourceType);
    if (config && !config.searchParameters.includes(field as string)) {
      throw new FHIRValidationError(
        `Invalid search parameter '${String(field)}' for resource type '${this.resourceType}'`,
        String(field)
      );
    }

    return this.addWhereClause(String(field), value);
  }

  /**
   * Clone the query builder
   */
  clone(): this {
    const cloned = new GenericResourceQueryBuilder<TResource, TSearchParams>(
      this.resourceType,
      this.baseUrl,
      this.executeFunction
    ) as this;
    
    cloned.params = { ...this.params };

    // Deep clone array parameters
    const baseParams = this.params as BaseSearchParams;
    const clonedBaseParams = cloned.params as BaseSearchParams;
    
    if (baseParams._include && Array.isArray(baseParams._include)) {
      clonedBaseParams._include = [...baseParams._include];
    }
    if (baseParams._revinclude && Array.isArray(baseParams._revinclude)) {
      clonedBaseParams._revinclude = [...baseParams._revinclude];
    }
    if (baseParams._elements && Array.isArray(baseParams._elements)) {
      clonedBaseParams._elements = [...baseParams._elements];
    }

    return cloned;
  }
}

/**
 * Utility function to create a generic query builder for any resource type
 */
export function createResourceQueryBuilder<
  TResource extends FHIRResource = FHIRResource,
  TSearchParams extends BaseSearchParams = BaseSearchParams
>(
  resourceType: string,
  baseUrl: string,
  executeFunction: (params: TSearchParams) => Promise<Bundle<TResource>>
): GenericResourceQueryBuilder<TResource, TSearchParams> {
  if (!defaultResourceFactory.isRegistered(resourceType)) {
    throw new Error(`Resource type '${resourceType}' is not registered. Please register it first using ResourceFactory.register()`);
  }

  return new GenericResourceQueryBuilder<TResource, TSearchParams>(
    resourceType,
    baseUrl,
    executeFunction
  );
}