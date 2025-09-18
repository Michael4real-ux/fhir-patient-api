/**
 * Type definitions for FHIR Patient API
 *
 * This file contains comprehensive TypeScript type definitions for FHIR resources,
 * query parameters, and API interfaces following FHIR R4 specification.
 */

// Base FHIR Types

export interface FHIRResource {
  resourceType: string;
  id?: string;
  meta?: Meta;
  implicitRules?: string;
  language?: string;
}

export interface Meta {
  versionId?: string;
  lastUpdated?: string;
  source?: string;
  profile?: string[];
  security?: Coding[];
  tag?: Coding[];
}

export interface Coding {
  system?: string;
  version?: string;
  code?: string;
  display?: string;
  userSelected?: boolean;
}

export interface CodeableConcept {
  coding?: Coding[];
  text?: string;
}

export interface Identifier {
  use?: 'usual' | 'official' | 'temp' | 'secondary' | 'old';
  type?: CodeableConcept;
  system?: string;
  value?: string;
  period?: Period;
  assigner?: Reference;
}

export interface Period {
  start?: string;
  end?: string;
}

export interface Reference {
  reference?: string;
  type?: string;
  identifier?: Identifier;
  display?: string;
}

export interface HumanName {
  use?:
    | 'usual'
    | 'official'
    | 'temp'
    | 'nickname'
    | 'anonymous'
    | 'old'
    | 'maiden';
  text?: string;
  family?: string;
  given?: string[];
  prefix?: string[];
  suffix?: string[];
  period?: Period;
}

export interface ContactPoint {
  system?: 'phone' | 'fax' | 'email' | 'pager' | 'url' | 'sms' | 'other';
  value?: string;
  use?: 'home' | 'work' | 'temp' | 'old' | 'mobile';
  rank?: number;
  period?: Period;
}

export interface Address {
  use?: 'home' | 'work' | 'temp' | 'old' | 'billing';
  type?: 'postal' | 'physical' | 'both';
  text?: string;
  line?: string[];
  city?: string;
  district?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  period?: Period;
}

// Patient Resource Types

export interface Patient extends FHIRResource {
  resourceType: 'Patient';
  identifier?: Identifier[];
  active?: boolean;
  name?: HumanName[];
  telecom?: ContactPoint[];
  gender?: 'male' | 'female' | 'other' | 'unknown';
  birthDate?: string;
  deceasedBoolean?: boolean;
  deceasedDateTime?: string;
  address?: Address[];
  maritalStatus?: CodeableConcept;
  multipleBirthBoolean?: boolean;
  multipleBirthInteger?: number;
  photo?: Attachment[];
  contact?: PatientContact[];
  communication?: PatientCommunication[];
  generalPractitioner?: Reference[];
  managingOrganization?: Reference;
  link?: PatientLink[];
}

export interface PatientContact {
  relationship?: CodeableConcept[];
  name?: HumanName;
  telecom?: ContactPoint[];
  address?: Address;
  gender?: 'male' | 'female' | 'other' | 'unknown';
  organization?: Reference;
  period?: Period;
}

export interface PatientCommunication {
  language: CodeableConcept;
  preferred?: boolean;
}

export interface PatientLink {
  other: Reference;
  type: 'replaced-by' | 'replaces' | 'refer' | 'seealso';
}

export interface Attachment {
  contentType?: string;
  language?: string;
  data?: string;
  url?: string;
  size?: number;
  hash?: string;
  title?: string;
  creation?: string;
}

// Bundle Types

export interface Bundle<T extends FHIRResource = FHIRResource>
  extends FHIRResource {
  resourceType: 'Bundle';
  identifier?: Identifier;
  type:
    | 'document'
    | 'message'
    | 'transaction'
    | 'transaction-response'
    | 'batch'
    | 'batch-response'
    | 'history'
    | 'searchset'
    | 'collection';
  timestamp?: string;
  total?: number;
  link?: BundleLink[];
  entry?: BundleEntry<T>[];
  signature?: Signature;
}

