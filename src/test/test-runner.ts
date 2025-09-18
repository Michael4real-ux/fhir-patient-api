/**
 * Comprehensive test runner that orchestrates all testing strategies
 * Provides detailed reporting and analysis of test results
 */

import { execSync } from 'child_process';

interface TestSuite {
  name: string;
  command: string;
  description: string;
  timeout: number;
  critical: boolean;
}

interface TestResult {
  suite: string;
  passed: boolean;
  duration: number;
  coverage?: {
    lines: number;
    branches: number;
    functions: number;
    statements: number;
  };
  error?: string;
}

class ComprehensiveTestRunner {
  private testSuites: TestSuite[] = [
    {
      name: 'Unit Tests',
      command: 'npm run test:unit',
      description: 'High-coverage unit tests with edge case validation',
      timeout: 60000,
      critical: true
    },
    {
      name: 'Integration Tests',
      command: 'npm run test:integration',
      description: 'End-to-end integration tests with real FHIR servers',
      timeout: 120000,
      critical: true
    },
    {
      name: 'Multi-Server Integration',
      command: 'npm run test:multi-server',
      description: 'Compatibility tests across multiple FHIR server implementations',
      timeout: 180000,
      critical: false
    },
    {
      name: 'Performance Tests',
      command: 'npm run test:performance',
      description: 'Load testing and performance validation',
      timeout: 300000,
      critical: false
    },
    {
      name: 'Property-Based Tests',
      command: 'npm run test:property',
      description: 'Automated edge case discovery through property-based testing',
      timeout: 120000,
      critical: false
    }
  ];

  private results: TestResult[] = [];

  async runAllTests(): Promise<void> {
    console.log('🚀 Starting Comprehensive Test Suite');
    console.log('=====================================\n');

    const startTime = Date.now();

    for (const suite of this.testSuites) {
      await this.runTestSuite(suite);
    }

    const totalDuration = Date.now() - startTime;
    this.generateReport(totalDuration);
  }

  private async runTestSuite(suite: TestSuite): Promise<void> {
    console.log(`📋 Running ${suite.name}...`);
    console.log(`   ${suite.description}`);
    
    const startTime = Date.now();
    
    try {
      const output = execSync(suite.command, {
        timeout: suite.timeout,
        encoding: 'utf8',
        stdio: 'pipe'
      });

      const duration = Date.now() - startTime;
      const coverage = this.extractCoverage(output);

      this.results.push({
        suite: suite.name,
        passed: true,
        duration,
        coverage
      });

      console.log(`   ✅ Passed (${duration}ms)`);
      if (coverage) {
        console.log(`   📊 Coverage: ${coverage.lines}% lines, ${coverage.branches}% branches`);
      }

    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      this.results.push({
        suite: suite.name,
        passed: false,
        duration,
        error: error.message
      });

      console.log(`   ❌ Failed (${duration}ms)`);
      if (suite.critical) {
        console.log(`   🚨 Critical test suite failed!`);
      }
    }

    console.log('');
  }

  private extractCoverage(output: string): TestResult['coverage'] | undefined {
    // Extract coverage information from Jest output
    const coverageMatch = output.match(/All files\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)/);
    
    if (coverageMatch && coverageMatch.length >= 5) {
      return {
        statements: parseFloat(coverageMatch[1]!),
        branches: parseFloat(coverageMatch[2]!),
        functions: parseFloat(coverageMatch[3]!),
        lines: parseFloat(coverageMatch[4]!)
      };
    }

    return undefined;
  }

  private generateReport(totalDuration: number): void {
    console.log('📊 Test Results Summary');
    console.log('=======================\n');

    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => r.passed === false).length;
    const criticalFailed = this.results.filter(r => !r.passed && 
      this.testSuites.find(s => s.name === r.suite)?.critical).length;

    console.log(`Total Suites: ${this.results.length}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Critical Failures: ${criticalFailed}`);
    console.log(`Total Duration: ${totalDuration}ms\n`);

    // Detailed results
    this.results.forEach(result => {
      const suite = this.testSuites.find(s => s.name === result.suite);
      const status = result.passed ? '✅' : '❌';
      const critical = suite?.critical ? '🚨' : '';
      
      console.log(`${status} ${result.suite} ${critical}`);
      console.log(`   Duration: ${result.duration}ms`);
      
      if (result.coverage) {
        console.log(`   Coverage: Lines ${result.coverage.lines}%, Branches ${result.coverage.branches}%`);
      }
      
      if (result.error) {
        console.log(`   Error: ${result.error.substring(0, 100)}...`);
      }
      
      console.log('');
    });

    // Coverage summary
    const coverageResults = this.results.filter(r => r.coverage);
    if (coverageResults.length > 0) {
      const avgLines = coverageResults.reduce((sum, r) => sum + r.coverage!.lines, 0) / coverageResults.length;
      const avgBranches = coverageResults.reduce((sum, r) => sum + r.coverage!.branches, 0) / coverageResults.length;
      
      console.log('📈 Coverage Summary');
      console.log('==================');
      console.log(`Average Line Coverage: ${avgLines.toFixed(1)}%`);
      console.log(`Average Branch Coverage: ${avgBranches.toFixed(1)}%\n`);
    }

    // Performance summary
    const performanceResult = this.results.find(r => r.suite === 'Performance Tests');
    if (performanceResult) {
      console.log('⚡ Performance Summary');
      console.log('====================');
      console.log(`Performance Test Duration: ${performanceResult.duration}ms`);
      console.log(`Status: ${performanceResult.passed ? 'Passed' : 'Failed'}\n`);
    }

    // Final assessment
    console.log('🎯 Final Assessment');
    console.log('==================');
    
    if (criticalFailed > 0) {
      console.log('❌ CRITICAL TESTS FAILED - Build should not proceed');
      process.exit(1);
    } else if (failed > 0) {
      console.log('⚠️  Some non-critical tests failed - Review recommended');
      process.exit(0);
    } else {
      console.log('✅ All tests passed - Ready for production');
      process.exit(0);
    }
  }

  async runContinuousIntegration(): Promise<void> {
    console.log('🔄 Running CI Test Suite (Critical Tests Only)');
    console.log('===============================================\n');

    const criticalSuites = this.testSuites.filter(s => s.critical);
    const startTime = Date.now();

    for (const suite of criticalSuites) {
      await this.runTestSuite(suite);
    }

    const totalDuration = Date.now() - startTime;
    const criticalFailed = this.results.filter(r => !r.passed).length;

    console.log(`CI Test Duration: ${totalDuration}ms`);
    console.log(`Critical Failures: ${criticalFailed}`);

    if (criticalFailed > 0) {
      console.log('❌ CI Tests Failed');
      process.exit(1);
    } else {
      console.log('✅ CI Tests Passed');
      process.exit(0);
    }
  }
}

// CLI interface
if (require.main === module) {
  const runner = new ComprehensiveTestRunner();
  const mode = process.argv[2] || 'full';

  if (mode === 'ci') {
    runner.runContinuousIntegration().catch(console.error);
  } else {
    runner.runAllTests().catch(console.error);
  }
}

export { ComprehensiveTestRunner };