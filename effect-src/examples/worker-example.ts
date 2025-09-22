/**
 * Worker service example using Effect-based j8s
 * 
 * Demonstrates how to use worker threads with Effect for better reliability
 * and resource management compared to the original implementation.
 */

import { Effect } from "effect"
import {
  BaseEffectService,
  createEffectWorkerService,
  runExposeEffect,
  EffectServiceManagerOperations,
  EffectServiceManagerLive,
  ObservabilityDev,
  type IEffectServiceManager,
  type HealthCheckResult,
  type ServiceError
} from "../index"

/**
 * Example worker service implementation
 * This would be in a separate file (e.g., worker.ts)
 */
class WorkerTaskService extends BaseEffectService {
  private isRunning = false
  private taskCount = 0

  readonly start = Effect.gen(this, function* () {
    yield* Effect.log(`Worker task service ${this.name} starting...`)
    
    this.isRunning = true
    
    // Simulate long-running work in worker thread
    while (this.isRunning) {
      yield* this.processTask()
      yield* Effect.sleep("2 seconds")
    }
  })

  readonly stop = Effect.gen(this, function* () {
    yield* Effect.log(`Worker task service ${this.name} stopping...`)
    this.isRunning = false
    yield* Effect.sleep("100 millis") // Graceful shutdown
  })

  readonly healthCheck = Effect.gen(this, function* () {
    return {
      status: this.isRunning ? "running" as const : "stopped" as const,
      details: {
        isRunning: this.isRunning,
        tasksProcessed: this.taskCount,
        uptime: Date.now() // Simplified uptime tracking
      },
      timestamp: new Date()
    }
  })

  private readonly processTask = Effect.gen(this, function* () {
    yield* Effect.log(`Processing task #${this.taskCount + 1}`)
    
    // Simulate task processing with potential failure
    yield* Effect.tryPromise({
      try: () => this.simulateWork(),
      catch: (error) => new Error(`Task failed: ${error}`)
    }).pipe(
      // Automatic retry with Effect's scheduling
      Effect.retry({
        schedule: Effect.Schedule.exponential("100 millis").pipe(
                  Effect.Schedule.compose(Effect.Schedule.recurs(3)))
      })
    )

    this.taskCount++
    yield* Effect.log(`Task #${this.taskCount} completed`)
  })

  private async simulateWork(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Simulate occasional failure
    if (Math.random() < 0.2) {
      throw new Error("Random task failure")
    }
  }
}

/**
 * Create worker service files programmatically
 * In a real application, these would be separate .ts files
 */
const createWorkerFile = (): Effect.Effect<string, never, never> =>
  Effect.sync(() => {
    const workerCode = `
// worker.ts - Effect-based worker service
import { runExposeEffect } from "../index"

// The worker service implementation would be imported or defined here
class WorkerTaskService {
  name = "worker-task-service"
  // ... implementation would be here
}

// Expose the service using Effect
const service = new WorkerTaskService()
runExposeEffect(service)
`
    
    // In a real implementation, you'd write this to a file
    // For demo purposes, we'll return the code
    return workerCode
  })

/**
 * Example demonstrating worker services with Effect
 */
export const runWorkerExample = (): Effect.Effect<void, never, never> =>
  Effect.gen(function* () {
    yield* Effect.log("🧵 Starting Effect-based worker service example")

    // In a real implementation, you'd create actual worker services like this:
    // const workerService = createEffectWorkerService(
    //   "worker-task-service",
    //   new URL("./worker.ts", import.meta.url),
    //   {
    //     workerData: {
    //       config: { maxRetries: 5 },
    //       initialState: "idle"
    //     },
    //     autoTerminate: false
    //   }
    // )

    // For demo purposes, we'll create a main-thread service that simulates worker behavior
    const simulatedWorkerService = new WorkerTaskService("simulated-worker")
    
    // Create a CPU-intensive worker (would be in actual worker thread)
    const cpuIntensiveService = new (class extends BaseEffectService {
      readonly start = Effect.gen(this, function* () {
        yield* Effect.log("🔥 Starting CPU intensive work...")
        
        // This would run in a worker thread to avoid blocking main thread
        for (let i = 0; i < 10; i++) {
          yield* Effect.log(`CPU work iteration ${i + 1}`)
          
          // Simulate CPU-intensive work
          yield* Effect.tryPromise({
            try: () => this.intensiveCalculation(),
            catch: (error) => new Error(`Calculation failed: ${error}`)
          })
          
          yield* Effect.sleep("500 millis")
        }
        
        yield* Effect.log("✅ CPU intensive work completed")
      })

      readonly stop = Effect.gen(this, function* () {
        yield* Effect.log("Stopping CPU intensive service")
      })

      private async intensiveCalculation(): Promise<number> {
        // Simulate CPU work (would be much more intensive in real use)
        let result = 0
        for (let i = 0; i < 1000000; i++) {
          result += Math.random()
        }
        return result
      }
    })("cpu-intensive-worker")

    // Add services with worker-appropriate configurations
    yield* EffectServiceManagerOperations.addServices([
      {
        service: simulatedWorkerService,
        config: {
          restartPolicy: "on-failure",
          maxRetries: 3,
          // In real worker service, you might have special retry policies
        }
      },
      {
        service: cpuIntensiveService,
        config: {
          restartPolicy: "always" // CPU workers often need to restart on failure
        }
      }
    ])

    // Start health monitoring
    const manager = yield* Effect.service(IEffectServiceManager)
    yield* manager.startHealthMonitoring

    // Start worker services
    yield* manager.startService("simulated-worker")
    yield* manager.startService("cpu-intensive-worker")

    // Monitor worker health
    yield* Effect.log("🔍 Monitoring worker services for 15 seconds...")
    
    for (let i = 0; i < 5; i++) {
      yield* Effect.sleep("3 seconds")
      
      const workerHealth = yield* manager.healthCheckService("simulated-worker").pipe(
        Effect.catchAll(() => Effect.succeed({
          status: "unknown" as const,
          details: {},
          timestamp: new Date()
        }))
      )
      
      const cpuHealth = yield* manager.healthCheckService("cpu-intensive-worker").pipe(
        Effect.catchAll(() => Effect.succeed({
          status: "unknown" as const,
          details: {},
          timestamp: new Date()
        }))
      )
      
      yield* Effect.log(`Worker Health Check ${i + 1}:`)
      yield* Effect.log(`  Simulated Worker: ${workerHealth.status}`)
      yield* Effect.log(`  CPU Worker: ${cpuHealth.status}`)
    }

    // Show overall system health including workers
    const overallHealth = yield* manager.getOverallHealth
    yield* Effect.log("📊 System Health with Workers:", {
      status: overallHealth.status,
      summary: overallHealth.summary
    })

    // Demonstrate graceful worker shutdown
    yield* Effect.log("🔄 Demonstrating graceful worker shutdown...")
    yield* manager.stopService("cpu-intensive-worker")
    yield* manager.stopService("simulated-worker")

    yield* Effect.log("✨ Worker service example completed!")

    // Show the worker file that would be created
    const workerCode = yield* createWorkerFile()
    yield* Effect.log("📝 Example worker file code:", workerCode)

  }).pipe(
    Effect.provide(EffectServiceManagerLive),
    Effect.provide(ObservabilityDev),
    Effect.catchAllCause((cause) =>
      Effect.gen(function* () {
        yield* Effect.logError("Worker example failed:", cause)
        process.exit(1)
      })
    )
  )

// Run the example if this file is executed directly  
if (import.meta.url === `file://${process.argv[1]}`) {
  Effect.runFork(runWorkerExample())
}
