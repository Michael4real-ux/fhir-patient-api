/**
 * Unit tests for FHIR type definitions and validation logic
 */

import {
  Patient,
  Bundle,
  OperationOutcome,
  PatientSearchParams,
  isPatient,
  isBundle,
  isOperationOutcome,
  FHIRResource,
  HumanName,
  ContactPoint,
  Address,
  Identifier,
} from './index';
import { QueryBuilder } from '../utils/query-builder';

describe('FHIR Type Definitions', () => {
  describe('Patient Resource', () => {
    it('should create a valid Patient resource', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        id: 'patient-123',
        active: true,
        name: [
          {
            use: 'official',
            family: 'Doe',
            given: ['John'],
          },
        ],
        gender: 'male',
        birthDate: '1980-01-01',
      };

      expect(patient.resourceType).toBe('Patient');
      expect(patient.id).toBe('patient-123');
      expect(patient.active).toBe(true);
      expect(patient.name).toHaveLength(1);
      expect(patient.name![0].family).toBe('Doe');
      expect(patient.gender).toBe('male');
    });

    it('should handle complex Patient with all fields', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        id: 'complex-patient',
        meta: {
          versionId: '1',
          lastUpdated: '2023-01-01T00:00:00Z',
        },
        identifier: [
          {
            use: 'usual',
            system: 'http://example.org/patient-ids',
            value: 'P123456',
          },
        ],
        active: true,
        name: [
          {
            use: 'official',
            family: 'Smith',
            given: ['Jane', 'Marie'],
            prefix: ['Dr.'],
          },
        ],
        telecom: [
          {
            system: 'phone',
            value: '+1-555-123-4567',
            use: 'home',
          },
        ],
        gender: 'female',
        birthDate: '1985-03-15',
        address: [
          {
            use: 'home',
            line: ['123 Main St'],
            city: 'Anytown',
            state: 'CA',
            postalCode: '12345',
            country: 'US',
          },
        ],
      };

      expect(patient.resourceType).toBe('Patient');
      expect(patient.identifier).toHaveLength(1);
      expect(patient.telecom).toHaveLength(1);
      expect(patient.address).toHaveLength(1);
    });
  });

  describe('Bundle Resource', () => {
    it('should create a valid Bundle with Patient entries', () => {
      const bundle: Bundle<Patient> = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: 1,
        entry: [
          {
            fullUrl: 'https://example.com/Patient/123',
            resource: {
              resourceType: 'Patient',
              id: '123',
              active: true,
              name: [{ family: 'Test' }],
            },
          },
        ],
      };

      expect(bundle.resourceType).toBe('Bundle');
      expect(bundle.type).toBe('searchset');
      expect(bundle.total).toBe(1);
      expect(bundle.entry).toHaveLength(1);
      expect(bundle.entry![0].resource?.resourceType).toBe('Patient');
    });

    it('should handle Bundle with links and search information', () => {
      const bundle: Bundle<Patient> = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: 100,
        link: [
          {
            relation: 'next',
            url: 'https://example.com/Patient?_getpages=next',
          },
        ],
        entry: [
          {
            fullUrl: 'https://example.com/Patient/123',
            resource: {
              resourceType: 'Patient',
              id: '123',
            },
            search: {
              mode: 'match',
              score: 1.0,
            },
          },
        ],
      };

      expect(bundle.link).toHaveLength(1);
      expect(bundle.entry![0].search?.mode).toBe('match');
    });
  });

  describe('OperationOutcome Resource', () => {
    it('should create a valid OperationOutcome', () => {
      const outcome: OperationOutcome = {
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'invalid',
            diagnostics: 'Invalid parameter value',
          },
        ],
      };

      expect(outcome.resourceType).toBe('OperationOutcome');
      expect(outcome.issue).toHaveLength(1);
      expect(outcome.issue[0].severity).toBe('error');
    });

    it('should handle multiple issues with different severities', () => {
      const outcome: OperationOutcome = {
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'invalid',
            diagnostics: 'Invalid parameter',
          },
          {
            severity: 'warning',
            code: 'informational',
            diagnostics: 'This is a warning',
          },
        ],
      };

      expect(outcome.issue).toHaveLength(2);
      expect(outcome.issue[0].severity).toBe('error');
      expect(outcome.issue[1].severity).toBe('warning');
    });
  });

  describe('Search Parameter Validation', () => {
    describe('validateSearchParams', () => {
      it('should validate valid search parameters', () => {
        const params: PatientSearchParams = {
          family: 'Smith',
          given: 'John',
          gender: 'male',
          birthdate: '1990-01-01',
          active: true,
          _count: 10,
        };

        const result = QueryBuilder.validateSearchParams(params);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject invalid _count parameter', () => {
        const params: PatientSearchParams = {
          _count: -1,
        };

        const result = QueryBuilder.validateSearchParams(params);
        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].field).toBe('_count');
        expect(result.errors[0].message).toContain('_count');
      });

      it('should reject _count parameter that is too large', () => {
        const params: PatientSearchParams = {
          _count: 2000,
        };

        const result = QueryBuilder.validateSearchParams(params);
        expect(result.isValid).toBe(false);
        expect(result.errors[0].field).toBe('_count');
        expect(result.errors[0].message).toContain('_count');
      });

      it('should reject invalid gender parameter', () => {
        const params: PatientSearchParams = {
          gender: 'invalid' as 'male' | 'female' | 'other' | 'unknown',
        };

        const result = QueryBuilder.validateSearchParams(params);
        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].field).toBe('gender');
        expect(result.errors[0].message).toContain('gender');
      });

      it('should reject invalid birthdate format', () => {
        const params: PatientSearchParams = {
          birthdate: 'invalid-date',
        };

        const result = QueryBuilder.validateSearchParams(params);
        expect(result.isValid).toBe(false);
        expect(result.errors[0].field).toBe('birthdate');
        expect(result.errors[0].message).toContain('birthdate');
      });

      it('should accept valid birthdate formats', () => {
        const validDates = ['2023', '2023-01', '2023-01-15'];

        validDates.forEach(date => {
          const params: PatientSearchParams = { birthdate: date };
          const result = QueryBuilder.validateSearchParams(params);
          expect(result.isValid).toBe(true);
        });
      });

      it('should reject invalid active parameter', () => {
        const params: PatientSearchParams = {
          active: 'maybe' as unknown as boolean,
        };

        const result = QueryBuilder.validateSearchParams(params);
        expect(result.isValid).toBe(false);
        expect(result.errors[0].field).toBe('active');
        expect(result.errors[0].message).toContain('active');
      });

      it('should handle multiple validation errors', () => {
        const params: PatientSearchParams = {
          _count: -1,
          gender: 'invalid' as 'male' | 'female' | 'other' | 'unknown',
          birthdate: 'bad-date',
          active: 'not-boolean' as unknown as boolean,
        };

        const result = QueryBuilder.validateSearchParams(params);
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors.some(e => e.field === '_count')).toBe(true);
        expect(result.errors.some(e => e.field === 'gender')).toBe(true);
        expect(result.errors.some(e => e.field === 'birthdate')).toBe(true);
        expect(result.errors.some(e => e.field === 'active')).toBe(true);
      });
    });
  });

  describe('Type Guards', () => {
    describe('isPatient', () => {
      it('should identify Patient resources correctly', () => {
        const patient: FHIRResource = {
          resourceType: 'Patient',
          id: 'test',
        };

        expect(isPatient(patient)).toBe(true);
      });

      it('should reject non-Patient resources', () => {
        const bundle: FHIRResource = {
          resourceType: 'Bundle',
        };

        expect(isPatient(bundle)).toBe(false);
      });
    });

    describe('isBundle', () => {
      it('should identify Bundle resources correctly', () => {
        const bundle: FHIRResource = {
          resourceType: 'Bundle',
        };

        expect(isBundle(bundle)).toBe(true);
      });

      it('should reject non-Bundle resources', () => {
        const patient: FHIRResource = {
          resourceType: 'Patient',
        };

        expect(isBundle(patient)).toBe(false);
      });
    });

    describe('isOperationOutcome', () => {
      it('should identify OperationOutcome resources correctly', () => {
        const outcome: FHIRResource = {
          resourceType: 'OperationOutcome',
        };

        expect(isOperationOutcome(outcome)).toBe(true);
      });

      it('should reject non-OperationOutcome resources', () => {
        const patient: FHIRResource = {
          resourceType: 'Patient',
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
          text: 'Dr. John Smith Jr.',
          family: 'Smith',
          given: ['John', 'Michael'],
          prefix: ['Dr.'],
          suffix: ['Jr.'],
          period: {
            start: '2000-01-01',
            end: '2023-12-31',
          },
        };

        expect(name.use).toBe('official');
        expect(name.family).toBe('Smith');
        expect(name.given).toHaveLength(2);
        expect(name.prefix).toHaveLength(1);
        expect(name.suffix).toHaveLength(1);
      });
    });

    describe('ContactPoint', () => {
      it('should handle all ContactPoint fields', () => {
        const contact: ContactPoint = {
          system: 'phone',
          value: '+1-555-123-4567',
          use: 'work',
          rank: 1,
          period: {
            start: '2020-01-01',
          },
        };

        expect(contact.system).toBe('phone');
        expect(contact.use).toBe('work');
        expect(contact.rank).toBe(1);
      });
    });

    describe('Address', () => {
      it('should handle all Address fields', () => {
        const address: Address = {
          use: 'home',
          type: 'physical',
          text: '123 Main St, Anytown, CA 12345',
          line: ['123 Main St', 'Apt 4B'],
          city: 'Anytown',
          district: 'County',
          state: 'CA',
          postalCode: '12345',
          country: 'US',
          period: {
            start: '2020-01-01',
          },
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
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                code: 'MR',
                display: 'Medical Record Number',
              },
            ],
          },
          system: 'http://example.org/patient-ids',
          value: 'P123456',
          period: {
            start: '2020-01-01',
          },
          assigner: {
            display: 'Example Hospital',
          },
        };

        expect(identifier.use).toBe('official');
        expect(identifier.system).toBe('http://example.org/patient-ids');
        expect(identifier.value).toBe('P123456');
      });
    });
  });
});
