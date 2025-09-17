/**
 * Unit tests for FHIR type definitions and validation logic
 */

import {
  Patient,
  Bundle,
  OperationOutcome,
  PatientSearchParams,
  validatePatientSearchParams,
  isPatient,
  isBundle,
  isOperationOutcome,
  ValidationResult,
  FHIRResource,
  HumanName,
  ContactPoint,
  Address,
  Identifier
} from './index';

describe('FHIR Type Definitions', () => {
  describe('Patient Resource', () => {
    it('should create a valid Patient resource', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        id: 'patient-123',
        active: true,
        name: [{
          use: 'official',
          family: 'Smith',
          given: ['John', 'Michael']
        }],
        gender: 'male',
        birthDate: '1990-01-01'
      };

      expect(patient.resourceType).toBe('Patient');
      expect(patient.id).toBe('patient-123');
      expect(patient.active).toBe(true);
      expect(patient.name?.[0]?.family).toBe('Smith');
      expect(patient.gender).toBe('male');
    });

    it('should handle complex Patient with all fields', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        id: 'complex-patient',
        meta: {
          versionId: '1',
          lastUpdated: '2023-01-01T00:00:00Z'
        },
        identifier: [{
          use: 'usual',
          system: 'http://example.org/patient-ids',
          value: 'P123456'
        }],
        active: true,
        name: [{
          use: 'official',
          family: 'Doe',
          given: ['Jane', 'Marie'],
          prefix: ['Ms.']
        }],
        telecom: [{
          system: 'phone',
          value: '+1-555-123-4567',
          use: 'home'
        }, {
          system: 'email',
          value: 'jane.doe@example.com',
          use: 'work'
        }],
        gender: 'female',
        birthDate: '1985-03-15',
        address: [{
          use: 'home',
          type: 'physical',
          line: ['123 Main St', 'Apt 4B'],
          city: 'Anytown',
          state: 'NY',
          postalCode: '12345',
          country: 'US'
        }],
        contact: [{
          relationship: [{
            coding: [{
              system: 'http://terminology.hl7.org/CodeSystem/v2-0131',
              code: 'C',
              display: 'Emergency Contact'
            }]
          }],
          name: {
            family: 'Doe',
            given: ['John']
          },
          telecom: [{
            system: 'phone',
            value: '+1-555-987-6543'
          }]
        }],
        communication: [{
          language: {
            coding: [{
              system: 'urn:ietf:bcp:47',
              code: 'en-US',
              display: 'English (United States)'
            }]
          },
          preferred: true
        }]
      };

      expect(patient.resourceType).toBe('Patient');
      expect(patient.identifier?.[0]?.value).toBe('P123456');
      expect(patient.telecom).toHaveLength(2);
      expect(patient.address?.[0]?.city).toBe('Anytown');
      expect(patient.contact?.[0]?.name?.given?.[0]).toBe('John');
      expect(patient.communication?.[0]?.preferred).toBe(true);
    });
  });

  describe('Bundle Resource', () => {
    it('should create a valid Bundle with Patient entries', () => {
      const bundle: Bundle<Patient> = {
        resourceType: 'Bundle',
        id: 'patient-bundle',
        type: 'searchset',
        total: 2,
        entry: [{
          fullUrl: 'http://example.org/Patient/1',
          resource: {
            resourceType: 'Patient',
            id: '1',
            name: [{ family: 'Smith' }]
          }
        }, {
          fullUrl: 'http://example.org/Patient/2',
          resource: {
            resourceType: 'Patient',
            id: '2',
            name: [{ family: 'Jones' }]
          }
        }]
      };

      expect(bundle.resourceType).toBe('Bundle');
      expect(bundle.type).toBe('searchset');
      expect(bundle.total).toBe(2);
      expect(bundle.entry).toHaveLength(2);
      expect(bundle.entry?.[0]?.resource?.resourceType).toBe('Patient');
    });

    it('should handle Bundle with links and search information', () => {
      const bundle: Bundle<Patient> = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: 100,
        link: [{
          relation: 'self',
          url: 'http://example.org/Patient?_count=10'
        }, {
          relation: 'next',
          url: 'http://example.org/Patient?_count=10&_offset=10'
        }],
        entry: [{
          fullUrl: 'http://example.org/Patient/1',
          resource: {
            resourceType: 'Patient',
            id: '1'
          },
          search: {
            mode: 'match',
            score: 1.0
          }
        }]
      };

      expect(bundle.link).toHaveLength(2);
      expect(bundle.link?.[0]?.relation).toBe('self');
      expect(bundle.entry?.[0]?.search?.mode).toBe('match');
    });
  });

  describe('OperationOutcome Resource', () => {
    it('should create a valid OperationOutcome', () => {
      const outcome: OperationOutcome = {
        resourceType: 'OperationOutcome',
        issue: [{
          severity: 'error',
          code: 'invalid',
          diagnostics: 'Invalid patient identifier format'
        }]
      };

      expect(outcome.resourceType).toBe('OperationOutcome');
      expect(outcome.issue).toHaveLength(1);
      expect(outcome.issue[0].severity).toBe('error');
      expect(outcome.issue[0].code).toBe('invalid');
    });

    it('should handle multiple issues with different severities', () => {
      const outcome: OperationOutcome = {
        resourceType: 'OperationOutcome',
        issue: [{
          severity: 'warning',
          code: 'incomplete',
          diagnostics: 'Patient name is incomplete'
        }, {
          severity: 'information',
          code: 'informational',
          diagnostics: 'Patient record updated successfully'
        }]
      };

      expect(outcome.issue).toHaveLength(2);
      expect(outcome.issue[0].severity).toBe('warning');
      expect(outcome.issue[1].severity).toBe('information');
    });
  });
});

