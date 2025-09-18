/**
 * Fluent PatientQueryBuilder interface
 *
 * Provides a chainable, type-safe interface for building patient queries
 * with comprehensive validation and URL construction.
 */

import {
    Patient,
    Bundle,
    PatientSearchParams,
    PatientSearchField,
    ValidationResult,
} from '../types';
import { FHIRValidationError } from '../errors';
import { QueryBuilder } from '../utils/query-builder';

export class PatientQueryBuilder {
    private params: PatientSearchParams = {};
    private baseUrl: string;
    private executeFunction: (params: PatientSearchParams) => Promise<Bundle<Patient>>;

    constructor(
        baseUrl: string,
        executeFunction: (params: PatientSearchParams) => Promise<Bundle<Patient>>
    ) {
        this.baseUrl = baseUrl;
        this.executeFunction = executeFunction;
    }

    /**
     * Add a where clause to filter patients by a specific field and value
     */
    where(field: PatientSearchField, value: string | number | boolean): PatientQueryBuilder {
        if (!field) {
            throw new FHIRValidationError('Field name is required for where clause', 'field');
        }

        if (value === undefined || value === null) {
            throw new FHIRValidationError('Value is required for where clause', 'value');
        }

        // Validate field name
        if (!this.isValidSearchField(field)) {
            throw new FHIRValidationError(
                `Invalid search field: ${field}. Must be a valid Patient search parameter.`,
                'field'
            );
        }

        // Convert value to string and validate
        const stringValue = String(value).trim();
        if (stringValue.length === 0) {
            throw new FHIRValidationError('Value cannot be empty or only whitespace', 'value');
        }

        // Validate specific field types
        this.validateFieldValue(field, stringValue);

        // Handle multiple values for the same field (OR logic)
        const existingValue = this.params[field];
        if (existingValue !== undefined) {
            // For array fields like _include, append to array
            if (field === '_include' || field === '_revinclude' || field === '_elements') {
                const currentArray = Array.isArray(existingValue) ? existingValue : [String(existingValue)];
                (this.params as Record<string, string | string[]>)[field] = [...currentArray, stringValue];
            } else {
                // For other fields, create comma-separated values (FHIR OR logic)
                (this.params as Record<string, string>)[field] = `${existingValue},${stringValue}`;
            }
        } else {
            (this.params as Record<string, string>)[field] = stringValue;
        }

        return this;
    }

    /**
     * Set the maximum number of results to return
     */
    limit(count: number): PatientQueryBuilder {
        if (!Number.isInteger(count) || count < 0 || count > 1000) {
            throw new FHIRValidationError(
                'Limit must be an integer between 0 and 1000',
                '_count'
            );
        }

        this.params._count = count;
        return this;
    }

    /**
     * Set the sort order for results
     */
    sort(field: string, direction: 'asc' | 'desc' = 'asc'): PatientQueryBuilder {
        if (!field || typeof field !== 'string') {
            throw new FHIRValidationError('Sort field is required and must be a string', '_sort');
        }

        const trimmedField = field.trim();
        if (trimmedField.length === 0) {
            throw new FHIRValidationError('Sort field cannot be empty', '_sort');
        }

        // Validate sort field
        const validSortFields = [
            'name', 'family', 'given', 'birthdate', 'gender',
            'identifier', '_lastUpdated', '_id'
        ];

        if (!validSortFields.includes(trimmedField)) {
            throw new FHIRValidationError(
                `Invalid sort field: ${trimmedField}. Valid fields are: ${validSortFields.join(', ')}`,
                '_sort'
            );
        }

        // Build sort parameter
        const sortValue = direction === 'desc' ? `-${trimmedField}` : trimmedField;

        // Handle multiple sort fields
        if (this.params._sort) {
            this.params._sort = `${this.params._sort},${sortValue}`;
        } else {
            this.params._sort = sortValue;
        }

        return this;
    }