export interface BundleLink {
  relation: string;
  url: string;
}

export interface BundleEntry<T extends FHIRResource = FHIRResource> {
  link?: BundleLink[];
  fullUrl?: string;
  resource?: T;
  search?: BundleEntrySearch;
  request?: BundleEntryRequest;
  response?: BundleEntryResponse;
}

export interface BundleEntrySearch {
  mode?: 'match' | 'include' | 'outcome';
  score?: number;
}

export interface BundleEntryRequest {
  method: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  ifNoneMatch?: string;
  ifModifiedSince?: string;
  ifMatch?: string;
  ifNoneExist?: string;
}

export interface BundleEntryResponse {
  status: string;
  location?: string;
  etag?: string;
  lastModified?: string;
  outcome?: FHIRResource;
}

export interface Signature {
  type: Coding[];
  when: string;
  who: Reference;
  onBehalfOf?: Reference;
  targetFormat?: string;
  sigFormat?: string;
  data?: string;
}

// OperationOutcome Types

export interface OperationOutcome extends FHIRResource {
  resourceType: 'OperationOutcome';
  issue: OperationOutcomeIssue[];
}

export interface OperationOutcomeIssue {
  severity: 'fatal' | 'error' | 'warning' | 'information';
  code: string;
  details?: CodeableConcept;
  diagnostics?: string;
  location?: string[];
  expression?: string[];
}

// Search Parameter Types

export interface PatientSearchParams {
  // Patient-specific search parameters
  identifier?: string;
  name?: string;
  family?: string;
  given?: string;
  gender?: 'male' | 'female' | 'other' | 'unknown';
  birthdate?: string;
  address?: string;
  'address-city'?: string;
  'address-country'?: string;
  'address-postalcode'?: string;
  'address-state'?: string;
  'address-use'?: string;
  active?: boolean;
  deceased?: boolean;
  email?: string;
  phone?: string;
  telecom?: string;
  organization?: string;

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

  // Result parameters
  _count?: number;
  _offset?: number;
  _sort?: string;
  _include?: string | string[];
  _revinclude?: string | string[];
  _summary?: 'true' | 'text' | 'data' | 'count' | 'false';
  _elements?: string | string[];
  _contained?: 'true' | 'false';
  _containedtyped?: 'true' | 'false';
}

export type PatientSearchField = keyof PatientSearchParams;

// Search parameter validation types
export interface SearchParameterDefinition {
  name: string;
  type:
    | 'string'
    | 'number'
    | 'date'
    | 'token'
    | 'reference'
    | 'composite'
    | 'quantity'
    | 'uri'
    | 'special';
  description: string;
  required?: boolean;
  multipleOr?: boolean;
  multipleAnd?: boolean;
  modifier?: string[];
}

// Common query parameters for all resources
export interface BaseSearchParams {
  _count?: number;
  _offset?: number;
  _sort?: string;
  _include?: string | string[];
  _revinclude?: string | string[];
  _summary?: 'true' | 'text' | 'data' | 'count' | 'false';
  _elements?: string | string[];
  _contained?: 'true' | 'false';
  _containedtyped?: 'true' | 'false';
}

// Generic search parameters interface
export interface SearchParams extends Record<string, unknown> {
  [key: string]: string | number | boolean | string[] | undefined;
}

// Validation Types and Utilities

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

// Search parameter validators
export const PATIENT_SEARCH_PARAMETERS: Record<
  string,
  SearchParameterDefinition