describe('Search Parameter Validation', () => {
  describe('validatePatientSearchParams', () => {
    it('should validate valid search parameters', () => {
      const params: PatientSearchParams = {
        family: 'Smith',
        given: 'John',
        gender: 'male',
        birthdate: '1990-01-01',
        active: true,
        _count: 10
      };

      const result = validatePatientSearchParams(params);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid _count parameter', () => {
      const params: PatientSearchParams = {
        _count: -1
      };

      const result = validatePatientSearchParams(params);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('_count');
      expect(result.errors[0].code).toBe('invalid-parameter');
    });

    it('should reject _count parameter that is too large', () => {
      const params: PatientSearchParams = {
        _count: 2000
      };

      const result = validatePatientSearchParams(params);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].field).toBe('_count');
    });

    it('should reject invalid gender parameter', () => {
      const params: PatientSearchParams = {
        gender: 'invalid' as any
      };

      const result = validatePatientSearchParams(params);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('gender');
    });

    it('should reject invalid birthdate format', () => {
      const params: PatientSearchParams = {
        birthdate: 'invalid-date'
      };

      const result = validatePatientSearchParams(params);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].field).toBe('birthdate');
    });

    it('should accept valid birthdate formats', () => {
      const validDates = ['2023', '2023-01', '2023-01-15'];

      validDates.forEach(date => {
        const params: PatientSearchParams = { birthdate: date };
        const result = validatePatientSearchParams(params);
        expect(result.isValid).toBe(true);
      });
    });

    it('should reject non-boolean active parameter', () => {
      const params: PatientSearchParams = {
        active: 'true' as any
      };

      const result = validatePatientSearchParams(params);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].field).toBe('active');
    });

    it('should handle multiple validation errors', () => {
      const params: PatientSearchParams = {
        gender: 'invalid' as any,
        _count: -5,
        birthdate: 'bad-date',
        active: 'not-boolean' as any
      };

      const result = validatePatientSearchParams(params);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(4);

      const errorFields = result.errors.map(e => e.field);
      expect(errorFields).toContain('gender');
      expect(errorFields).toContain('_count');
      expect(errorFields).toContain('birthdate');
      expect(errorFields).toContain('active');
    });
  });
});