    /**
     * Include related resources in the response
     */
    include(resource: string): PatientQueryBuilder {
        if (!resource || typeof resource !== 'string') {
            throw new FHIRValidationError('Include resource is required and must be a string', '_include');
        }

        const trimmedResource = resource.trim();
        if (trimmedResource.length === 0) {
            throw new FHIRValidationError('Include resource cannot be empty', '_include');
        }

        // Validate include format (should be ResourceType:field or ResourceType:field:target)
        // Allow hyphens in field names (e.g., general-practitioner)
        const includePattern = /^[A-Z][a-zA-Z]*:[a-zA-Z][a-zA-Z0-9-]*(:([A-Z][a-zA-Z]*))?$/;
        if (!includePattern.test(trimmedResource)) {
            throw new FHIRValidationError(
                `Invalid include format: ${trimmedResource}. Expected format: ResourceType:field or ResourceType:field:target`,
                '_include'
            );
        }

        // Add to include array
        const currentIncludes = this.params._include;
        if (Array.isArray(currentIncludes)) {
            if (!currentIncludes.includes(trimmedResource)) {
                currentIncludes.push(trimmedResource);
            }
        } else if (currentIncludes) {
            this.params._include = [currentIncludes, trimmedResource];
        } else {
            this.params._include = [trimmedResource];
        }

        return this;
    }

    /**
     * Set pagination offset
     */
    offset(offset: number): PatientQueryBuilder {
        if (!Number.isInteger(offset) || offset < 0) {
            throw new FHIRValidationError(
                'Offset must be a non-negative integer',
                '_offset'
            );
        }

        this.params._offset = offset;
        return this;
    }

    /**
     * Set summary mode for response
     */
    summary(mode: 'true' | 'text' | 'data' | 'count' | 'false'): PatientQueryBuilder {
        const validModes = ['true', 'text', 'data', 'count', 'false'];
        if (!validModes.includes(mode)) {
            throw new FHIRValidationError(
                `Invalid summary mode: ${mode}. Valid modes are: ${validModes.join(', ')}`,
                '_summary'
            );
        }

        this.params._summary = mode;
        return this;
    }

    /**
     * Specify which elements to include in the response
     */
    elements(elements: string | string[]): PatientQueryBuilder {
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

        this.params._elements = elementArray.map(e => e.trim());
        return this;
    }

