#!/usr/bin/env bun

/**
 * Run All j8s Effect Examples
 *
 * This script runs all the Effect integration examples in sequence.
 */

import { basicEffectExample, errorHandlingExample } from "./basic-effect-service";
import {
  retryPatternExample,
  timeoutExample,
  concurrentExample,
  dependencyExample,
  resourceManagementExample
} from "./advanced-effect-patterns";
import {
  servicePipelineExample,
  eventDrivenExample,
  streamOrchestrationExample,
  microserviceArchitectureExample
} from "./effect-orchestration";

async function runAllExamples() {
  console.log("🌟 Running All j8s Effect Integration Examples\n");
  console.log("=" .repeat(60));

  const examples = [
    { name: "Basic Effect Service", fn: basicEffectExample },
    { name: "Error Handling", fn: errorHandlingExample },
    { name: "Retry Patterns", fn: retryPatternExample },
    { name: "Timeout Handling", fn: timeoutExample },
    { name: "Concurrent Operations", fn: concurrentExample },
    { name: "Dependency Management", fn: dependencyExample },
    { name: "Resource Management", fn: resourceManagementExample },
    { name: "Service Pipeline", fn: servicePipelineExample },
    { name: "Event-Driven Coordination", fn: eventDrivenExample },
    { name: "Stream Orchestration", fn: streamOrchestrationExample },
    { name: "Microservice Architecture", fn: microserviceArchitectureExample },
  ];

  for (let i = 0; i < examples.length; i++) {
    const example = examples[i];
    if (!example) continue;
    const { name, fn } = example;
    console.log(`\n\n📍 [${i + 1}/${examples.length}] ${name}`);
    console.log("-".repeat(40));

    try {
      await fn();
      console.log(`✅ ${name} completed successfully`);
    } catch (error) {
      console.error(`❌ ${name} failed:`, error);
    }

    if (i < examples.length - 1) {
      console.log("\n⏳ Waiting before next example...");
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log("\n\n🎉 All j8s Effect examples completed!");
  console.log("=" .repeat(60));
  console.log("\n💡 Try modifying the examples to explore more patterns!");
  console.log("📚 Check the README.md for detailed explanations.");
}

if (import.meta.main) {
  await runAllExamples();
}

export { runAllExamples };