/**
 * Comprehensive test utilities for FHIR Patient API testing
 */

import { Patient, Bundle, OperationOutcome, PatientSearchParams } from '../types';

/**
 * Mock FHIR server responses
 */
export class MockFHIRServer {
  private patients: Patient[] = [];
  private requestCount = 0;
  private errorRate = 0;
  private latency = 0;

  constructor() {
    this.generateMockPatients();
  }

  /**
   * Set error rate for testing resilience
   */
  setErrorRate(rate: number): void {
    this.errorRate = Math.max(0, Math.min(1, rate));
  }

  /**
   * Set artificial latency for performance testing
   */
  setLatency(ms: number): void {
    this.latency = Math.max(0, ms);
  }

  /**
   * Simulate patient search
   */
  async searchPatients(params: PatientSearchParams): Promise<Bundle<Patient>> {
    this.requestCount++;
    
    if (this.latency > 0) {
      await new Promise(resolve => setTimeout(resolve, this.latency));
    }

    if (Math.random() < this.errorRate) {
      throw new Error('Mock server error');
    }

    let filteredPatients = [...this.patients];

    // Apply filters
    if (params.family) {
      const families = params.family.split(',');
      filteredPatients = filteredPatients.filter(p => 
        p.name?.some(name => 
          families.some(family => 
            name.family?.toLowerCase().includes(family.toLowerCase())
          )
        )
      );
    }

    if (params.given) {
      const givens = params.given.split(',');
      filteredPatients = filteredPatients.filter(p =>
        p.name?.some(name =>
          name.given?.some(given =>
            givens.some(g => given.toLowerCase().includes(g.toLowerCase()))
          )
        )
      );
    }

    if (params.gender) {
      filteredPatients = filteredPatients.filter(p => p.gender === params.gender);
    }

    if (params.active !== undefined) {
      const isActive = params.active === 'true' || params.active === true;
      filteredPatients = filteredPatients.filter(p => p.active === isActive);
    }

    // Apply pagination
    const offset = params._offset || 0;
    const count = params._count || 20;
    const paginatedPatients = filteredPatients.slice(offset, offset + count);

    return {
      resourceType: 'Bundle',
      type: 'searchset',
      total: filteredPatients.length,
      entry: paginatedPatients.map(patient => ({ resource: patient }))
    };
  }

  /**
   * Get patient by ID
   */
  async getPatientById(id: string): Promise<Patient> {
    this.requestCount++;
    
    if (this.latency > 0) {
      await new Promise(resolve => setTimeout(resolve, this.latency));
    }

    if (Math.random() < this.errorRate) {
      throw new Error('Mock server error');
    }

    const patient = this.patients.find(p => p.id === id);
    if (!patient) {
      const outcome: OperationOutcome = {
        resourceType: 'OperationOutcome',
        issue: [{
          severity: 'error',
          code: 'not-found',
          diagnostics: `Patient with id ${id} not found`
        }]
      };
      throw new Error(JSON.stringify(outcome));
    }

    return patient;
  }

  /**
   * Get request statistics
   */
  getStats() {
    return {
      requestCount: this.requestCount,
      errorRate: this.errorRate,
      latency: this.latency
    };
  }

  /**
   * Reset server state
   */
  reset(): void {
    this.requestCount = 0;
    this.errorRate = 0;
    this.latency = 0;
    this.generateMockPatients();
  }

  /**
   * Generate mock patient data
   */
  private generateMockPatients(): void {
    this.patients = [
      this.createPatient('patient-1', 'Smith', 'John', 'male', true),
      this.createPatient('patient-2', 'Johnson', 'Jane', 'female', true),
      this.createPatient('patient-3', 'Brown', 'Bob', 'male', false),
      this.createPatient('patient-4', 'Davis', 'Alice', 'female', true),
      this.createPatient('patient-5', 'Wilson', 'Charlie', 'male', true),
      this.createPatient('patient-6', 'Miller', 'Diana', 'female', false),
      this.createPatient('patient-7', 'Moore', 'Edward', 'male', true),
      this.createPatient('patient-8', 'Taylor', 'Fiona', 'female', true),
      this.createPatient('patient-9', 'Anderson', 'George', 'male', true),
      this.createPatient('patient-10', 'Thomas', 'Helen', 'female', false),
    ];
  }

