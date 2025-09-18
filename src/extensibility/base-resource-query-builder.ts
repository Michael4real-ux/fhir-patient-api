/**
 * Base ResourceQueryBuilder class for extension
 *
 * This abstract class provides the foundation for building query builders
 * for any FHIR resource type, enabling easy extension to other resources
 * beyond Patient.
 */

import { FHIRResource, Bundle, BaseSearchParams, ValidationResult } from '../types';
import { FHIRValidationError } from '../errors';
import { QueryBuilder } from '../utils/query-builder';

export abstract class BaseResourceQueryBuilder<
  TResource extends FHIRResource,
  TSearchParams extends BaseSearchParams = BaseSearchParams
> {
  protected params: TSearchParams = {} as TSearchParams;
  protected baseUrl: string;
  protected executeFunction: (params: TSearchParams) => Promise<Bundle<TResource>>;

  /**
   * The FHIR resource type this builder handles (e.g., 'Patient', 'Practitioner')
   */
  protected abstract readonly resourceType: string;

  constructor(
    baseUrl: string,
    executeFunction: (params: TSearchParams) => Promise<Bundle<TResource>>
  ) {
    this.baseUrl = baseUrl;
    this.executeFunction = executeFunction;
  }

  /**
   * Set the maximum number of results to return
   */
  limit(count: number): this {
    if (!Number.isInteger(count) || count < 0 || count > 1000) {
      throw new FHIRValidationError(
        'Limit must be an integer between 0 and 1000',
        '_count'
      );
    }

    (this.params as BaseSearchParams)._count = count;
    return this;
  }

  /**
   * Set pagination offset
   */
  offset(offset: number): this {
    if (!Number.isInteger(offset) || offset < 0) {
      throw new FHIRValidationError(
        'Offset must be a non-negative integer',
        '_offset'
      );
    }

    (this.params as BaseSearchParams)._offset = offset;
    return this;
  }

  /**
   * Set the sort order for results
   */
  sort(field: string, direction: 'asc' | 'desc' = 'asc'): this {
    if (!field || typeof field !== 'string') {
      throw new FHIRValidationError('Sort field is required and must be a string', '_sort');
    }

    const trimmedField = field.trim();
    if (trimmedField.length === 0) {
      throw new FHIRValidationError('Sort field cannot be empty', '_sort');
    }

    // Validate sort field against resource-specific valid fields
    if (!this.isValidSortField(trimmedField)) {
      throw new FHIRValidationError(
        `Invalid sort field: ${trimmedField} for resource type ${this.resourceType}`,
        '_sort'
      );
    }

    // Build sort parameter
    const sortValue = direction === 'desc' ? `-${trimmedField}` : trimmedField;

    // Handle multiple sort fields
    const currentSort = (this.params as BaseSearchParams)._sort;
    if (currentSort) {
      (this.params as BaseSearchParams)._sort = `${currentSort},${sortValue}`;
    } else {
      (this.params as BaseSearchParams)._sort = sortValue;
    }

    return this;
  }

  /**
   * Include related resources in the response
   */
  include(resource: string): this {
    if (!resource || typeof resource !== 'string') {
      throw new FHIRValidationError('Include resource is required and must be a string', '_include');
    }

    const trimmedResource = resource.trim();
    if (trimmedResource.length === 0) {
      throw new FHIRValidationError('Include resource cannot be empty', '_include');
    }

    // Validate include format (should be ResourceType:field or ResourceType:field:target)
    const includePattern = /^[A-Z][a-zA-Z]*:[a-zA-Z][a-zA-Z0-9-]*(:([A-Z][a-zA-Z]*))?$/;
    if (!includePattern.test(trimmedResource)) {
      throw new FHIRValidationError(
        `Invalid include format: ${trimmedResource}. Expected format: ResourceType:field or ResourceType:field:target`,
        '_include'
      );
    }

    // Add to include array
    const currentIncludes = (this.params as BaseSearchParams)._include;
    if (Array.isArray(currentIncludes)) {
      if (!currentIncludes.includes(trimmedResource)) {
        currentIncludes.push(trimmedResource);
      }
    } else if (currentIncludes) {
      (this.params as BaseSearchParams)._include = [currentIncludes, trimmedResource];
    } else {
      (this.params as BaseSearchParams)._include = [trimmedResource];
    }

    return this;
  }

  /**
   * Set summary mode for response
   */
  summary(mode: 'true' | 'text' | 'data' | 'count' | 'false'): this {
    const validModes = ['true', 'text', 'data', 'count', 'false'];
    if (!validModes.includes(mode)) {
      throw new FHIRValidationError(
        `Invalid summary mode: ${mode}. Valid modes are: ${validModes.join(', ')}`,
        '_summary'
      );
    }

    (this.params as BaseSearchParams)._summary = mode;
    return this;
  }

  /**
   * Specify which elements to include in the response
   */
  elements(elements: string | string[]): this {
    if (!elements) {
      throw new FHIRValidationError('Elements parameter is required', '_elements');
    }

    const elementArray = Array.isArray(elements) ? elements : [elements];

    // Check for empty array
    if (elementArray.length === 0) {
      throw new FHIRValidationError('Elements array cannot be empty', '_elements');
    }

    // Validate each element
    elementArray.forEach(element => {
      if (!element || typeof element !== 'string' || element.trim().length === 0) {
        throw new FHIRValidationError('Each element must be a non-empty string', '_elements');
      }
    });

    (this.params as BaseSearchParams)._elements = elementArray.map(e => e.trim());
    return this;
  }

  /**
   * Execute the query and return results
   */
  async execute(): Promise<Bundle<TResource>> {
    // Validate all parameters before execution
    const validation = this.validateParams();
    if (!validation.isValid) {
      throw new FHIRValidationError(
        'Invalid query parameters',
        undefined,
        undefined,
        validation.errors.map(e => e.message).join(', ')
      );
    }

    return this.executeFunction(this.params);
  }

  /**
   * Execute the query and return only the first result
   */
  async first(): Promise<TResource | null> {
    // Create a clone to avoid modifying the original parameters
    const cloned = this.clone();
    (cloned.params as BaseSearchParams)._count = 1;

    const bundle = await cloned.execute();

    if (bundle.entry && bundle.entry.length > 0) {
      const firstEntry = bundle.entry[0];
      if (firstEntry && firstEntry.resource) {
        return firstEntry.resource;
      }
    }

    return null;
  }

  /**
   * Execute the query and return only the count of matching resources
   */
  async count(): Promise<number> {
    // Create a clone to avoid modifying the original parameters
    const cloned = this.clone();
    (cloned.params as BaseSearchParams)._summary = 'count';

    const bundle = await cloned.execute();
    return bundle.total || 0;
  }

  /**
   * Execute the query and return an async iterator for streaming results
   */
  async* stream(options?: {
    pageSize?: number;
    maxConcurrency?: number;
    memoryLimit?: number;
    onProgress?: (processed: number, total?: number) => void;
  }): AsyncIterable<TResource> {
    const {
      pageSize = 50,
      maxConcurrency = 1,
      memoryLimit = 100 * 1024 * 1024, // 100MB default
      onProgress
    } = options || {};

    // Validate streaming options
    if (pageSize <= 0 || pageSize > 1000) {
      throw new FHIRValidationError(
        'pageSize must be between 1 and 1000',
        'pageSize'
      );
    }

    if (maxConcurrency <= 0 || maxConcurrency > 10) {
      throw new FHIRValidationError(
        'maxConcurrency must be between 1 and 10',
        'maxConcurrency'
      );
    }

    if (memoryLimit <= 0) {
      throw new FHIRValidationError(
        'memoryLimit must be greater than 0',
        'memoryLimit'
      );
    }

    // Create a clone to avoid modifying the original parameters
    const cloned = this.clone();
    (cloned.params as BaseSearchParams)._count = pageSize;

    const startingOffset = (cloned.params as BaseSearchParams)._offset || 0;
    let currentOffset = startingOffset;
    let hasMoreResults = true;
    let totalProcessed = 0;
    let memoryUsage = 0;

    while (hasMoreResults) {
      // Create a new clone for each request to avoid parameter mutation
      const pageCloned = cloned.clone();
      (pageCloned.params as BaseSearchParams)._offset = currentOffset;

      // Execute the query for this page
      const bundle = await pageCloned.execute();

      // Yield each resource in the current page
      if (bundle.entry && bundle.entry.length > 0) {
        for (const entry of bundle.entry) {
          if (entry.resource) {
            // Estimate memory usage (rough calculation)
            const resourceSize = JSON.stringify(entry.resource).length * 2; // UTF-16
            memoryUsage += resourceSize;

            // Check memory limit
            if (memoryUsage > memoryLimit) {
              // Force garbage collection hint and reset counter
              if (global.gc) {
                global.gc();
              }
              memoryUsage = 0;
            }

            yield entry.resource;
            totalProcessed++;

            // Report progress if callback provided
            if (onProgress) {
              onProgress(totalProcessed, bundle.total);
            }
          }
        }

        // Check if there are more results
        const returnedCount = bundle.entry.length;
        
        if (returnedCount < pageSize) {
          hasMoreResults = false;
        } else if (bundle.total !== undefined) {
          const totalExpected = bundle.total;
          hasMoreResults = (startingOffset + totalProcessed) < totalExpected;
        }

        // Move to next page
        currentOffset += returnedCount;
      } else {
        // No entries in this page, we're done
        hasMoreResults = false;
      }
    }
  }

  /**
   * Execute the query and return all results as an array with automatic pagination
   */
  async fetchAll(options?: {
    pageSize?: number;
    maxConcurrency?: number;
    maxResults?: number;
    onProgress?: (processed: number, total?: number) => void;
  }): Promise<TResource[]> {
    const {
      pageSize = 50,
      maxConcurrency = 3,
      maxResults = 10000,
      onProgress
    } = options || {};

    // Validate options
    if (pageSize <= 0 || pageSize > 1000) {
      throw new FHIRValidationError(
        'pageSize must be between 1 and 1000',
        'pageSize'
      );
    }

    if (maxConcurrency <= 0 || maxConcurrency > 10) {
      throw new FHIRValidationError(
        'maxConcurrency must be between 1 and 10',
        'maxConcurrency'
      );
    }

    if (maxResults <= 0) {
      throw new FHIRValidationError(
        'maxResults must be greater than 0',
        'maxResults'
      );
    }

    const results: TResource[] = [];

    for await (const resource of this.stream({ 
      pageSize, 
      maxConcurrency, 
      onProgress
    })) {
      results.push(resource);
      
      // Check max results limit
      if (results.length >= maxResults) {
        break;
      }
    }

    return results;
  }

  /**
   * Get the current query parameters (read-only)
   */
  getParams(): Readonly<TSearchParams> {
    return { ...this.params };
  }

  /**
   * Build the query URL without executing
   */
  buildUrl(): string {
    const validation = this.validateParams();
    if (!validation.isValid) {
      throw new FHIRValidationError(
        'Cannot build URL with invalid parameters',
        undefined,
        undefined,
        validation.errors.map(e => e.message).join(', ')
      );
    }

    return QueryBuilder.buildSearchUrl(this.baseUrl, this.resourceType, this.params);
  }

  /**
   * Reset the query builder to empty state
   */
  reset(): this {
    this.params = {} as TSearchParams;
    return this;
  }

  /**
   * Clone the current query builder
   */
  abstract clone(): this;

  /**
   * Validate if a field is a valid sort field for this resource type
   * Subclasses should override this to provide resource-specific validation
   */
  protected abstract isValidSortField(field: string): boolean;

  /**
   * Validate all current parameters
   * Subclasses can override this to provide resource-specific validation
   */
  protected validateParams(): ValidationResult {
    // Basic validation using existing QueryBuilder
    const sanitizedParams = QueryBuilder.sanitizeSearchParams(this.params);
    return QueryBuilder.validateSearchParams(sanitizedParams);
  }

  /**
   * Add a generic where clause - subclasses should provide type-safe versions
   */
  protected addWhereClause(field: string, value: string | number | boolean): this {
    if (!field) {
      throw new FHIRValidationError('Field name is required for where clause', 'field');
    }

    if (value === undefined || value === null) {
      throw new FHIRValidationError('Value is required for where clause', 'value');
    }

    // Convert value to string and validate
    const stringValue = String(value).trim();
    if (stringValue.length === 0) {
      throw new FHIRValidationError('Value cannot be empty or only whitespace', 'value');
    }

    // Handle multiple values for the same field (OR logic)
    const existingValue = (this.params as Record<string, unknown>)[field];
    if (existingValue !== undefined) {
      // For array fields like _include, append to array
      if (field === '_include' || field === '_revinclude' || field === '_elements') {
        const currentArray = Array.isArray(existingValue) ? existingValue : [String(existingValue)];
        (this.params as unknown as Record<string, string | string[]>)[field] = [...currentArray, stringValue];
      } else {
        // For other fields, create comma-separated values (FHIR OR logic)
        (this.params as unknown as Record<string, string>)[field] = `${existingValue},${stringValue}`;
      }
    } else {
      (this.params as unknown as Record<string, string>)[field] = stringValue;
    }

    return this;
  }
}