/**
 * Jest test setup configuration
 *
 * This file contains global test setup and configuration.
 */

// Global test timeout
jest.setTimeout(10000);

// Mock console methods in tests to reduce noise
global.console = {
  ...console,
  // Uncomment to suppress console.log in tests
  // log: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};

// Export empty object to make this a module
export {};
