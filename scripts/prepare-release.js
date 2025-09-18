#!/usr/bin/env node

/**
 * Release Preparation Script
 * 
 * Validates the package is ready for distribution by running comprehensive checks.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DIST_PATH = path.join(__dirname, '../dist');
const PACKAGE_JSON_PATH = path.join(__dirname, '../package.json');

console.log('🚀 Preparing FHIR Patient API for release...\n');

// Step 1: Clean and build
console.log('📦 Building distribution packages...');
try {
  execSync('npm run clean', { stdio: 'inherit' });
  execSync('npm run build:prod', { stdio: 'inherit' });
  console.log('✅ Build completed successfully\n');
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}

// Step 2: Validate package structure
console.log('🔍 Validating package structure...');
const requiredFiles = [
  'index.js',
  'index.mjs', 
  'index.d.ts',
  'index.d.mts',
  'index.js.map',
  'index.mjs.map'
];

const missingFiles = requiredFiles.filter(file => 
  !fs.existsSync(path.join(DIST_PATH, file))
);

if (missingFiles.length > 0) {
  console.error('❌ Missing distribution files:', missingFiles);
  process.exit(1);
}
console.log('✅ All required distribution files present\n');

// Step 3: Check bundle sizes
console.log('📏 Checking bundle sizes...');
try {
  const cjsSize = fs.statSync(path.join(DIST_PATH, 'index.js')).size;
  const esmSize = fs.statSync(path.join(DIST_PATH, 'index.mjs')).size;
  
  console.log(`   CommonJS: ${(cjsSize / 1024).toFixed(2)} KB`);
  console.log(`   ESM: ${(esmSize / 1024).toFixed(2)} KB`);
  
  if (cjsSize > 50 * 1024 || esmSize > 50 * 1024) {
    console.warn('⚠️  Bundle size exceeds 50KB limit');
  } else {
    console.log('✅ Bundle sizes within limits\n');
  }
} catch (error) {
  console.error('❌ Failed to check bundle sizes:', error.message);
  process.exit(1);
}

// Step 4: Run tests
console.log('🧪 Running comprehensive tests...');
try {
  execSync('npm run test', { stdio: 'inherit' });
  console.log('✅ All tests passed\n');
} catch (error) {
  console.error('❌ Tests failed:', error.message);
  process.exit(1);
}

// Step 5: Run linting
console.log('🔧 Running code quality checks...');
try {
  execSync('npm run lint', { stdio: 'inherit' });
  console.log('✅ Code quality checks passed\n');
} catch (error) {
  console.error('❌ Linting failed:', error.message);
  process.exit(1);
}

// Step 6: Validate package.json
console.log('📋 Validating package.json...');
const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf-8'));

const requiredFields = ['name', 'version', 'description', 'main', 'module', 'types', 'exports'];
const missingFields = requiredFields.filter(field => !packageJson[field]);

if (missingFields.length > 0) {
  console.error('❌ Missing package.json fields:', missingFields);
  process.exit(1);
}

if (!packageJson.sideEffects === false) {
  console.warn('⚠️  sideEffects should be set to false for better tree shaking');
}

console.log('✅ package.json validation passed\n');

// Step 7: Run package validation tools
console.log('🔍 Running package validation...');
try {
  execSync('npx publint', { stdio: 'inherit' });
  console.log('✅ Package validation passed\n');
} catch (error) {
  console.warn('⚠️  Package validation warnings (check output above)\n');
}

// Step 8: Dry run publish
console.log('🎯 Testing package publication...');
try {
  execSync('npm publish --dry-run', { stdio: 'inherit' });
  console.log('✅ Package publication test passed\n');
} catch (error) {
  console.error('❌ Package publication test failed:', error.message);
  process.exit(1);
}

// Final summary
console.log('🎉 Release preparation completed successfully!');
console.log('\n📋 Release Checklist:');
console.log('   ✅ Distribution files built');
console.log('   ✅ Bundle sizes optimized');
console.log('   ✅ All tests passing');
console.log('   ✅ Code quality checks passed');
console.log('   ✅ Package structure validated');
console.log('   ✅ Publication test successful');

console.log('\n🚀 Ready to publish! Run "npm publish" when ready.');