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
} from '../types';
import { FHIRValidationError } from '../errors';
import { FactoryResourceQueryBuilder, RegisterResource } from '../extensibility/resource-factory';

@RegisterResource<Patient, PatientSearchParams>({
    resourceType: 'Patient',
    searchParameters: [
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
    ],
    sortFields: [
        'name', 'family', 'given', 'birthdate', 'gender',
        'identifier', '_lastUpdated', '_id'
    ],
    validateSearchParams: (params: PatientSearchParams) => {
        const errors: string[] = [];

        // Validate gender values
        if (params.gender && !['male', 'female', 'other', 'unknown'].includes(params.gender)) {
            errors.push(`Invalid gender value: ${params.gender}`);
        }

        // Validate boolean fields
        if (params.active !== undefined && typeof params.active !== 'boolean') {
            errors.push('Active parameter must be a boolean');
        }

        if (params.deceased !== undefined && typeof params.deceased !== 'boolean') {
            errors.push('Deceased parameter must be a boolean');
        }

        return { isValid: errors.length === 0, errors };
    }
})
export class PatientQueryBuilder extends FactoryResourceQueryBuilder<Patient, PatientSearchParams> {
    protected readonly resourceType = 'Patient';
    constructor(
        baseUrl: string,
        executeFunction: (params: PatientSearchParams) => Promise<Bundle<Patient>>
    ) {
        super(baseUrl, executeFunction);
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

        // Use base class method for adding the where clause
        return this.addWhereClause(field, stringValue);
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
     * Clone the current query builder
     */
    clone(): this {
        const cloned = new PatientQueryBuilder(this.baseUrl, this.executeFunction) as this;
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
}