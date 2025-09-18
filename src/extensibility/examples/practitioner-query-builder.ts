/**
 * Example Practitioner Query Builder
 *
 * This demonstrates how to extend the base resource query builder
 * to support other FHIR resource types like Practitioner.
 */

import { FHIRResource, Bundle, BaseSearchParams } from '../../types';
import { FHIRValidationError } from '../../errors';
import { FactoryResourceQueryBuilder, RegisterResource } from '../resource-factory';

/**
 * Practitioner resource interface (simplified for example)
 */
export interface Practitioner extends FHIRResource {
  resourceType: 'Practitioner';
  identifier?: Array<{
    system?: string;
    value?: string;
  }>;
  active?: boolean;
  name?: Array<{
    family?: string;
    given?: string[];
    prefix?: string[];
    suffix?: string[];
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
  gender?: 'male' | 'female' | 'other' | 'unknown';
  birthDate?: string;
  qualification?: Array<{
    code?: {
      coding?: Array<{
        system?: string;
        code?: string;
        display?: string;
      }>;
      text?: string;
    };
    period?: {
      start?: string;
      end?: string;
    };
    issuer?: {
      reference?: string;
      display?: string;
    };
  }>;
}

/**
 * Practitioner search parameters
 */
export interface PractitionerSearchParams extends BaseSearchParams {
  // Practitioner-specific search parameters
  identifier?: string;
  name?: string;
  family?: string;
  given?: string;
  gender?: 'male' | 'female' | 'other' | 'unknown';
  active?: boolean;
  address?: string;
  'address-city'?: string;
  'address-country'?: string;
  'address-postalcode'?: string;
  'address-state'?: string;
  email?: string;
  phone?: string;
  telecom?: string;
  qualification?: string;
  'qualification-code'?: string;
  specialty?: string;

  // Common search parameters
  _id?: string;
  _lastUpdated?: string;
  _tag?: string;
  _profile?: string;
  _security?: string;
  _source?: string;
  _text?: string;
  _content?: string;
  _list?: string;
  _has?: string;
  _type?: string;
}

export type PractitionerSearchField = keyof PractitionerSearchParams;

/**
 * Practitioner Query Builder with factory registration
 */
@RegisterResource<Practitioner, PractitionerSearchParams>({
  resourceType: 'Practitioner',
  searchParameters: [
    // Practitioner-specific fields
    'identifier', 'name', 'family', 'given', 'gender', 'active',
    'address', 'address-city', 'address-country', 'address-postalcode',
    'address-state', 'email', 'phone', 'telecom', 'qualification',
    'qualification-code', 'specialty',
    // Common search parameters
    '_id', '_lastUpdated', '_tag', '_profile', '_security', '_source',
    '_text', '_content', '_list', '_has', '_type',
    // Result parameters
    '_count', '_offset', '_sort', '_include', '_revinclude', '_summary',
    '_elements', '_contained', '_containedtyped'
  ],
  sortFields: [
    'name', 'family', 'given', 'gender', 'identifier', '_lastUpdated', '_id'
  ],
  validateSearchParams: (params: PractitionerSearchParams) => {
    const errors: string[] = [];
    
    // Validate gender values
    if (params.gender && !['male', 'female', 'other', 'unknown'].includes(params.gender)) {
      errors.push(`Invalid gender value: ${params.gender}`);
    }
    
    // Validate boolean fields
    if (params.active !== undefined && 
        typeof params.active !== 'boolean' && 
        !['true', 'false'].includes(String(params.active))) {
      errors.push('Active parameter must be a boolean or "true"/"false" string');
    }
    
    return { isValid: errors.length === 0, errors };
  }
})
export class PractitionerQueryBuilder extends FactoryResourceQueryBuilder<Practitioner, PractitionerSearchParams> {
  protected readonly resourceType = 'Practitioner';

  constructor(
    baseUrl: string,
    executeFunction: (params: PractitionerSearchParams) => Promise<Bundle<Practitioner>>
  ) {
    super(baseUrl, executeFunction);
  }

  /**
   * Add a where clause to filter practitioners by a specific field and value
   */
  where(field: PractitionerSearchField, value: string | number | boolean): PractitionerQueryBuilder {
    if (!field) {
      throw new FHIRValidationError('Field name is required for where clause', 'field');
    }

    if (value === undefined || value === null) {
      throw new FHIRValidationError('Value is required for where clause', 'value');
    }

    // Validate field name
    if (!this.isValidSearchField(field)) {
      throw new FHIRValidationError(
        `Invalid search field: ${field}. Must be a valid Practitioner search parameter.`,
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
   * Filter by practitioner specialty
   */
  whereSpecialty(specialty: string): PractitionerQueryBuilder {
    return this.where('specialty', specialty);
  }

  /**
   * Filter by qualification code
   */
  whereQualification(qualificationCode: string): PractitionerQueryBuilder {
    return this.where('qualification-code', qualificationCode);
  }

  /**
   * Filter by active status
   */
  whereActive(active: boolean): PractitionerQueryBuilder {
    return this.where('active', active);
  }

  /**
   * Clone the current query builder
   */
  clone(): this {
    const cloned = new PractitionerQueryBuilder(this.baseUrl, this.executeFunction) as this;
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
   * Validate if a field is a valid Practitioner search parameter
   */
  private isValidSearchField(field: string): boolean {
    const validFields: PractitionerSearchField[] = [
      // Practitioner-specific fields
      'identifier', 'name', 'family', 'given', 'gender', 'active',
      'address', 'address-city', 'address-country', 'address-postalcode',
      'address-state', 'email', 'phone', 'telecom', 'qualification',
      'qualification-code', 'specialty',

      // Common search parameters
      '_id', '_lastUpdated', '_tag', '_profile', '_security', '_source',
      '_text', '_content', '_list', '_has', '_type',

      // Result parameters
      '_count', '_offset', '_sort', '_include', '_revinclude', '_summary',
      '_elements', '_contained', '_containedtyped'
    ];

    return validFields.includes(field as PractitionerSearchField);
  }

  /**
   * Validate field-specific values
   */
  private validateFieldValue(field: PractitionerSearchField, value: string): void {
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
        const validBooleans = ['true', 'false'];
        if (!validBooleans.includes(value.toLowerCase())) {
          throw new FHIRValidationError(
            `Invalid boolean value: ${value}. Must be 'true' or 'false'`,
            field
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
}