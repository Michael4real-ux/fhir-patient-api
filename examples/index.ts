/**
 * FHIR Patient API - Examples Index
 * 
 * This file provides a central entry point for all examples and allows
 * running them individually or all together.
 */

import { runBasicUsageExample } from './basic-usage-example';
import { runAdvancedQueriesExample } from './advanced-queries-example';
import { runCachingPerformanceExample } from './caching-performance-example';
import { runExtensibilityExample } from './extensibility-examples';
import { runErrorHandlingExample } from './error-handling-example';
import { runAuthenticationExample } from './authentication-example';

interface ExampleInfo {
  name: string;
  description: string;
  runFunction: () => Promise<void>;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  topics: string[];
}

const examples: ExampleInfo[] = [
  {
    name: 'Basic Usage',
    description: 'Fundamental features including client initialization, simple queries, and basic error handling',
    runFunction: runBasicUsageExample,
    difficulty: 'beginner',
    topics: ['client-setup', 'simple-queries', 'pagination', 'error-handling']
  },
  {
    name: 'Advanced Queries',
    description: 'Complex search parameters, includes, sorting, streaming, and raw queries',
    runFunction: runAdvancedQueriesExample,
    difficulty: 'intermediate',
    topics: ['complex-queries', 'search-parameters', 'streaming', 'performance']
  },
  {
    name: 'Caching & Performance',
    description: 'Caching strategies, performance optimization, and benchmarking',
    runFunction: runCachingPerformanceExample,
    difficulty: 'intermediate',
    topics: ['caching', 'performance', 'optimization', 'benchmarking']
  },
  {
    name: 'Extensibility',
    description: 'Adding new resource types, creating plugins, and extending functionality',
    runFunction: runExtensibilityExample,
    difficulty: 'advanced',
    topics: ['extensibility', 'plugins', 'custom-resources', 'middleware']
  },
  {
    name: 'Error Handling',
    description: 'Comprehensive error handling, retry mechanisms, and resilience patterns',
    runFunction: runErrorHandlingExample,
    difficulty: 'intermediate',
    topics: ['error-handling', 'retry-logic', 'circuit-breaker', 'resilience']
  },
  {
    name: 'Authentication',
    description: 'Various authentication methods including Bearer tokens, OAuth 2.0, and custom auth',
    runFunction: runAuthenticationExample,
    difficulty: 'intermediate',
    topics: ['authentication', 'oauth2', 'bearer-tokens', 'multi-tenant']
  }
];

async function runAllExamples(): Promise<void> {
  console.log('🚀 Running All FHIR Patient API Examples\n');
  console.log('=' .repeat(60));

  for (let i = 0; i < examples.length; i++) {
    const example = examples[i];
    
    console.log(`\n📚 Example ${i + 1}/${examples.length}: ${example.name}`);
    console.log(`📝 ${example.description}`);
    console.log(`🎯 Difficulty: ${example.difficulty}`);
    console.log(`🏷️  Topics: ${example.topics.join(', ')}`);
    console.log('-'.repeat(60));

    try {
      const startTime = Date.now();
      await example.runFunction();
      const duration = Date.now() - startTime;
      console.log(`✅ Example completed in ${duration}ms`);
    } catch (error) {
      console.error(`❌ Example failed: ${error}`);
    }

    if (i < examples.length - 1) {
      console.log('\n' + '='.repeat(60));
      // Small delay between examples
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('🎉 All examples completed!');
}

async function runExampleByName(name: string): Promise<void> {
  const example = examples.find(ex => 
    ex.name.toLowerCase().replace(/\s+/g, '-') === name.toLowerCase() ||
    ex.name.toLowerCase() === name.toLowerCase()
  );

  if (!example) {
    console.error(`❌ Example "${name}" not found.`);
    console.log('\nAvailable examples:');
    examples.forEach((ex, index) => {
      console.log(`  ${index + 1}. ${ex.name} (${ex.difficulty})`);
    });
    return;
  }

  console.log(`🚀 Running Example: ${example.name}\n`);
  console.log(`📝 ${example.description}`);
  console.log(`🎯 Difficulty: ${example.difficulty}`);
  console.log(`🏷️  Topics: ${example.topics.join(', ')}`);
  console.log('-'.repeat(60));

  try {
    const startTime = Date.now();
    await example.runFunction();
    const duration = Date.now() - startTime;
    console.log(`\n✅ Example "${example.name}" completed in ${duration}ms`);
  } catch (error) {
    console.error(`\n❌ Example "${example.name}" failed:`, error);
  }
}

function listExamples(): void {
  console.log('📚 Available FHIR Patient API Examples:\n');

  examples.forEach((example, index) => {
    const difficultyEmoji = {
      beginner: '🟢',
      intermediate: '🟡',
      advanced: '🔴'
    }[example.difficulty];

    console.log(`${index + 1}. ${difficultyEmoji} ${example.name}`);
    console.log(`   ${example.description}`);
    console.log(`   Topics: ${example.topics.join(', ')}`);
    console.log('');
  });

  console.log('Usage:');
  console.log('  npm run examples                    # Run all examples');
  console.log('  npm run examples basic-usage        # Run specific example');
  console.log('  npm run examples list               # List all examples');
}

function showHelp(): void {
  console.log('🚀 FHIR Patient API Examples\n');
  
  console.log('This collection of examples demonstrates various features and capabilities');
  console.log('of the FHIR Patient API library.\n');

  console.log('Commands:');
  console.log('  node examples/index.js              # Run all examples');
  console.log('  node examples/index.js all          # Run all examples');
  console.log('  node examples/index.js list         # List available examples');
  console.log('  node examples/index.js help         # Show this help');
  console.log('  node examples/index.js <name>       # Run specific example\n');

  console.log('Example names:');
  examples.forEach((example, index) => {
    const kebabName = example.name.toLowerCase().replace(/\s+/g, '-');
    console.log(`  ${kebabName.padEnd(20)} # ${example.description}`);
  });

  console.log('\nDifficulty levels:');
  console.log('  🟢 Beginner     - Basic concepts and simple usage');
  console.log('  🟡 Intermediate - More complex features and patterns');
  console.log('  🔴 Advanced     - Complex scenarios and extensibility');
}

// Main execution logic
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0]?.toLowerCase();

  switch (command) {
    case undefined:
    case 'all':
      await runAllExamples();
      break;
    
    case 'list':
      listExamples();
      break;
    
    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;
    
    default:
      await runExampleByName(command);
      break;
  }
}

// Export functions for programmatic use
export {
  examples,
  runAllExamples,
  runExampleByName,
  listExamples,
  showHelp,
  
  // Re-export individual example functions
  runBasicUsageExample,
  runAdvancedQueriesExample,
  runCachingPerformanceExample,
  runExtensibilityExample,
  runErrorHandlingExample,
  runAuthenticationExample
};

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Example execution failed:', error);
    process.exit(1);
  });
}