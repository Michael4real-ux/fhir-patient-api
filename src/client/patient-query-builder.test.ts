/**
 * Unit tests for PatientQueryBuilder
 */

import { PatientQueryBuilder } from './patient-query-builder';
import { Bundle, Patient, PatientSearchParams } from '../types';
import { FHIRValidationError } from '../errors';

describe('PatientQueryBuilder', () => {
  let mockExecuteFunction: jest.Mock<Promise<Bundle<Patient>>, [PatientSearchParams]>;
  let queryBuilder: PatientQueryBuilder;
  const baseUrl = 'https://example.com/fhir';

  beforeEach(() => {
    mockExecuteFunction = jest.fn();
    queryBuilder = new PatientQueryBuilder(baseUrl, mockExecuteFunction);
  });

  describe('Constructor', () => {
    it('should create a new PatientQueryBuilder instance', () => {
      expect(queryBuilder).toBeInstanceOf(PatientQueryBuilder);
    });

    it('should initialize with empty parameters', () => {
      const params = queryBuilder.getParams();
      expect(params).toEqual({});
    });
  });

  describe('where() method', () => {
    it('should add a simple where clause', () => {
      queryBuilder.where('family', 'Smith');
      const params = queryBuilder.getParams();
      expect(params.family).toBe('Smith');
    });

    it('should handle multiple where clauses for different fields', () => {
      queryBuilder
        .where('family', 'Smith')
        .where('given', 'John')
        .where('gender', 'male');

      const params = queryBuilder.getParams();
      expect(params.family).toBe('Smith');
      expect(params.given).toBe('John');
      expect(params.gender).toBe('male');
    });

    it('should handle multiple values for the same field (OR logic)', () => {
      queryBuilder
        .where('family', 'Smith')
        .where('family', 'Johnson');

      const params = queryBuilder.getParams();
      expect(params.family).toBe('Smith,Johnson');
    });

    it('should handle array fields like _include', () => {
      queryBuilder
        .where('_include', 'Patient:organization')
        .where('_include', 'Patient:general-practitioner');

      const params = queryBuilder.getParams();
      expect(params._include).toEqual(['Patient:organization', 'Patient:general-practitioner']);
    });

    it('should throw error for empty field name', () => {
      expect(() => {
        queryBuilder.where('' as any, 'value');
      }).toThrow(FHIRValidationError);
    });

    it('should throw error for null/undefined value', () => {
      expect(() => {
        queryBuilder.where('family', null as any);
      }).toThrow(FHIRValidationError);

      expect(() => {
        queryBuilder.where('family', undefined as any);
      }).toThrow(FHIRValidationError);
    });

    it('should throw error for empty value', () => {
      expect(() => {
        queryBuilder.where('family', '   ');
      }).toThrow(FHIRValidationError);
    });

    it('should throw error for invalid field name', () => {
      expect(() => {
        queryBuilder.where('invalidField' as any, 'value');
      }).toThrow(FHIRValidationError);
    });

    it('should validate gender values', () => {
      expect(() => {
        queryBuilder.where('gender', 'invalid');
      }).toThrow(FHIRValidationError);

      // Valid gender values should work
      expect(() => {
        queryBuilder.where('gender', 'male');
      }).not.toThrow();
    });

    it('should validate boolean values', () => {
      expect(() => {
        queryBuilder.where('active', 'maybe');
      }).toThrow(FHIRValidationError);

      // Valid boolean values should work
      expect(() => {
        queryBuilder.where('active', 'true');
      }).not.toThrow();
    });

    it('should validate birthdate format', () => {
      expect(() => {
        queryBuilder.where('birthdate', '1990-13-01'); // Invalid month
      }).toThrow(FHIRValidationError);

      expect(() => {
        queryBuilder.where('birthdate', 'not-a-date');
      }).toThrow(FHIRValidationError);

      // Valid date formats should work
      expect(() => {
        queryBuilder.where('birthdate', '1990');
      }).not.toThrow();

      expect(() => {
        queryBuilder.where('birthdate', '1990-01');
      }).not.toThrow();

      expect(() => {
        queryBuilder.where('birthdate', '1990-01-15');
      }).not.toThrow();
    });

    it('should handle numeric and boolean values', () => {
      queryBuilder.where('_count', 50);
      queryBuilder.where('active', true);

      const params = queryBuilder.getParams();
      expect(params._count).toBe('50');
      expect(params.active).toBe('true');
    });
  });

  describe('limit() method', () => {
    it('should set the _count parameter', () => {
      queryBuilder.limit(50);
      const params = queryBuilder.getParams();
      expect(params._count).toBe(50);
    });

    it('should throw error for negative limit', () => {
      expect(() => {
        queryBuilder.limit(-1);
      }).toThrow(FHIRValidationError);
    });

    it('should throw error for limit over 1000', () => {
      expect(() => {
        queryBuilder.limit(1001);
      }).toThrow(FHIRValidationError);
    });

    it('should throw error for non-integer limit', () => {
      expect(() => {
        queryBuilder.limit(50.5);
      }).toThrow(FHIRValidationError);
    });

    it('should allow limit of 0', () => {
      expect(() => {
        queryBuilder.limit(0);
      }).not.toThrow();
    });
  });

  describe('sort() method', () => {
    it('should set ascending sort by default', () => {
      queryBuilder.sort('family');
      const params = queryBuilder.getParams();
      expect(params._sort).toBe('family');
    });

    it('should set descending sort when specified', () => {
      queryBuilder.sort('birthdate', 'desc');
      const params = queryBuilder.getParams();
      expect(params._sort).toBe('-birthdate');
    });

    it('should handle multiple sort fields', () => {
      queryBuilder
        .sort('family', 'asc')
        .sort('given', 'desc');

      const params = queryBuilder.getParams();
      expect(params._sort).toBe('family,-given');
    });

    it('should throw error for empty field name', () => {
      expect(() => {
        queryBuilder.sort('');
      }).toThrow(FHIRValidationError);

      expect(() => {
        queryBuilder.sort('   ');
      }).toThrow(FHIRValidationError);
    });

    it('should throw error for invalid sort field', () => {
      expect(() => {
        queryBuilder.sort('invalidField');
      }).toThrow(FHIRValidationError);
    });

    it('should accept valid sort fields', () => {
      const validFields = ['name', 'family', 'given', 'birthdate', 'gender', 'identifier', '_lastUpdated', '_id'];
      
      validFields.forEach(field => {
        expect(() => {
          new PatientQueryBuilder(baseUrl, mockExecuteFunction).sort(field);
        }).not.toThrow();
      });
    });
  });

  describe('include() method', () => {
    it('should add include parameter', () => {
      queryBuilder.include('Patient:organization');
      const params = queryBuilder.getParams();
      expect(params._include).toEqual(['Patient:organization']);
    });

    it('should handle multiple includes', () => {
      queryBuilder
        .include('Patient:organization')
        .include('Patient:general-practitioner');

      const params = queryBuilder.getParams();
      expect(params._include).toEqual(['Patient:organization', 'Patient:general-practitioner']);
    });

    it('should not add duplicate includes', () => {
      queryBuilder
        .include('Patient:organization')
        .include('Patient:organization');

      const params = queryBuilder.getParams();
      expect(params._include).toEqual(['Patient:organization']);
    });

    it('should throw error for empty include', () => {
      expect(() => {
        queryBuilder.include('');
      }).toThrow(FHIRValidationError);

      expect(() => {
        queryBuilder.include('   ');
      }).toThrow(FHIRValidationError);
    });

    it('should throw error for invalid include format', () => {
      expect(() => {
        queryBuilder.include('invalid-format');
      }).toThrow(FHIRValidationError);

      expect(() => {
        queryBuilder.include('Patient'); // Missing field
      }).toThrow(FHIRValidationError);
    });

    it('should accept valid include formats', () => {
      expect(() => {
        queryBuilder.include('Patient:organization');
      }).not.toThrow();

      expect(() => {
        queryBuilder.include('Patient:general-practitioner:Organization');
      }).not.toThrow();
    });
  });

  describe('offset() method', () => {
    it('should set the _offset parameter', () => {
      queryBuilder.offset(20);
      const params = queryBuilder.getParams();
      expect(params._offset).toBe(20);
    });

    it('should throw error for negative offset', () => {
      expect(() => {
        queryBuilder.offset(-1);
      }).toThrow(FHIRValidationError);
    });

    it('should throw error for non-integer offset', () => {
      expect(() => {
        queryBuilder.offset(20.5);
      }).toThrow(FHIRValidationError);
    });

    it('should allow offset of 0', () => {
      expect(() => {
        queryBuilder.offset(0);
      }).not.toThrow();
    });
  });

  describe('summary() method', () => {
    it('should set the _summary parameter', () => {
      queryBuilder.summary('count');
      const params = queryBuilder.getParams();
      expect(params._summary).toBe('count');
    });

    it('should throw error for invalid summary mode', () => {
      expect(() => {
        queryBuilder.summary('invalid' as any);
      }).toThrow(FHIRValidationError);
    });

    it('should accept all valid summary modes', () => {
      const validModes: Array<'true' | 'text' | 'data' | 'count' | 'false'> = 
        ['true', 'text', 'data', 'count', 'false'];

      validModes.forEach(mode => {
        expect(() => {
          new PatientQueryBuilder(baseUrl, mockExecuteFunction).summary(mode);
        }).not.toThrow();
      });
    });
  });

  describe('elements() method', () => {
    it('should set elements parameter with string', () => {
      queryBuilder.elements('id,name,gender');
      const params = queryBuilder.getParams();
      expect(params._elements).toEqual(['id,name,gender']);
    });

    it('should set elements parameter with array', () => {
      queryBuilder.elements(['id', 'name', 'gender']);
      const params = queryBuilder.getParams();
      expect(params._elements).toEqual(['id', 'name', 'gender']);
    });

    it('should throw error for empty elements', () => {
      expect(() => {
        queryBuilder.elements('');
      }).toThrow(FHIRValidationError);

      expect(() => {
        queryBuilder.elements([]);
      }).toThrow(FHIRValidationError);
    });

    it('should throw error for array with empty strings', () => {
      expect(() => {
        queryBuilder.elements(['id', '', 'name']);
      }).toThrow(FHIRValidationError);
    });
  });

  describe('execute() method', () => {
    it('should call the execute function with current parameters', async () => {
      const mockBundle: Bundle<Patient> = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: 1,
        entry: []
      };

      mockExecuteFunction.mockResolvedValue(mockBundle);

      queryBuilder.where('family', 'Smith').limit(10);
      const result = await queryBuilder.execute();

      expect(mockExecuteFunction).toHaveBeenCalledWith({
        family: 'Smith',
        _count: 10
      });
      expect(result).toBe(mockBundle);
    });

    it('should validate parameters before execution', async () => {
      // Create invalid parameters by directly manipulating internal state
      (queryBuilder as any).params = { _count: -1 };

      await expect(queryBuilder.execute()).rejects.toThrow(FHIRValidationError);
      expect(mockExecuteFunction).not.toHaveBeenCalled();
    });
  });

  describe('first() method', () => {
    it('should return the first patient from results', async () => {
      const mockPatient: Patient = {
        resourceType: 'Patient',
        id: 'patient-1',
        name: [{ family: 'Smith' }]
      };

      const mockBundle: Bundle<Patient> = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: 1,
        entry: [{ resource: mockPatient }]
      };

      mockExecuteFunction.mockResolvedValue(mockBundle);

      const result = await queryBuilder.first();
      expect(result).toBe(mockPatient);
      expect(mockExecuteFunction).toHaveBeenCalledWith({ _count: 1 });
    });

    it('should return null when no results found', async () => {
      const mockBundle: Bundle<Patient> = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: 0,
        entry: []
      };

      mockExecuteFunction.mockResolvedValue(mockBundle);

      const result = await queryBuilder.first();
      expect(result).toBeNull();
    });

    it('should not modify original parameters', async () => {
      queryBuilder.limit(50);
      
      const mockBundle: Bundle<Patient> = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: 0,
        entry: []
      };

      mockExecuteFunction.mockResolvedValue(mockBundle);

      await queryBuilder.first();
      
      const params = queryBuilder.getParams();
      expect(params._count).toBe(50);
    });
  });

  describe('count() method', () => {
    it('should return the total count from bundle', async () => {
      const mockBundle: Bundle<Patient> = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: 42,
        entry: []
      };

      mockExecuteFunction.mockResolvedValue(mockBundle);

      const result = await queryBuilder.count();
      expect(result).toBe(42);
      expect(mockExecuteFunction).toHaveBeenCalledWith({ _summary: 'count' });
    });

    it('should return 0 when total is undefined', async () => {
      const mockBundle: Bundle<Patient> = {
        resourceType: 'Bundle',
        type: 'searchset',
        entry: []
      };

      mockExecuteFunction.mockResolvedValue(mockBundle);

      const result = await queryBuilder.count();
      expect(result).toBe(0);
    });

    it('should not modify original parameters', async () => {
      queryBuilder.summary('text');
      
      const mockBundle: Bundle<Patient> = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: 5,
        entry: []
      };

      mockExecuteFunction.mockResolvedValue(mockBundle);

      await queryBuilder.count();
      
      const params = queryBuilder.getParams();
      expect(params._summary).toBe('text');
    });
  });

  describe('stream() method', () => {
    it('should stream all patients from multiple pages', async () => {
      const mockPatients: Patient[] = [
        { resourceType: 'Patient', id: 'patient-1', name: [{ family: 'Smith' }] },
        { resourceType: 'Patient', id: 'patient-2', name: [{ family: 'Johnson' }] },
        { resourceType: 'Patient', id: 'patient-3', name: [{ family: 'Brown' }] }
      ];

      // Mock first page (2 results)
      const firstPageBundle: Bundle<Patient> = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: 3,
        entry: [
          { resource: mockPatients[0] },
          { resource: mockPatients[1] }
        ]
      };

      // Mock second page (1 result)
      const secondPageBundle: Bundle<Patient> = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: 3,
        entry: [
          { resource: mockPatients[2] }
        ]
      };

      mockExecuteFunction
        .mockResolvedValueOnce(firstPageBundle)
        .mockResolvedValueOnce(secondPageBundle);

      queryBuilder.limit(2); // Set page size to 2

      const streamedPatients: Patient[] = [];
      for await (const patient of queryBuilder.stream()) {
        streamedPatients.push(patient);
      }

      expect(streamedPatients).toHaveLength(3);
      expect(streamedPatients[0].id).toBe('patient-1');
      expect(streamedPatients[1].id).toBe('patient-2');
      expect(streamedPatients[2].id).toBe('patient-3');

      // Verify pagination calls
      expect(mockExecuteFunction).toHaveBeenCalledTimes(2);
      expect(mockExecuteFunction).toHaveBeenNthCalledWith(1, { _count: 2, _offset: 0 });
      expect(mockExecuteFunction).toHaveBeenNthCalledWith(2, { _count: 2, _offset: 2 });
    });

    it('should handle empty results', async () => {
      const emptyBundle: Bundle<Patient> = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: 0,
        entry: []
      };

      mockExecuteFunction.mockResolvedValue(emptyBundle);

      const streamedPatients: Patient[] = [];
      for await (const patient of queryBuilder.stream()) {
        streamedPatients.push(patient);
      }

      expect(streamedPatients).toHaveLength(0);
      expect(mockExecuteFunction).toHaveBeenCalledTimes(1);
    });

    it('should use default page size when not specified', async () => {
      const mockBundle: Bundle<Patient> = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: 1,
        entry: [
          { resource: { resourceType: 'Patient', id: 'patient-1' } }
        ]
      };

      mockExecuteFunction.mockResolvedValue(mockBundle);

      const streamedPatients: Patient[] = [];
      for await (const patient of queryBuilder.stream()) {
        streamedPatients.push(patient);
      }

      expect(streamedPatients).toHaveLength(1);
      expect(mockExecuteFunction).toHaveBeenCalledWith({ _count: 50, _offset: 0 });
    });

    it('should handle pagination without total count', async () => {
      const firstPageBundle: Bundle<Patient> = {
        resourceType: 'Bundle',
        type: 'searchset',
        entry: [
          { resource: { resourceType: 'Patient', id: 'patient-1' } },
          { resource: { resourceType: 'Patient', id: 'patient-2' } }
        ]
      };

      const secondPageBundle: Bundle<Patient> = {
        resourceType: 'Bundle',
        type: 'searchset',
        entry: [
          { resource: { resourceType: 'Patient', id: 'patient-3' } }
        ]
      };

      mockExecuteFunction
        .mockResolvedValueOnce(firstPageBundle)
        .mockResolvedValueOnce(secondPageBundle);

      queryBuilder.limit(2);

      const streamedPatients: Patient[] = [];
      for await (const patient of queryBuilder.stream()) {
        streamedPatients.push(patient);
      }

      expect(streamedPatients).toHaveLength(3);
      expect(mockExecuteFunction).toHaveBeenCalledTimes(2);
    });

    it('should not modify original parameters', async () => {
      queryBuilder.limit(10).offset(5);

      const mockBundle: Bundle<Patient> = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: 1,
        entry: [
          { resource: { resourceType: 'Patient', id: 'patient-1' } }
        ]
      };

      mockExecuteFunction.mockResolvedValue(mockBundle);

      const streamedPatients: Patient[] = [];
      for await (const patient of queryBuilder.stream()) {
        streamedPatients.push(patient);
      }

      const params = queryBuilder.getParams();
      expect(params._count).toBe(10);
      expect(params._offset).toBe(5);
    });

    it('should handle bundles with entries but no resources', async () => {
      const mockBundle: Bundle<Patient> = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: 1,
        entry: [
          {} // Entry without resource
        ]
      };

      mockExecuteFunction.mockResolvedValue(mockBundle);

      const streamedPatients: Patient[] = [];
      for await (const patient of queryBuilder.stream()) {
        streamedPatients.push(patient);
      }

      expect(streamedPatients).toHaveLength(0);
    });

    it('should respect existing offset parameter', async () => {
      queryBuilder.offset(10).limit(5);

      const mockBundle: Bundle<Patient> = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: 12,
        entry: [
          { resource: { resourceType: 'Patient', id: 'patient-11' } },
          { resource: { resourceType: 'Patient', id: 'patient-12' } }
        ]
      };

      mockExecuteFunction.mockResolvedValue(mockBundle);

      const streamedPatients: Patient[] = [];
      for await (const patient of queryBuilder.stream()) {
        streamedPatients.push(patient);
      }

      expect(streamedPatients).toHaveLength(2);
      expect(mockExecuteFunction).toHaveBeenCalledWith({ _count: 5, _offset: 10 });
    });
  });

  describe('buildUrl() method', () => {
    it('should build correct URL with parameters', () => {
      queryBuilder
        .where('family', 'Smith')
        .where('gender', 'male')
        .limit(10);

      const url = queryBuilder.buildUrl();
      expect(url).toContain('https://example.com/fhir/Patient');
      expect(url).toContain('family=Smith');
      expect(url).toContain('gender=male');
      expect(url).toContain('_count=10');
    });

    it('should throw error for invalid parameters', () => {
      // Create invalid parameters
      (queryBuilder as any).params = { _count: -1 };

      expect(() => {
        queryBuilder.buildUrl();
      }).toThrow(FHIRValidationError);
    });
  });

  describe('reset() method', () => {
    it('should clear all parameters', () => {
      queryBuilder
        .where('family', 'Smith')
        .limit(10)
        .sort('name');

      queryBuilder.reset();
      
      const params = queryBuilder.getParams();
      expect(params).toEqual({});
    });

    it('should return the same instance for chaining', () => {
      const result = queryBuilder.reset();
      expect(result).toBe(queryBuilder);
    });
  });

  describe('clone() method', () => {
    it('should create a copy with same parameters', () => {
      queryBuilder
        .where('family', 'Smith')
        .limit(10)
        .include('Patient:organization');

      const cloned = queryBuilder.clone();
      
      expect(cloned).not.toBe(queryBuilder);
      expect(cloned.getParams()).toEqual(queryBuilder.getParams());
    });

    it('should create independent copies', () => {
      queryBuilder.where('family', 'Smith');
      const cloned = queryBuilder.clone();
      
      cloned.where('given', 'John');
      
      expect(queryBuilder.getParams().given).toBeUndefined();
      expect(cloned.getParams().given).toBe('John');
    });

    it('should deep clone array parameters', () => {
      queryBuilder.include('Patient:organization');
      const cloned = queryBuilder.clone();
      
      cloned.include('Patient:general-practitioner');
      
      const originalIncludes = queryBuilder.getParams()._include as string[];
      const clonedIncludes = cloned.getParams()._include as string[];
      
      expect(originalIncludes).toHaveLength(1);
      expect(clonedIncludes).toHaveLength(2);
      expect(originalIncludes).not.toBe(clonedIncludes);
    });
  });

  describe('Method chaining', () => {
    it('should support fluent interface chaining', () => {
      const result = queryBuilder
        .where('family', 'Smith')
        .where('gender', 'male')
        .limit(10)
        .sort('birthdate', 'desc')
        .include('Patient:organization')
        .offset(20)
        .summary('text')
        .elements(['id', 'name']);

      expect(result).toBe(queryBuilder);
      
      const params = queryBuilder.getParams();
      expect(params.family).toBe('Smith');
      expect(params.gender).toBe('male');
      expect(params._count).toBe(10);
      expect(params._sort).toBe('-birthdate');
      expect(params._include).toEqual(['Patient:organization']);
      expect(params._offset).toBe(20);
      expect(params._summary).toBe('text');
      expect(params._elements).toEqual(['id', 'name']);
    });
  });

  describe('Complex query scenarios', () => {
    it('should handle complex multi-field queries', () => {
      queryBuilder
        .where('family', 'Smith')
        .where('family', 'Johnson') // OR logic
        .where('given', 'John')
        .where('gender', 'male')
        .where('active', 'true')
        .limit(50)
        .sort('family')
        .sort('given')
        .include('Patient:organization')
        .include('Patient:general-practitioner');

      const params = queryBuilder.getParams();
      expect(params.family).toBe('Smith,Johnson');
      expect(params.given).toBe('John');
      expect(params.gender).toBe('male');
      expect(params.active).toBe('true');
      expect(params._count).toBe(50);
      expect(params._sort).toBe('family,given');
      expect(params._include).toEqual(['Patient:organization', 'Patient:general-practitioner']);
    });

    it('should handle date range queries', () => {
      queryBuilder
        .where('birthdate', '1990-01-01')
        .where('_lastUpdated', '2023-01-01');

      const params = queryBuilder.getParams();
      expect(params.birthdate).toBe('1990-01-01');
      expect(params._lastUpdated).toBe('2023-01-01');
    });
  });
});