/**
 * Error handling classes and utilities
 *
 * This file will contain structured error types for the FHIR Patient API.
 */

// Placeholder for error classes - will be implemented in task 7
export abstract class FHIRError extends Error {
  abstract readonly code: string;
}
