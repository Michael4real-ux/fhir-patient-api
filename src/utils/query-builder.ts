/**
 * Query string builder utilities
 */

import { PatientSearchParams, ValidationResult, ValidationError } from '../types';

export class QueryBuilder {
  /**
   * Build query string from search parameters
   */
  static buildQueryString(params: PatientSearchParams): string {
    const queryParts: string[] = [];

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) {
        continue;
      }

      if (Array.isArray(value)) {
        // Handle array parameters (like _include)
        value.forEach(item => {
          if (item !== undefined && item !== null) {
            queryParts.push(
              `${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`
            );
          }
        });
      } else {
        queryParts.push(
          `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
        );
      }
    }

    return queryParts.join('&');
  }

  /**
   * Build FHIR search URL with parameters
   */
  static buildSearchUrl(
    baseUrl: string,
    resourceType: string,
    params?: PatientSearchParams
  ): string {
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');
    const queryString = params ? this.buildQueryString(params) : '';
    return `${cleanBaseUrl}/${resourceType}${queryString ? `?${queryString}` : ''}`;
  }

  /**
   * Build FHIR resource URL by ID
   */
  static buildResourceUrl(
    baseUrl: string,
    resourceType: string,
    id: string
  ): string {
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');
    const encodedId = encodeURIComponent(id.trim());
    return `${cleanBaseUrl}/${resourceType}/${encodedId}`;
  }

  /**
   * Validate search parameters with comprehensive validation
   */
  static validateSearchParams(params: PatientSearchParams): ValidationResult {
    const errors: ValidationError[] = [];

    // Validate _count parameter
    if (params._count !== undefined && params._count !== null) {
      if (
        typeof params._count !== 'number' ||
        !Number.isInteger(params._count) ||
        params._count < 0 ||
        params._count > 1000
      ) {
        errors.push({
          field: '_count',
          message: '_count must be an integer between 0 and 1000',
          code: 'invalid-range'
        });
      }
    }

    // Validate _offset parameter
    if (params._offset !== undefined && params._offset !== null) {
      if (
        typeof params._offset !== 'number' ||
        !Number.isInteger(params._offset) ||
        params._offset < 0
      ) {
        errors.push({
          field: '_offset',
          message: '_offset must be a non-negative integer',
          code: 'invalid-range'
        });
      }
    }

    // Validate gender parameter
    if (params.gender !== undefined && params.gender !== null) {
      const validGenders = ['male', 'female', 'other', 'unknown'];
      if (!validGenders.includes(params.gender)) {
        errors.push({
          field: 'gender',
          message: `gender must be one of: ${validGenders.join(', ')}`,
          code: 'invalid-value'
        });
      }
    }

    // Validate active parameter
    if (params.active !== undefined && params.active !== null) {
      const activeValue = params.active as unknown;
      if (typeof activeValue === 'boolean') {
        // Boolean values are valid
      } else if (typeof activeValue === 'string') {
        const validBooleanStrings = ['true', 'false'];
        const lowerValue = activeValue.toLowerCase();
        if (!validBooleanStrings.includes(lowerValue)) {
          errors.push({
            field: 'active',
            message: 'active must be "true" or "false"',
            code: 'invalid-value'
          });
        }
      } else {
        errors.push({
          field: 'active',
          message: 'active must be a boolean value or "true"/"false" string',
          code: 'invalid-type'
        });
      }
    }

    // Validate deceased parameter
    if (params.deceased !== undefined && params.deceased !== null) {
      const deceasedValue = params.deceased as unknown;
      if (typeof deceasedValue === 'boolean') {
        // Boolean values are valid
      } else if (typeof deceasedValue === 'string') {
        const validBooleanStrings = ['true', 'false'];
        const lowerValue = deceasedValue.toLowerCase();
        if (!validBooleanStrings.includes(lowerValue)) {
          errors.push({
            field: 'deceased',
            message: 'deceased must be "true" or "false"',
            code: 'invalid-value'
          });
        }
      } else {
        errors.push({
          field: 'deceased',
          message: 'deceased must be a boolean value or "true"/"false" string',
          code: 'invalid-type'
        });
      }
    }

    // Validate date format for birthdate with comprehensive date validation
    if (params.birthdate !== undefined && params.birthdate !== null) {
      if (!this.isValidFHIRDate(params.birthdate)) {
        errors.push({
          field: 'birthdate',
          message: 'birthdate must be in YYYY, YYYY-MM, or YYYY-MM-DD format and represent a valid date',
          code: 'invalid-format'
        });
      }
    }

    // Validate string parameters for length and content
    const stringParams = [
      'name',
      'family',
      'given',
      'identifier',
      'address',
      'email',
      'phone',
      'telecom',
    ];
    stringParams.forEach(param => {
      const value = (params as Record<string, unknown>)[param];
      if (value !== undefined && value !== null) {
        if (typeof value !== 'string') {
          errors.push({
            field: param,
            message: `${param} must be a string`,
            code: 'invalid-type'
          });
        } else if (value.length > 1000) {
          errors.push({
            field: param,
            message: `${param} must be less than 1000 characters`,
            code: 'invalid-length'
          });
        } else if (value.trim().length === 0) {
          errors.push({
            field: param,
            message: `${param} cannot be empty or only whitespace`,
            code: 'invalid-value'
          });
        }
      }
    });

    // Validate _summary parameter
    if (params._summary !== undefined && params._summary !== null) {
      const validSummary = ['true', 'text', 'data', 'count', 'false'];
      if (!validSummary.includes(params._summary)) {
        errors.push({
          field: '_summary',
          message: `_summary must be one of: ${validSummary.join(', ')}`,
          code: 'invalid-value'
        });
      }
    }

    // Validate _sort parameter format
    if (params._sort !== undefined && params._sort !== null) {
      if (
        typeof params._sort !== 'string' ||
        !this.isValidSortParameter(params._sort)
      ) {
        errors.push({
          field: '_sort',
          message: '_sort must be a valid sort parameter (e.g., "name", "-birthdate", "family,given")',
          code: 'invalid-format'
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate FHIR date format and actual date validity
   */
  private static isValidFHIRDate(dateStr: string): boolean {
    // FHIR date format: YYYY, YYYY-MM, or YYYY-MM-DD
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
   * Validate sort parameter format
   */
  private static isValidSortParameter(sort: string): boolean {
    // Sort can be: "field", "-field", "field1,field2", "-field1,field2"
    const sortFields = sort.split(',').map(s => s.trim());
    const validFields = [
      'name',
      'family',
      'given',
      'birthdate',
      'gender',
      'identifier',
      '_lastUpdated',
      '_id',
    ];

    return sortFields.every(field => {
      const cleanField = field.startsWith('-') ? field.substring(1) : field;
      return validFields.includes(cleanField);
    });
  }

  /**
   * Sanitize search parameters
   */
  static sanitizeSearchParams(
    params: PatientSearchParams
  ): PatientSearchParams {
    const sanitized: Record<string, unknown> = {};

    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        return;
      }

      // Sanitize string values
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length > 0) {
          // Remove potentially dangerous characters but preserve FHIR-valid characters
          sanitized[key] = trimmed.replace(/[<>"'&]/g, '');
        }
      } else if (Array.isArray(value)) {
        // Sanitize array values
        const sanitizedArray = value
          .filter(item => item !== undefined && item !== null)
          .map(item =>
            typeof item === 'string'
              ? item.trim().replace(/[<>"'&]/g, '')
              : item
          )
          .filter(item => typeof item !== 'string' || item.length > 0);

        if (sanitizedArray.length > 0) {
          sanitized[key] = sanitizedArray;
        }
      } else {
        // Keep non-string values as-is (numbers, booleans)
        sanitized[key] = value;
      }
    });

    return sanitized as PatientSearchParams;
  }
}
