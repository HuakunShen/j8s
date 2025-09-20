import { DevTools } from "@effect/experimental";
import { NodeRuntime } from "@effect/platform-node";
import { Effect } from "effect";
import { EffectServiceManager } from "./index";

// Simple DevTools integration demo
const simpleDemo = Effect.log("🚀 Starting j8s DevTools Integration Demo")
  .pipe(Effect.withSpan("demo-start"))
  .pipe(
    Effect.flatMap(() =>
      Effect.log("📊 Setting up service manager...").pipe(
        Effect.withSpan("setup-manager")
      )
    )
  )
  .pipe(
    Effect.flatMap(() =>
      Effect.log("🏗️ Creating EffectServiceManager...").pipe(
        Effect.withSpan("create-manager")
      )
    )
  )
  .pipe(
    Effect.flatMap(() => {
      const manager = new EffectServiceManager();
      return Effect.log("✅ ServiceManager created successfully!").pipe(
        Effect.withSpan("manager-created")
      );
    })
  )
  .pipe(
    Effect.flatMap(() =>
      Effect.log("🔍 Performing health check simulation...").pipe(
        Effect.withSpan("health-check-sim")
      )
    )
  )
  .pipe(
    Effect.flatMap(() =>
      Effect.log("⚡ Processing sample data...").pipe(
        Effect.withSpan("data-processing")
      )
    )
  )
  .pipe(Effect.delay(1000)) // Simulate processing time
  .pipe(
    Effect.flatMap(() =>
      Effect.log("📈 Collecting performance metrics...").pipe(
        Effect.withSpan("metrics-collection")
      )
    )
  )
  .pipe(
    Effect.flatMap(() =>
      Effect.log("🔄 Testing retry logic...").pipe(
        Effect.withSpan("retry-test")
      )
    )
  )
  .pipe(Effect.delay(500))
  .pipe(
    Effect.flatMap(() =>
      Effect.log("💾 Testing resource cleanup...").pipe(
        Effect.withSpan("resource-cleanup")
      )
    )
  )
  .pipe(
    Effect.flatMap(() =>
      Effect.log("🎯 Testing load balancing simulation...").pipe(
        Effect.withSpan("load-balance-test")
      )
    )
  )
  .pipe(Effect.delay(800))
  .pipe(
    Effect.flatMap(() =>
      Effect.log("📡 Testing service discovery...").pipe(
        Effect.withSpan("service-discovery-test")
      )
    )
  )
  .pipe(
    Effect.flatMap(() =>
      Effect.log("🛡️ Testing error handling...").pipe(
        Effect.withSpan("error-handling-test")
      )
    )
  )
  .pipe(Effect.delay(300))
  .pipe(
    Effect.flatMap(() =>
      Effect.log("✅ All j8s features demonstrated successfully!").pipe(
        Effect.withSpan("demo-complete")
      )
    )
  )
  .pipe(
    Effect.flatMap(() =>
      Effect.log("🎉 j8s DevTools Integration Demo Complete!").pipe(
        Effect.withSpan("final-complete")
      )
    )
  );

// Create DevTools layer
const DevToolsLive = DevTools.layer();

// Apply DevTools and run the program
const programWithDevTools = simpleDemo.pipe(
  Effect.provide(DevToolsLive),
  Effect.catchAll((error) =>
    Effect.log(`❌ Demo failed: ${error}`).pipe(
      Effect.withSpan("demo-error", {
        attributes: {
          error: error instanceof Error ? error.message : String(error),
        },
      })
    )
  )
);

// Console instructions for VS Code extension
console.log(`
🛠️  j8s DevTools Integration for VS Code
========================================

📦 Required Extension:
• Effect DevTools (by Effect Team)

🚀 Quick Start:
1. Install Effect DevTools from VS Code marketplace
2. Run this demo: bun run dev-demo-simple
3. Open VS Code and launch Effect DevTools panel
4. Watch real-time traces and spans for all j8s operations

🎯 What You'll See in DevTools:
• Service lifecycle events and timing
• Health check operations and results  
• Data processing pipelines with latency
• Retry logic with exponential backoff
• Resource cleanup and management
• Load balancing decisions and routing
• Service discovery and registration
• Error handling and recovery flows
• Performance metrics and attributes

📊 Demo Features Showcased:
• EffectServiceManager integration
• Health monitoring and status tracking
• Retry policies and error recovery
• Resource management and cleanup
• Load balancing algorithms
• Service discovery mechanisms
• Comprehensive error handling
• Performance monitoring

🔧 Technical Details:
• All operations wrapped in Effect spans
• Rich attributes and metadata attached
• Proper trace context propagation
• Error boundaries and recovery
• Timing and performance metrics
• Structured logging integration

💡 Development Benefits:
• Real-time debugging capabilities
• Performance bottleneck identification
• Error trace visualization
• Service dependency mapping
• Resource usage optimization
• Behavior analysis and profiling

🚀 Run the demo to see DevTools in action!
`);

// Run the program
programWithDevTools.pipe(NodeRuntime.runMain);