> = {
  identifier: {
    name: 'identifier',
    type: 'token',
    description: 'A patient identifier',
    multipleOr: true,
    multipleAnd: true,
  },
  name: {
    name: 'name',
    type: 'string',
    description:
      'A server defined search that may match any of the string fields in the HumanName',
    multipleOr: true,
    multipleAnd: true,
  },
  family: {
    name: 'family',
    type: 'string',
    description: 'A portion of the family name of the patient',
    multipleOr: true,
    multipleAnd: true,
  },
  given: {
    name: 'given',
    type: 'string',
    description: 'A portion of the given name of the patient',
    multipleOr: true,
    multipleAnd: true,
  },
  gender: {
    name: 'gender',
    type: 'token',
    description: 'Gender of the patient',
    multipleOr: true,
  },
  birthdate: {
    name: 'birthdate',
    type: 'date',
    description: "The patient's date of birth",
    multipleOr: true,
    multipleAnd: true,
  },
  address: {
    name: 'address',
    type: 'string',
    description:
      'A server defined search that may match any of the string fields in the Address',
    multipleOr: true,
    multipleAnd: true,
  },
  active: {
    name: 'active',
    type: 'token',
    description: 'Whether the patient record is active',
    multipleOr: true,
  },
  _count: {
    name: '_count',
    type: 'number',
    description: 'Number of results to return',
  },
  _sort: {
    name: '_sort',
    type: 'string',
    description: 'Sort order for results',
  },
};

// Validation functions are now in utils/query-builder.ts

// Type guards
export function isPatient(resource: FHIRResource): resource is Patient {
  return resource.resourceType === 'Patient';
}

export function isBundle<T extends FHIRResource>(
  resource: FHIRResource
): resource is Bundle<T> {
  return resource.resourceType === 'Bundle';
}

export function isOperationOutcome(
  resource: FHIRResource
): resource is OperationOutcome {
  return resource.resourceType === 'OperationOutcome';
}

// Authentication Types

export interface AuthenticationConfig {
  type: 'jwt' | 'bearer' | 'none';
}

export interface BearerTokenConfig extends AuthenticationConfig {
  type: 'bearer';
  token: string;
}

export interface JWTConfig extends AuthenticationConfig {
  type: 'jwt';
  token?: string;
  algorithm?:
    | 'HS256'
    | 'HS384'
    | 'HS512'
    | 'RS256'
    | 'RS384'
    | 'RS512'
    | 'ES256'
    | 'ES384'
    | 'ES512';
  issuer?: string;
  audience?: string;
  subject?: string;
  expiresIn?: string | number;
  notBefore?: string | number;
  jwtId?: string;
  keyId?: string;
  privateKey?: string;
  publicKey?: string;
  passphrase?: string;
}

export interface NoAuthConfig extends AuthenticationConfig {
  type: 'none';
}

export type AuthConfig = JWTConfig | BearerTokenConfig | NoAuthConfig;

// Client Configuration
export interface FHIRClientConfig {
  baseUrl: string;
  auth?: AuthConfig;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  userAgent?: string;
  headers?: Record<string, string>;
  validateSSL?: boolean;
}

// HTTP Request Configuration
export interface RequestConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  headers?: Record<string, string>;
  params?: Record<string, unknown>;
  data?: unknown;
  timeout?: number;
}

// HTTP Response
export interface HttpResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

// FHIR Capability Statement Types
export interface CapabilityStatement extends FHIRResource {
  resourceType: 'CapabilityStatement';
  fhirVersion?: string;
  rest?: CapabilityStatementRest[];
}

export interface CapabilityStatementRest {
  mode?: 'client' | 'server';
  resource?: CapabilityStatementResource[];
}

export interface CapabilityStatementResource {
  type?: string;
  interaction?: Array<{
    code?: string;
  }>;
}

// Error Response Types
export interface ErrorResponse {
  response?: {
    status?: number;
    statusText?: string;
    data?: unknown;
  };
  message?: string;
}

export interface OperationOutcomeIssueDetailed {
  severity: 'fatal' | 'error' | 'warning' | 'information';
  code: string;
  diagnostics?: string;
  details?: {
    text?: string;
  };
}
