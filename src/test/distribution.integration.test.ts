/**
 * Distribution Integration Tests
 * 
 * Tests to validate the package distribution and ensure all exports work correctly
 * across different module systems (CommonJS and ESM).
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import * as path from 'path';
import * as fs from 'fs';

describe('Distribution Package Tests', () => {
    const distPath = path.join(__dirname, '../../dist');

    beforeAll(() => {
        // Ensure dist directory exists
        if (!fs.existsSync(distPath)) {
            throw new Error('Distribution files not found. Run "npm run build" first.');
        }
    });

    describe('Package Structure', () => {
        it('should have all required distribution files', () => {
            const requiredFiles = [
                'index.js',      // CommonJS build
                'index.mjs',     // ESM build
                'index.d.ts',    // TypeScript declarations for CommonJS
                'index.d.mts'    // TypeScript declarations for ESM
            ];

            requiredFiles.forEach(file => {
                const filePath = path.join(distPath, file);
                expect(fs.existsSync(filePath)).toBe(true);
            });
        });

        it('should have source maps for debugging', () => {
            const sourceMapFiles = [
                'index.js.map',
                'index.mjs.map'
            ];

            sourceMapFiles.forEach(file => {
                const filePath = path.join(distPath, file);
                expect(fs.existsSync(filePath)).toBe(true);
            });
        });
    });

    describe('CommonJS Build', () => {
        it('should export all required modules in CommonJS format', () => {
            const cjsPath = path.join(distPath, 'index.js');
            const content = fs.readFileSync(cjsPath, 'utf-8');

            // Check for CommonJS exports (modern bundlers may use different patterns)
            expect(content).toMatch(/exports\.|module\.exports|exports\[/);
        });

        it('should have valid TypeScript declarations for CommonJS', () => {
            const dtsPath = path.join(distPath, 'index.d.ts');
            const content = fs.readFileSync(dtsPath, 'utf-8');

            // Check for key exports (they may be in different formats)
            expect(content).toMatch(/declare class FHIRClient|export.*FHIRClient/);
            expect(content).toMatch(/declare class PatientQueryBuilder|export.*PatientQueryBuilder/);
            expect(content).toMatch(/declare function createFHIRClient|export.*createFHIRClient/);
        });
    });

    describe('ESM Build', () => {
        it('should export all required modules in ESM format', () => {
            const esmPath = path.join(distPath, 'index.mjs');
            const content = fs.readFileSync(esmPath, 'utf-8');

            // Check for ESM exports
            expect(content).toContain('export {');
            expect(content).not.toContain('module.exports');
        });

        it('should have valid TypeScript declarations for ESM', () => {
            const dtsPath = path.join(distPath, 'index.d.mts');
            const content = fs.readFileSync(dtsPath, 'utf-8');

            // Check for key exports (they may be in different formats)
            expect(content).toMatch(/declare class FHIRClient|export.*FHIRClient/);
            expect(content).toMatch(/declare class PatientQueryBuilder|export.*PatientQueryBuilder/);
            expect(content).toMatch(/declare function createFHIRClient|export.*createFHIRClient/);
        });
    });

    describe('Tree Shaking Support', () => {
        it('should have individual exports for tree shaking', () => {
            const esmPath = path.join(distPath, 'index.mjs');
            const content = fs.readFileSync(esmPath, 'utf-8');

            // Should have named exports rather than default export only
            expect(content).toContain('export {');

            // Should not have large bundled code that prevents tree shaking
            expect(content.length).toBeLessThan(100000); // Reasonable size limit
        });
    });

    describe('External Dependencies', () => {
        it('should not bundle external dependencies', () => {
            const esmPath = path.join(distPath, 'index.mjs');
            const cjsPath = path.join(distPath, 'index.js');

            const esmContent = fs.readFileSync(esmPath, 'utf-8');
            const cjsContent = fs.readFileSync(cjsPath, 'utf-8');

            // Should import/require external deps, not bundle them
            expect(esmContent).toContain('axios');
            expect(cjsContent).toContain('axios');

            // Should not contain the actual axios source code
            expect(esmContent).not.toContain('axios/lib/axios');
            expect(cjsContent).not.toContain('axios/lib/axios');
        });
    });

    describe('Package.json Validation', () => {
        it('should have correct exports configuration', () => {
            const packagePath = path.join(__dirname, '../../package.json');
            const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));

            expect(packageJson.exports).toBeDefined();
            expect(packageJson.exports['.']).toBeDefined();
            expect(packageJson.exports['.'].import).toBeDefined();
            expect(packageJson.exports['.'].require).toBeDefined();
            expect(packageJson.sideEffects).toBe(false);
        });

        it('should include all necessary files for distribution', () => {
            const packagePath = path.join(__dirname, '../../package.json');
            const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));

            expect(packageJson.files).toContain('dist');
            expect(packageJson.files).toContain('README.md');
            expect(packageJson.files).toContain('LICENSE');
            expect(packageJson.files).toContain('docs');
        });
    });

    describe('Bundle Size Validation', () => {
        it('should meet size requirements for CommonJS build', () => {
            const cjsPath = path.join(distPath, 'index.js');
            const stats = fs.statSync(cjsPath);
            const sizeInKB = stats.size / 1024;

            // Should be under 100KB as configured in bundlesize
            expect(sizeInKB).toBeLessThan(100);
        });

        it('should meet size requirements for ESM build', () => {
            const esmPath = path.join(distPath, 'index.mjs');
            const stats = fs.statSync(esmPath);
            const sizeInKB = stats.size / 1024;

            // Should be under 100KB as configured in bundlesize
            expect(sizeInKB).toBeLessThan(100);
        });
    });
});

describe('Runtime Import Tests', () => {
    describe('All Exports Available', () => {
        it('should export all core classes and functions', async () => {
            // Import from the source (since we're testing the source structure)
            const {
                FHIRClient,
                PatientQueryBuilder,
                createFHIRClient,
                getPatients,
                getPatientById,
                searchPatients,
                VERSION
            } = await import('../index');

            expect(FHIRClient).toBeDefined();
            expect(PatientQueryBuilder).toBeDefined();
            expect(createFHIRClient).toBeDefined();
            expect(getPatients).toBeDefined();
            expect(getPatientById).toBeDefined();
            expect(searchPatients).toBeDefined();
            expect(VERSION).toBeDefined();
        });

        it('should export all type definitions', async () => {
            const types = await import('../types');

            // Check that key type interfaces are available (they exist as types, not runtime values)
            // We can verify the module exports the type checking functions
            expect(types.isPatient).toBeDefined();
            expect(types.isBundle).toBeDefined();
            expect(types.isOperationOutcome).toBeDefined();
            expect(types.PATIENT_SEARCH_PARAMETERS).toBeDefined();
        });

        it('should export extensibility framework', async () => {
            const extensibility = await import('../extensibility');

            expect(extensibility.BaseResourceQueryBuilder).toBeDefined();
            expect(extensibility.PluginManager).toBeDefined();
            expect(extensibility.ResourceFactory).toBeDefined();
        });
    });

    describe('Functional Validation', () => {
        it('should create FHIR client instances', async () => {
            const { createFHIRClient } = await import('../index');

            const client = createFHIRClient({
                baseUrl: 'https://hapi.fhir.org/baseR4',
                timeout: 5000
            });

            expect(client).toBeDefined();
            expect(typeof client.getPatients).toBe('function');
            expect(typeof client.getPatientById).toBe('function');
        });

        it('should create query builders', async () => {
            const { FHIRClient } = await import('../index');

            const client = new FHIRClient({
                baseUrl: 'https://hapi.fhir.org/baseR4',
                timeout: 5000
            });

            const queryBuilder = client.patients();
            expect(queryBuilder).toBeDefined();
            expect(typeof queryBuilder.where).toBe('function');
            expect(typeof queryBuilder.limit).toBe('function');
        });
    });
});