    /**
     * Execute the query and return results
     */
    async execute(): Promise<Bundle<Patient>> {
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
    async first(): Promise<Patient | null> {
        // Create a clone to avoid modifying the original parameters
        const cloned = this.clone();
        cloned.params._count = 1;

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
        cloned.params._summary = 'count';

        const bundle = await cloned.execute();
        return bundle.total || 0;
    }

    /**
     * Execute the query and return an async iterator for streaming results
     * Enhanced with better memory management and concurrent operations support
     */
    async* stream(options?: {
        pageSize?: number;
        maxConcurrency?: number;
        memoryLimit?: number;
        onProgress?: (processed: number, total?: number) => void;
    }): AsyncIterable<Patient> {
        const {
            pageSize = 50,
            maxConcurrency = 1, // Default to 1 for backward compatibility
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

        // Use simple streaming for maxConcurrency = 1 (backward compatibility)
        if (maxConcurrency === 1) {
            // Use the existing _count parameter if set, otherwise use pageSize
            const effectivePageSize = this.params._count || pageSize;
            yield* this.streamSimple(effectivePageSize, onProgress);
            return;
        }

        // Create a clone to avoid modifying the original parameters
        const cloned = this.clone();
        cloned.params._count = pageSize;

        const startingOffset = cloned.params._offset || 0;
        let currentOffset = startingOffset;
        let hasMoreResults = true;
        let totalProcessed = 0;
        let memoryUsage = 0;

        // Buffer for concurrent page fetching
        const pageBuffer: Promise<Bundle<Patient>>[] = [];
        // let bufferIndex = 0; // Unused variable

        while (hasMoreResults || pageBuffer.length > 0) {
            // Fill buffer with concurrent requests up to maxConcurrency
            while (pageBuffer.length < maxConcurrency && hasMoreResults) {
                const pageCloned = cloned.clone();
                pageCloned.params._offset = currentOffset;

                const pagePromise = pageCloned.execute().catch(error => {
                    // Convert errors to a special bundle to handle them gracefully
                    return {
                        resourceType: 'Bundle' as const,
                        type: 'searchset' as const,
                        entry: [],
                        _error: error
                    } as Bundle<Patient> & { _error: Error };
                });

                pageBuffer.push(pagePromise);
                currentOffset += pageSize;
            }

            // Process the next page from buffer
            if (pageBuffer.length > 0) {
                const bundle = await pageBuffer.shift()!;

                // Handle errors in the bundle
                if (bundle && typeof bundle === 'object' && '_error' in bundle) {
                    throw (bundle as { _error: Error })._error;
                }

                // Check if bundle is valid
                if (!bundle) {
                    hasMoreResults = false;
                    continue;
                }

                // Check memory usage and yield results
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
                } else {
                    // No entries in this page, we're done
                    hasMoreResults = false;
                }
            }
        }
    }

    /**
     * Execute the query and return all results as an array with automatic pagination
     * Enhanced with concurrent fetching and memory management
     */
    async fetchAll(options?: {
        pageSize?: number;
        maxConcurrency?: number;
        maxResults?: number;
        onProgress?: (processed: number, total?: number) => void;
    }): Promise<Patient[]> {
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

        const results: Patient[] = [];
        // let processed = 0; // Unused variable

        for await (const patient of this.stream({ 
            pageSize, 
            maxConcurrency, 
            onProgress: (p, t) => {
                // processed = p; // Unused variable
                if (onProgress) onProgress(p, t);
            }
        })) {
            results.push(patient);
            
            // Check max results limit
            if (results.length >= maxResults) {
                break;
            }
        }

        return results;
    }

    /**
     * Execute multiple queries concurrently and merge results
     */
    static async executeParallel(
        queries: PatientQueryBuilder[],
        options?: {
            maxConcurrency?: number;
            failFast?: boolean;
        }
    ): Promise<Bundle<Patient>[]> {
        const { maxConcurrency = 5, failFast = true } = options || {};
        
        const results: Bundle<Patient>[] = [];
        const errors: Error[] = [];

        // Process queries in batches to respect concurrency limit
        for (let i = 0; i < queries.length; i += maxConcurrency) {
            const batch = queries.slice(i, i + maxConcurrency);
            
            const batchPromises = batch.map(async (query, _index) => {
                try {
                    return await query.execute();
                } catch (error) {
                    if (failFast) {
                        throw error;
                    }
                    errors.push(error as Error);
                    return null;
                }
            });

            const batchResults = await Promise.all(batchPromises);
            
            // Add successful results
            for (const result of batchResults) {
                if (result !== null) {
                    results.push(result);
                }
            }
        }

        // If not failing fast, just log errors but return successful results
        if (!failFast && errors.length > 0) {
            console.warn(`${errors.length} queries failed:`, errors.map(e => e.message).join('; '));
        }

        return results;
    }

    /**
     * Simple streaming implementation for backward compatibility
     */
    private async* streamSimple(
        pageSize: number,
        onProgress?: (processed: number, total?: number) => void
    ): AsyncIterable<Patient> {
        // Create a clone to avoid modifying the original parameters
        const cloned = this.clone();
        cloned.params._count = pageSize;

        const startingOffset = cloned.params._offset || 0;
        let currentOffset = startingOffset;
        let hasMoreResults = true;
        let totalProcessed = 0;

        while (hasMoreResults) {
            // Create a new clone for each request to avoid parameter mutation
            const pageCloned = cloned.clone();
            pageCloned.params._offset = currentOffset;

            // Execute the query for this page
            const bundle = await pageCloned.execute();

            // Yield each patient in the current page
            if (bundle.entry && bundle.entry.length > 0) {
                for (const entry of bundle.entry) {
                    if (entry.resource) {
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
                
                // Check if we have a total count and have reached it
                if (bundle.total !== undefined) {
                    const totalExpected = bundle.total;
                    hasMoreResults = (startingOffset + totalProcessed) < totalExpected;
                } else if (returnedCount < pageSize) {
                    // If no total is provided and we got fewer results than requested, we've reached the end
                    hasMoreResults = false;
                } else {
                    // If no total is provided, continue until we get fewer results
                    hasMoreResults = returnedCount === pageSize;
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
     * Get the current query parameters (read-only)
     */
    getParams(): Readonly<PatientSearchParams> {
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

        return QueryBuilder.buildSearchUrl(this.baseUrl, 'Patient', this.params);
    }

    /**
     * Reset the query builder to empty state
     */
    reset(): PatientQueryBuilder {
        this.params = {};
        return this;
    }

    /**
     * Clone the current query builder
     */
    clone(): PatientQueryBuilder {
        const cloned = new PatientQueryBuilder(this.baseUrl, this.executeFunction);
        cloned.params = { ...this.params };

        // Deep clone array parameters
        if (this.params._include && Array.isArray(this.params._include)) {
            cloned.params._include = [...this.params._include];
        }
        if (this.params._revinclude && Array.isArray(this.params._revinclude)) {
            cloned.params._revinclude = [...this.params._revinclude];
        }
        if (this.params._elements && Array.isArray(this.params._elements)) {
            cloned.params._elements = [...this.params._elements];
        }

        return cloned;
    }

    /**
     * Validate if a field is a valid Patient search parameter
     */
    private isValidSearchField(field: string): boolean {
        const validFields: PatientSearchField[] = [
            // Patient-specific fields
            'identifier', 'name', 'family', 'given', 'gender', 'birthdate',
            'address', 'address-city', 'address-country', 'address-postalcode',
            'address-state', 'address-use', 'active', 'deceased', 'email',
            'phone', 'telecom', 'organization',

            // Common search parameters
            '_id', '_lastUpdated', '_tag', '_profile', '_security', '_source',
            '_text', '_content', '_list', '_has', '_type',

            // Result parameters
            '_count', '_offset', '_sort', '_include', '_revinclude', '_summary',
            '_elements', '_contained', '_containedtyped'
        ];

        return validFields.includes(field as PatientSearchField);
    }

    /**
     * Validate field-specific values
     */
    private validateFieldValue(field: PatientSearchField, value: string): void {
        switch (field) {
            case 'gender':
                const validGenders = ['male', 'female', 'other', 'unknown'];
                if (!validGenders.includes(value)) {
                    throw new FHIRValidationError(
                        `Invalid gender value: ${value}. Valid values are: ${validGenders.join(', ')}`,
                        'gender'
                    );
                }
                break;

            case 'active':
            case 'deceased':
                const validBooleans = ['true', 'false'];
                if (!validBooleans.includes(value.toLowerCase())) {
                    throw new FHIRValidationError(
                        `Invalid boolean value: ${value}. Must be 'true' or 'false'`,
                        field
                    );
                }
                break;

            case 'birthdate':
                if (!this.isValidFHIRDate(value)) {
                    throw new FHIRValidationError(
                        `Invalid birthdate format: ${value}. Must be in YYYY, YYYY-MM, or YYYY-MM-DD format`,
                        'birthdate'
                    );
                }
                break;

            case '_count':
                const count = parseInt(value, 10);
                if (isNaN(count) || count < 0 || count > 1000) {
                    throw new FHIRValidationError(
                        `Invalid _count value: ${value}. Must be an integer between 0 and 1000`,
                        '_count'
                    );
                }
                break;

            case '_offset':
                const offset = parseInt(value, 10);
                if (isNaN(offset) || offset < 0) {
                    throw new FHIRValidationError(
                        `Invalid _offset value: ${value}. Must be a non-negative integer`,
                        '_offset'
                    );
                }
                break;
        }
    }

    /**
     * Validate FHIR date format
     */
    private isValidFHIRDate(dateStr: string): boolean {
        const dateRegex = /^(\d{4})(-(\d{2})(-(\d{2}))?)?$/;
        const match = dateStr.match(dateRegex);

        if (!match) {
            return false;
        }

        const year = parseInt(match[1]!);
        const month = match[3] ? parseInt(match[3]) : 1;
        const day = match[5] ? parseInt(match[5]) : 1;

        // Basic range validation
        if (year < 1900 || year > new Date().getFullYear() + 1) {
            return false;
        }

        if (month < 1 || month > 12) {
            return false;
        }

        if (day < 1 || day > 31) {
            return false;
        }

        // Validate actual date
        const date = new Date(year, month - 1, day);
        return (
            date.getFullYear() === year &&
            date.getMonth() === month - 1 &&
            date.getDate() === day
        );
    }

    /**
     * Validate all current parameters
     */
    private validateParams(): ValidationResult {
        const sanitizedParams = QueryBuilder.sanitizeSearchParams(this.params);
        return QueryBuilder.validateSearchParams(sanitizedParams);
    }
}