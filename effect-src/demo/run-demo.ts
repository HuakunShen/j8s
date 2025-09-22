#!/usr/bin/env tsx

/**
 * Demo Runner for Effect-based j8s
 * 
 * Quick test runner to showcase Effect DevTools integration
 */

import { DevTools } from "@effect/experimental"
import { NodeRuntime } from "@effect/platform-node"
import { Effect, Duration, Console, Schedule } from "effect"

// Simple demo program that shows Effect basics
const simpleDemo = Effect.gen(function* () {
  yield* Effect.log("🚀 Starting Effect-based j8s DevTools Demo!")
  yield* Effect.log("📊 DevTools available at: http://localhost:34437")
  
  // Demonstrate Effect's built-in features that replace manual j8s implementations
  
  // 1. Built-in exponential backoff (replaces manual implementation)
  yield* Effect.log("🔄 Demonstrating built-in exponential backoff...")
  
  const taskWithRetry = Effect.gen(function* () {
    yield* Effect.log("Attempting task...")
    // Simulate occasional failure
    if (Math.random() < 0.7) {
      throw new Error("Task failed - will retry with exponential backoff")
    }
    yield* Effect.log("✅ Task succeeded!")
    return "success"
  })
  
  yield* taskWithRetry.pipe(
    Effect.retry({
      schedule: Schedule.exponential("100 millis").pipe(
        Schedule.compose(Schedule.recurs(5)),
        Schedule.jittered()
      ),
      onRetry: ({ attempt, error }) =>
        Effect.log(`🔄 Retry attempt ${attempt}: ${error}`)
    }),
    Effect.withSpan("task.retry", {
      attributes: { 
        maxRetries: 5,
        strategy: "exponential-backoff"
      }
    }),
    Effect.catchAll((error) =>
      Effect.log(`❌ Task failed after all retries: ${error}`)
    )
  )
  
  // 2. Effect's structured concurrency (replaces Promise coordination)
  yield* Effect.log("🧵 Demonstrating fiber-based concurrency...")
  
  const task1 = Effect.gen(function* () {
    yield* Effect.sleep("1 second")
    yield* Effect.log("Task 1 completed")
    return "result1"
  }).pipe(
    Effect.withSpan("concurrent.task1")
  )
  
  const task2 = Effect.gen(function* () {
    yield* Effect.sleep("1.5 seconds")
    yield* Effect.log("Task 2 completed")
    return "result2"
  }).pipe(
    Effect.withSpan("concurrent.task2")
  )
  
  const task3 = Effect.gen(function* () {
    yield* Effect.sleep("800 millis")
    yield* Effect.log("Task 3 completed")
    return "result3"
  }).pipe(
    Effect.withSpan("concurrent.task3")
  )
  
  // Run tasks concurrently (fiber-based, not Promise-based)
  const results = yield* Effect.all([task1, task2, task3], {
    concurrency: "unbounded"
  }).pipe(
    Effect.withSpan("concurrent.all_tasks", {
      attributes: { taskCount: 3 }
    })
  )
  
  yield* Effect.log(`🎯 All tasks completed: ${results.join(", ")}`)
  
  // 3. Effect's resource safety (automatic cleanup)
  yield* Effect.log("🛡️ Demonstrating resource safety...")
  
  const resourceDemo = Effect.gen(function* () {
    yield* Effect.log("📦 Acquiring resource...")
    yield* Effect.sleep("500 millis")
    yield* Effect.log("✅ Resource acquired")
    
    // Simulate work with the resource
    yield* Effect.sleep("1 second")
    yield* Effect.log("⚙️ Using resource...")
    
    // Resource will be automatically cleaned up even if this fails
    if (Math.random() < 0.3) {
      throw new Error("Resource operation failed")
    }
    
    return "resource-result"
  }).pipe(
    Effect.ensuring(
      Effect.log("🧹 Cleaning up resource (automatic)").pipe(
        Effect.withSpan("resource.cleanup")
      )
    ),
    Effect.withSpan("resource.usage", {
      attributes: { resourceType: "demo-resource" }
    })
  )
  
  yield* resourceDemo.pipe(
    Effect.catchAll((error) =>
      Effect.log(`⚠️ Resource operation failed but cleanup still happened: ${error}`)
    )
  )
  
  // 4. Effect's scheduling (replaces cron package)
  yield* Effect.log("⏰ Demonstrating Effect scheduling...")
  
  const scheduledTask = Effect.gen(function* () {
    yield* Effect.log("⚡ Scheduled task executed!")
    return Date.now()
  }).pipe(
    Effect.withSpan("scheduled.task")
  )
  
  // Run task on a schedule (every 2 seconds, 3 times)
  yield* scheduledTask.pipe(
    Effect.repeat({
      schedule: Schedule.spaced("2 seconds").pipe(
        Schedule.compose(Schedule.recurs(2))
      )
    }),
    Effect.withSpan("scheduled.repeat", {
      attributes: { 
        interval: "2s",
        repetitions: 3
      }
    })
  )
  
  // 5. Effect's structured error handling
  yield* Effect.log("🎯 Demonstrating structured error handling...")
  
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
      return yield* Effect.fail(new NetworkError("Connection timeout"))
    } else if (rand < 0.6) {
      return yield* Effect.fail(new ValidationError("email", "Invalid format"))
    } else {
      return "Operation successful"
    }
  }).pipe(
    Effect.withSpan("risky.operation")
  )
  
  yield* riskyOperation.pipe(
    Effect.catchTags({
      NetworkError: (error) =>
        Effect.log(`🌐 Network error handled: ${error.message}`),
      ValidationError: (error) =>
        Effect.log(`✅ Validation error handled: ${error.field} - ${error.message}`)
    }),
    Effect.catchAll((error) =>
      Effect.log(`✅ Operation succeeded: ${error}`)
    )
  )
  
  yield* Effect.log("✨ Effect-based j8s DevTools Demo completed!")
  yield* Effect.log("🎯 Check DevTools at http://localhost:34437 for detailed traces")
  
}).pipe(
  Effect.withSpan("j8s.devtools_demo", {
    attributes: {
      demo: "effect-features",
      version: "1.0.0",
      features: [
        "exponential-backoff",
        "fiber-concurrency", 
        "resource-safety",
        "scheduling",
        "structured-errors"
      ]
    }
  })
)

// DevTools layer
const DevToolsLive = DevTools.layer()

// Run the demo
console.log("🚀 Effect-based j8s DevTools Demo")
console.log("📊 DevTools will be available at: http://localhost:34437")
console.log("🔍 Open DevTools in your browser to see Effect's powerful features!")
console.log("")

simpleDemo.pipe(
  Effect.provide(DevToolsLive),
  NodeRuntime.runMain
)