describe('Type Guards', () => {
  describe('isPatient', () => {
    it('should identify Patient resources correctly', () => {
      const patient: FHIRResource = {
        resourceType: 'Patient',
        id: 'test'
      };

      expect(isPatient(patient)).toBe(true);
    });

    it('should reject non-Patient resources', () => {
      const bundle: FHIRResource = {
        resourceType: 'Bundle',
        id: 'test'
      };

      expect(isPatient(bundle)).toBe(false);
    });
  });

  describe('isBundle', () => {
    it('should identify Bundle resources correctly', () => {
      const bundle: FHIRResource = {
        resourceType: 'Bundle',
        id: 'test'
      };

      expect(isBundle(bundle)).toBe(true);
    });

    it('should reject non-Bundle resources', () => {
      const patient: FHIRResource = {
        resourceType: 'Patient',
        id: 'test'
      };

      expect(isBundle(patient)).toBe(false);
    });
  });

  describe('isOperationOutcome', () => {
    it('should identify OperationOutcome resources correctly', () => {
      const outcome: FHIRResource = {
        resourceType: 'OperationOutcome',
        id: 'test'
      };

      expect(isOperationOutcome(outcome)).toBe(true);
    });

    it('should reject non-OperationOutcome resources', () => {
      const patient: FHIRResource = {
        resourceType: 'Patient',
        id: 'test'
      };

      expect(isOperationOutcome(patient)).toBe(false);
    });
  });
});

describe('Complex Type Structures', () => {
  describe('HumanName', () => {
    it('should handle all HumanName fields', () => {
      const name: HumanName = {
        use: 'official',
        text: 'Dr. John Michael Smith Jr.',
        family: 'Smith',
        given: ['John', 'Michael'],
        prefix: ['Dr.'],
        suffix: ['Jr.'],
        period: {
          start: '2000-01-01',
          end: '2023-12-31'
        }
      };

      expect(name.use).toBe('official');
      expect(name.given).toHaveLength(2);
      expect(name.prefix?.[0]).toBe('Dr.');
      expect(name.suffix?.[0]).toBe('Jr.');
    });
  });

  describe('ContactPoint', () => {
    it('should handle all ContactPoint fields', () => {
      const contact: ContactPoint = {
        system: 'email',
        value: 'john.smith@example.com',
        use: 'work',
        rank: 1,
        period: {
          start: '2020-01-01'
        }
      };

      expect(contact.system).toBe('email');
      expect(contact.use).toBe('work');
      expect(contact.rank).toBe(1);
    });
  });

  describe('Address', () => {
    it('should handle all Address fields', () => {
      const address: Address = {
        use: 'home',
        type: 'physical',
        text: '123 Main Street, Apt 4B, Anytown, NY 12345',
        line: ['123 Main Street', 'Apt 4B'],
        city: 'Anytown',
        district: 'Manhattan',
        state: 'NY',
        postalCode: '12345',
        country: 'US',
        period: {
          start: '2020-01-01'
        }
      };

      expect(address.use).toBe('home');
      expect(address.line).toHaveLength(2);
      expect(address.city).toBe('Anytown');
    });
  });

  describe('Identifier', () => {
    it('should handle all Identifier fields', () => {
      const identifier: Identifier = {
        use: 'official',
        type: {
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
            code: 'MR',
            display: 'Medical Record Number'
          }]
        },
        system: 'http://hospital.example.org/patient-ids',
        value: 'P123456789',
        period: {
          start: '2020-01-01'
        }
      };

      expect(identifier.use).toBe('official');
      expect(identifier.value).toBe('P123456789');
      expect(identifier.type?.coding?.[0]?.code).toBe('MR');
    });
  });
});