  private createPatient(
    id: string, 
    family: string, 
    given: string, 
    gender: 'male' | 'female', 
    active: boolean
  ): Patient {
    return {
      resourceType: 'Patient',
      id,
      active,
      name: [{
        use: 'official',
        family,
        given: [given]
      }],
      gender,
      birthDate: `19${Math.floor(Math.random() * 50) + 50}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
      telecom: [{
        system: 'phone',
        value: `555-${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 9000) + 1000}`,
        use: 'home'
      }],
      address: [{
        use: 'home',
        line: [`${Math.floor(Math.random() * 9999) + 1} Main St`],
        city: 'Anytown',
        state: 'ST',
        postalCode: `${Math.floor(Math.random() * 90000) + 10000}`,
        country: 'US'
      }]
    };
  }
}

/**
 * Performance measurement utilities
 */
export class PerformanceTracker {
  private measurements: Map<string, number[]> = new Map();
  private memoryBaseline: number = 0;

  /**
   * Start memory tracking
   */
  startMemoryTracking(): void {
    if (global.gc) {
      global.gc();
    }
    this.memoryBaseline = process.memoryUsage().heapUsed;
  }

  /**
   * Get memory usage delta
   */
  getMemoryDelta(): number {
    if (global.gc) {
      global.gc();
    }
    return process.memoryUsage().heapUsed - this.memoryBaseline;
  }

  /**
   * Time a function execution
   */
  async timeFunction<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = process.hrtime.bigint();
    try {
      const result = await fn();
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1_000_000; // Convert to milliseconds
      
      if (!this.measurements.has(name)) {
        this.measurements.set(name, []);
      }
      this.measurements.get(name)!.push(duration);
      
      return result;
    } catch (error) {
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1_000_000;
      
      if (!this.measurements.has(name)) {
        this.measurements.set(name, []);
      }
      this.measurements.get(name)!.push(duration);
      
      throw error;
    }
  }

  /**
   * Get performance statistics
   */
  getStats(name: string) {
    const measurements = this.measurements.get(name) || [];
    if (measurements.length === 0) {
      return null;
    }

    const sorted = [...measurements].sort((a, b) => a - b);
    const sum = measurements.reduce((a, b) => a + b, 0);
    
    return {
      count: measurements.length,
      min: Math.min(...measurements),
      max: Math.max(...measurements),
      mean: sum / measurements.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }

  /**
   * Reset all measurements
   */
  reset(): void {
    this.measurements.clear();
    this.memoryBaseline = 0;
  }
}

/**
 * Property-based test generators
 */
export class PropertyGenerators {
  /**
   * Generate random valid patient search parameters
   */
  static generateValidSearchParams(): PatientSearchParams {
    const params: PatientSearchParams = {};
    
    if (Math.random() > 0.5) {
      params.family = this.generateRandomName();
    }
    
    if (Math.random() > 0.5) {
      params.given = this.generateRandomName();
    }
    
    if (Math.random() > 0.5) {
      params.gender = Math.random() > 0.5 ? 'male' : 'female';
    }
    
    if (Math.random() > 0.5) {
      params.active = Math.random() > 0.5 ? 'true' : 'false';
    }
    
    if (Math.random() > 0.5) {
      params._count = Math.floor(Math.random() * 100) + 1;
    }
    
    if (Math.random() > 0.5) {
      params._offset = Math.floor(Math.random() * 1000);
    }
    
    return params;
  }

  /**
   * Generate random invalid patient search parameters
   */
  static generateInvalidSearchParams(): PatientSearchParams {
    const params: PatientSearchParams = {};
    
    // Randomly add invalid parameters
    if (Math.random() > 0.5) {
      params._count = -Math.floor(Math.random() * 100) - 1; // Negative count
    }
    
    if (Math.random() > 0.5) {
      params._offset = -Math.floor(Math.random() * 100) - 1; // Negative offset
    }
    
    if (Math.random() > 0.5) {
      params.gender = 'invalid-gender' as any;
    }
    
    if (Math.random() > 0.5) {
      params.active = 'maybe' as any;
    }
    
    return params;
  }

  /**
   * Generate random patient resource
   */
  static generateRandomPatient(): Patient {
    const id = `patient-${Math.floor(Math.random() * 10000)}`;
    const family = this.generateRandomName();
    const given = this.generateRandomName();
    const gender = Math.random() > 0.5 ? 'male' : 'female';
    const active = Math.random() > 0.5;
    
    return {
      resourceType: 'Patient',
      id,
      active,
      name: [{
        use: 'official',
        family,
        given: [given]
      }],
      gender,
      birthDate: this.generateRandomDate(),
      telecom: [{
        system: 'phone',
        value: this.generateRandomPhone(),
        use: 'home'
      }],
      address: [{
        use: 'home',
        line: [this.generateRandomAddress()],
        city: this.generateRandomCity(),
        state: this.generateRandomState(),
        postalCode: this.generateRandomZip(),
        country: 'US'
      }]
    };
  }

  private static generateRandomName(): string {
    const names = [
      'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
      'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
      'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
      'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson'
    ];
    return names[Math.floor(Math.random() * names.length)]!;
  }

  private static generateRandomDate(): string {
    const year = Math.floor(Math.random() * 50) + 1950;
    const month = Math.floor(Math.random() * 12) + 1;
    const day = Math.floor(Math.random() * 28) + 1;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  private static generateRandomPhone(): string {
    return `555-${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 9000) + 1000}`;
  }

  private static generateRandomAddress(): string {
    return `${Math.floor(Math.random() * 9999) + 1} ${this.generateRandomName()} St`;
  }

  private static generateRandomCity(): string {
    const cities = ['Springfield', 'Franklin', 'Georgetown', 'Madison', 'Washington'];
    return cities[Math.floor(Math.random() * cities.length)]!;
  }

  private static generateRandomState(): string {
    const states = ['CA', 'NY', 'TX', 'FL', 'IL', 'PA', 'OH', 'GA', 'NC', 'MI'];
    return states[Math.floor(Math.random() * states.length)]!;
  }

  private static generateRandomZip(): string {
    return String(Math.floor(Math.random() * 90000) + 10000);
  }
}

/**
 * Test data builders
 */
export class TestDataBuilder {
  /**
   * Create a bundle with specified number of patients
   */
  static createPatientBundle(count: number, total?: number): Bundle<Patient> {
    const patients: Patient[] = [];
    for (let i = 0; i < count; i++) {
      patients.push(PropertyGenerators.generateRandomPatient());
    }

    return {
      resourceType: 'Bundle',
      type: 'searchset',
      total: total || count,
      entry: patients.map(patient => ({ resource: patient }))
    };
  }

  /**
   * Create an operation outcome for errors
   */
  static createOperationOutcome(
    severity: 'error' | 'warning' | 'information',
    code: string,
    diagnostics: string
  ): OperationOutcome {
    return {
      resourceType: 'OperationOutcome',
      issue: [{
        severity,
        code,
        diagnostics
      }]
    };
  }
}