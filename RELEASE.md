# Release Guide

This document outlines the process for preparing and publishing releases of the FHIR Patient API.

## Pre-Release Checklist

Before creating a release, ensure all the following items are completed:

### Code Quality
- [ ] All tests are passing (`npm test`)
- [ ] Code coverage meets requirements (`npm run test:coverage`)
- [ ] Linting passes without errors (`npm run lint`)
- [ ] TypeScript compilation succeeds (`npm run typecheck`)

### Documentation
- [ ] README.md is up to date
- [ ] API documentation is current (`docs/API.md`)
- [ ] CHANGELOG.md includes all changes
- [ ] Examples are working and documented

### Package Configuration
- [ ] Version number is updated in `package.json`
- [ ] Dependencies are up to date and secure
- [ ] Package exports are correctly configured
- [ ] Bundle sizes are within limits (< 50KB)

## Release Process

### 1. Prepare the Release

Run the automated release preparation script:

```bash
npm run release:prepare
```

This script will:
- Clean and rebuild the distribution files
- Validate package structure
- Check bundle sizes
- Run comprehensive tests
- Validate package.json configuration
- Test package publication

### 2. Manual Validation

After the automated checks pass, manually verify:

#### Distribution Files
Check that all required files are present in `dist/`:
- `index.js` (CommonJS build)
- `index.mjs` (ESM build) 
- `index.d.ts` (CommonJS TypeScript declarations)
- `index.d.mts` (ESM TypeScript declarations)
- Source maps for debugging

#### Package Exports
Verify the package can be imported correctly:

```javascript
// CommonJS
const { FHIRClient } = require('fhir-patient-api');

// ESM
import { FHIRClient } from 'fhir-patient-api';

// TypeScript
import { FHIRClient, Patient } from 'fhir-patient-api';
```

#### Tree Shaking
Ensure individual exports work for tree shaking:

```javascript
// Should only bundle the FHIRClient, not the entire library
import { FHIRClient } from 'fhir-patient-api';
```

### 3. Version Management

Update version numbers following [Semantic Versioning](https://semver.org/):

- **Patch** (1.0.1): Bug fixes, documentation updates
- **Minor** (1.1.0): New features, backward compatible
- **Major** (2.0.0): Breaking changes

```bash
# Update version
npm version patch|minor|major

# Or manually update package.json and create git tag
git tag v1.0.1
```

### 4. Final Testing

Run the complete test suite one more time:

```bash
# Run all tests including integration tests
npm run test

# Test the built package
npm run test:integration

# Validate distribution
npm run test -- --testPathPattern=distribution
```

### 5. Publish

#### Dry Run
Always do a dry run first:

```bash
npm run release:dry
```

#### Actual Publication
If the dry run succeeds:

```bash
npm publish
```

#### Post-Publication
After publishing:
- Verify the package appears on npm
- Test installation: `npm install fhir-patient-api`
- Update GitHub releases with changelog
- Announce the release

## Bundle Optimization

The package is optimized for:

### Tree Shaking
- `sideEffects: false` in package.json
- Individual named exports
- External dependencies not bundled

### Multiple Module Systems
- CommonJS build (`index.js`)
- ESM build (`index.mjs`)
- Proper TypeScript declarations for both

### Size Optimization
- Production builds are minified
- External dependencies (axios, jsonwebtoken) are not bundled
- Bundle size limits enforced (< 50KB)

## Troubleshooting

### Build Failures
If the build fails:
1. Check TypeScript errors: `npm run typecheck`
2. Verify all imports are correct
3. Ensure external dependencies are properly declared

### Size Limit Exceeded
If bundle size exceeds limits:
1. Check for accidentally bundled dependencies
2. Review imports for unnecessary code
3. Consider code splitting for large features

### Publication Errors
If publication fails:
1. Verify npm authentication: `npm whoami`
2. Check package name availability
3. Ensure version number is unique
4. Validate package.json format

### Import Issues
If imports don't work after publication:
1. Verify exports configuration in package.json
2. Test both CommonJS and ESM imports
3. Check TypeScript declaration files
4. Validate file paths in exports

## Rollback Procedure

If a release has critical issues:

1. **Immediate**: Deprecate the problematic version
   ```bash
   npm deprecate fhir-patient-api@1.0.1 "Critical bug, use 1.0.0 instead"
   ```

2. **Fix**: Create a patch release with fixes
   ```bash
   # Fix the issue, then:
   npm version patch
   npm publish
   ```

3. **Communicate**: Update documentation and notify users

## Automation

Consider setting up GitHub Actions for automated releases:
- Trigger on version tags
- Run full test suite
- Build and publish automatically
- Create GitHub releases with changelogs

This ensures consistent release quality and reduces manual errors.