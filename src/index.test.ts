/**
 * Basic tests for the main entry point
 */

import { VERSION } from './index';

describe('FHIR Patient API', () => {
  it('should export version information', () => {
    expect(VERSION).toBe('1.0.0');
  });

  it('should have proper module structure', () => {
    // This test ensures our module exports are working
    expect(typeof VERSION).toBe('string');
  });
});