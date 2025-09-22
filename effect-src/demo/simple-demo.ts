#!/usr/bin/env bun

/**
 * Simple Working Demo of Effect-based j8s with DevTools
 * 
 * This demonstrates the core improvements over the original j8s system
 */

import { DevTools } from "@effect/experimental"
import { NodeRuntime } from "@effect/platform-node"
import { Effect, Duration, Console, Schedule } from "effect"

// Simple demo showcasing Effect features that replace manual j8s implementations
const simpleEffectDemo = Effect.gen(function* () {
  yield* Effect.log("🚀 Effect-based j8s Demo with DevTools!")
  yield* Effect.log("📊 DevTools available at: http://localhost:34437")
  
  // 1. Built-in exponential backoff (replaces manual implementation)
  yield* Effect.log("🔄 Testing built-in exponential backoff...")
  
  const unstableTask = Effect.gen(function* () {
    yield* Effect.log("Attempting unstable task...")
    
    // Simulate task that fails sometimes
    if (Math.random() < 0.6) {
      yield* Effect.fail(new Error("Task failed - will retry automatically"))
    }
    
    yield* Effect.log("✅ Task succeeded!")
    return "success"
  })
  
  // Use Effect's built-in retry with exponential backoff
  yield* unstableTask.pipe(
    Effect.retry(Schedule.exponential(Duration.millis(100), 2.0)),
    Effect.withSpan("exponential-backoff-demo", {
      attributes: { 
        feature: "built-in-retry",
        strategy: "exponential"
      }
    }),
    Effect.catchAll((error) =>
      Effect.log(`⚠️ Task failed after retries: ${error}`)
    )
  )
  
  // 2. Fiber-based concurrency (replaces Promise coordination)
  yield* Effect.log("🧵 Testing fiber-based concurrency...")
  
  const task1 = Effect.gen(function* () {
    yield* Effect.sleep(Duration.millis(800))
    yield* Effect.log("Task 1 completed")
    return "result1"
  }).pipe(Effect.withSpan("concurrent-task-1"))
  
  const task2 = Effect.gen(function* () {
    yield* Effect.sleep(Duration.millis(1200))
    yield* Effect.log("Task 2 completed")
    return "result2"
  }).pipe(Effect.withSpan("concurrent-task-2"))
  
  const task3 = Effect.gen(function* () {
    yield* Effect.sleep(Duration.millis(600))
    yield* Effect.log("Task 3 completed")
    return "result3"
  }).pipe(Effect.withSpan("concurrent-task-3"))
  
  // Run tasks concurrently using Effect's fiber system
  const results = yield* Effect.all([task1, task2, task3], {
    concurrency: "unbounded"
  }).pipe(
    Effect.withSpan("concurrent-execution", {
      attributes: { taskCount: 3 }
    })
  )
  
  yield* Effect.log(`🎯 Concurrent results: ${results.join(", ")}`)
  
  // 3. Resource safety with automatic cleanup
  yield* Effect.log("🛡️ Testing resource safety...")
  
  const resourceTask = Effect.gen(function* () {
    yield* Effect.log("📦 Acquiring resource...")
    yield* Effect.sleep(Duration.millis(300))
    yield* Effect.log("✅ Resource acquired")
    
    // Simulate work that might fail
    yield* Effect.sleep(Duration.millis(500))
    
    if (Math.random() < 0.3) {
      yield* Effect.fail(new Error("Resource operation failed"))
    }
    
    return "resource-success"
  }).pipe(
    // Automatic cleanup even on failure
    Effect.ensuring(
      Effect.log("🧹 Resource cleaned up automatically").pipe(
        Effect.withSpan("resource-cleanup")
      )
    ),
    Effect.withSpan("resource-usage", {
      attributes: { resourceType: "demo-resource" }
    })
  )
  
  yield* resourceTask.pipe(
    Effect.catchAll((error) =>
      Effect.log(`⚠️ Resource task failed but cleanup happened: ${error}`)
    )
  )
  
  // 4. Effect scheduling (replaces cron package)
  yield* Effect.log("⏰ Testing Effect scheduling...")
  
  const scheduledTask = Effect.gen(function* () {
    const timestamp = new Date().toISOString()
    yield* Effect.log(`⚡ Scheduled task executed at ${timestamp}`)
    return timestamp
  }).pipe(Effect.withSpan("scheduled-task"))
  
  // Run task on a schedule (every 1.5 seconds, 3 times)
  yield* scheduledTask.pipe(
    Effect.repeat(Schedule.spaced(Duration.seconds(1.5))),
    Effect.timeout(Duration.seconds(6)), // Stop after 6 seconds
    Effect.withSpan("scheduled-repeat", {
      attributes: { 
        interval: "1.5s",
        maxDuration: "6s"
      }
    }),
    Effect.catchTag("TimeoutException", () =>
      Effect.log("⏰ Scheduled task demo completed")
    )
  )
  
  // 5. Structured error handling
  yield* Effect.log("🎯 Testing structured error handling...")
  
  class NetworkError {
    readonly _tag = "NetworkError"
    constructor(readonly message: string) {}
  }
  
  class ValidationError {
    readonly _tag = "ValidationError"
    constructor(readonly field: string, readonly message: string) {}
  }
  
  const riskyOperation = Effect.gen(function* () {
    const rand = Math.random()
    if (rand < 0.3) {
      yield* Effect.fail(new NetworkError("Connection timeout"))
    } else if (rand < 0.6) {
      yield* Effect.fail(new ValidationError("email", "Invalid format"))
    } else {
      return "Operation successful"
    }
  }).pipe(Effect.withSpan("risky-operation"))
  
  yield* riskyOperation.pipe(
    Effect.catchTags({
      NetworkError: (error) =>
        Effect.log(`🌐 Handled network error: ${error.message}`),
      ValidationError: (error) =>
        Effect.log(`✅ Handled validation error: ${error.field} - ${error.message}`)
    }),
    Effect.tap((result) =>
      Effect.log(`✅ Operation result: ${result}`)
    )
  )
  
  // 6. Service simulation
  yield* Effect.log("📦 Simulating service lifecycle...")
  
  const serviceSimulation = Effect.gen(function* () {
    yield* Effect.log("🔄 Service starting...")
    yield* Effect.sleep(Duration.millis(500))
    yield* Effect.log("✅ Service started")
    
    // Simulate service work
    for (let i = 1; i <= 3; i++) {
      yield* Effect.log(`⚙️ Service processing task ${i}`)
      yield* Effect.sleep(Duration.millis(800))
    }
    
    yield* Effect.log("🛑 Service stopping...")
    yield* Effect.sleep(Duration.millis(300))
    yield* Effect.log("✅ Service stopped")
    
    return "service-completed"
  }).pipe(
    Effect.withSpan("service-lifecycle", {
      attributes: {
        serviceName: "demo-service",
        tasks: 3
      }
    })
  )
  
  yield* serviceSimulation
  
  yield* Effect.log("✨ Effect-based j8s Demo completed successfully!")
  yield* Effect.log("🎯 Check DevTools at http://localhost:34437 for detailed traces")
  yield* Effect.log("📊 This demo showed how Effect eliminates manual implementations")
  
}).pipe(
  Effect.withSpan("j8s-effect-demo", {
    attributes: {
      demo: "effect-features",
      version: "1.0.0",
      improvements: [
        "built-in-exponential-backoff",
        "fiber-concurrency", 
        "resource-safety",
        "effect-scheduling",
        "structured-errors",
        "service-lifecycle"
      ]
    }
  })
)

// DevTools layer
const DevToolsLive = DevTools.layer()

// Run the demo
console.log("🚀 Effect-based j8s Simple Demo")
console.log("📊 DevTools will be available at: http://localhost:34437")
console.log("🔍 Open DevTools in your browser to see the improvements!")
console.log("⏱️  Demo will run for about 15 seconds...")
console.log("")

simpleEffectDemo.pipe(
  Effect.provide(DevToolsLive),
  NodeRuntime.runMain
)
