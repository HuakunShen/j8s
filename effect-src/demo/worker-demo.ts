/**
 * Worker Service Demo with Effect DevTools
 * 
 * Demonstrates Effect-based worker services with enhanced observability
 * and the power of Effect's structured concurrency for worker management.
 */

import { DevTools } from "@effect/experimental"
import { NodeRuntime } from "@effect/platform-node"
import { Effect, Duration, Console, Ref } from "effect"
import {
  BaseEffectService,
  EffectServiceManagerLive,
  EffectServiceManagerOperations,
  EffectJ8s,
  ObservabilityDev,
  ServiceTracing,
  type IEffectServiceManager
} from "../index"

/**
 * CPU-intensive worker service that would normally run in a worker thread
 * For demo purposes, we simulate the worker behavior in the main thread
 */
class CPUIntensiveWorker extends BaseEffectService {
  private isProcessing = false
  private tasksCompleted = 0
  private readonly taskQueue = Ref.unsafeMake<number[]>([])

  readonly start = Effect.gen(this, function* () {
    yield* Effect.log("🔥 Starting CPU-intensive worker...")
    
    this.isProcessing = true
    
    // Initialize task queue with some work
    yield* Ref.set(this.taskQueue, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    
    // Start processing tasks in background fiber
    yield* Effect.fork(this.processTaskQueue())
    
    yield* Effect.log("✅ CPU worker started and processing tasks")
  }).pipe(
    ServiceTracing.traceServiceOperation("start", this.name),
    Effect.withSpan("worker.cpu.start", {
      attributes: { 
        workerType: "cpu-intensive",
        queueSize: 10
      }
    })
  )

  readonly stop = Effect.gen(this, function* () {
    yield* Effect.log("🛑 Stopping CPU worker...")
    this.isProcessing = false
    
    // Wait for current task to complete
    yield* Effect.sleep("1 second")
    
    yield* Effect.log(`✅ CPU worker stopped. Completed ${this.tasksCompleted} tasks`)
  }).pipe(
    ServiceTracing.traceServiceOperation("stop", this.name)
  )

  readonly healthCheck = Effect.gen(this, function* () {
    const queueSize = yield* Ref.get(this.taskQueue).pipe(
      Effect.map(queue => queue.length)
    )
    
    return {
      status: this.isProcessing ? "running" as const : "stopped" as const,
      details: {
        isProcessing: this.isProcessing,
        tasksCompleted: this.tasksCompleted,
        queueSize,
        cpuUsage: process.cpuUsage(),
        workerType: "cpu-intensive"
      },
      timestamp: new Date()
    }
  }).pipe(
    ServiceTracing.traceHealthCheck(this.name)
  )

  private readonly processTaskQueue = (): Effect.Effect<never, never, never> =>
    Effect.gen(this, function* () {
      while (this.isProcessing) {
        const queue = yield* Ref.get(this.taskQueue)
        
        if (queue.length > 0) {
          const taskId = queue[0]
          yield* Ref.update(this.taskQueue, q => q.slice(1))
          
          yield* this.processTask(taskId)
          this.tasksCompleted++
          
          // Add more tasks to simulate continuous work
          if (Math.random() < 0.3) {
            const newTaskId = this.tasksCompleted + Math.floor(Math.random() * 100)
            yield* Ref.update(this.taskQueue, q => [...q, newTaskId])
          }
        } else {
          yield* Effect.sleep("2 seconds") // Wait for more tasks
        }
        
        yield* Effect.sleep("100 millis") // Small delay between tasks
      }
    }).pipe(Effect.forever)

  private readonly processTask = (taskId: number): Effect.Effect<void, never, never> =>
    Effect.gen(this, function* () {
      yield* Effect.log(`⚙️ Processing CPU task ${taskId}...`).pipe(
        Effect.withSpan("worker.task.process", {
          attributes: {
            taskId,
            taskType: "cpu-intensive"
          }
        })
      )
      
      // Simulate CPU-intensive work with Effect's tryPromise
      yield* Effect.tryPromise({
        try: () => this.intensiveCalculation(taskId),
        catch: (error) => new Error(`Task ${taskId} failed: ${error}`)
      }).pipe(
        Effect.retry({
          schedule: EffectJ8s.retries.quick(), // Quick retry for failed tasks
          onRetry: ({ attempt }) =>
            Effect.log(`🔄 Retrying task ${taskId}, attempt ${attempt}`)
        }),
        Effect.catchAll((error) =>
          Effect.log(`❌ Task ${taskId} permanently failed: ${error}`)
        )
      )
      
      yield* Effect.log(`✅ Completed task ${taskId}`)
    })

  private async intensiveCalculation(taskId: number): Promise<number> {
    // Simulate CPU-intensive work (in real worker, this would be much more intensive)
    let result = 0
    const iterations = 500000 + (taskId * 10000)
    
    for (let i = 0; i < iterations; i++) {
      result += Math.sqrt(i) * Math.random()
    }
    
    // Simulate occasional task failure
    if (Math.random() < 0.1) {
      throw new Error("Calculation overflow")
    }
    
    return result
  }
}

/**
 * I/O intensive worker for file processing simulation
 */
class IOWorker extends BaseEffectService {
  private isProcessing = false
  private filesProcessed = 0
  private readonly fileQueue = Ref.unsafeMake<string[]>([])

  readonly start = Effect.gen(this, function* () {
    yield* Effect.log("📁 Starting I/O worker for file processing...")
    
    this.isProcessing = true
    
    // Initialize with some files to process
    const initialFiles = [
      "document1.pdf", "image1.jpg", "data1.csv", "log1.txt",
      "document2.pdf", "image2.png", "data2.json", "config.yaml"
    ]
    yield* Ref.set(this.fileQueue, initialFiles)
    
    // Start processing files
    yield* Effect.fork(this.processFileQueue())
    
    yield* Effect.log("✅ I/O worker started and processing files")
  }).pipe(
    Effect.withSpan("worker.io.start", {
      attributes: {
        workerType: "io-intensive",
        initialFileCount: 8
      }
    })
  )

  readonly stop = Effect.gen(this, function* () {
    yield* Effect.log("🛑 Stopping I/O worker...")
    this.isProcessing = false
    yield* Effect.sleep("500 millis")
    yield* Effect.log(`✅ I/O worker stopped. Processed ${this.filesProcessed} files`)
  })

  readonly healthCheck = Effect.gen(this, function* () {
    const queueSize = yield* Ref.get(this.fileQueue).pipe(
      Effect.map(queue => queue.length)
    )
    
    return {
      status: this.isProcessing ? "running" as const : "stopped" as const,
      details: {
        isProcessing: this.isProcessing,
        filesProcessed: this.filesProcessed,
        queueSize,
        workerType: "io-intensive"
      },
      timestamp: new Date()
    }
  })

  private readonly processFileQueue = (): Effect.Effect<never, never, never> =>
    Effect.gen(this, function* () {
      while (this.isProcessing) {
        const queue = yield* Ref.get(this.fileQueue)
        
        if (queue.length > 0) {
          const fileName = queue[0]
          yield* Ref.update(this.fileQueue, q => q.slice(1))
          
          yield* this.processFile(fileName)
          this.filesProcessed++
          
          // Occasionally add new files to process
          if (Math.random() < 0.2) {
            const newFile = `generated_${Date.now()}.tmp`
            yield* Ref.update(this.fileQueue, q => [...q, newFile])
          }
        } else {
          yield* Effect.sleep("3 seconds")
        }
        
        yield* Effect.sleep("500 millis")
      }
    }).pipe(Effect.forever)

  private readonly processFile = (fileName: string): Effect.Effect<void, never, never> =>
    Effect.gen(this, function* () {
      yield* Effect.log(`📄 Processing file: ${fileName}`).pipe(
        Effect.withSpan("worker.file.process", {
          attributes: {
            fileName,
            fileType: fileName.split('.').pop() || 'unknown'
          }
        })
      )
      
      yield* Effect.tryPromise({
        try: () => this.simulateFileProcessing(fileName),
        catch: (error) => new Error(`File processing failed: ${error}`)
      }).pipe(
        Effect.retry({
          schedule: EffectJ8s.retries.linear(),
          onRetry: ({ attempt }) =>
            Effect.log(`🔄 Retrying file ${fileName}, attempt ${attempt}`)
        }),
        Effect.catchAll((error) =>
          Effect.log(`❌ File ${fileName} processing failed: ${error}`)
        )
      )
      
      yield* Effect.log(`✅ Processed file: ${fileName}`)
    })

  private async simulateFileProcessing(fileName: string): Promise<void> {
    // Simulate I/O operations with varying delays
    const fileSize = Math.random() * 1000 + 100 // 100-1100ms
    await new Promise(resolve => setTimeout(resolve, fileSize))
    
    // Simulate occasional I/O errors
    if (Math.random() < 0.05) {
      throw new Error("File system error")
    }
  }
}

/**
 * Network worker for API calls and data fetching
 */
class NetworkWorker extends BaseEffectService {
  private isActive = false
  private requestsProcessed = 0

  readonly start = Effect.gen(this, function* () {
    yield* Effect.log("🌐 Starting network worker...")
    
    this.isActive = true
    
    // Start making periodic API calls
    yield* Effect.fork(this.networkOperations())
    
    yield* Effect.log("✅ Network worker started")
  }).pipe(
    Effect.withSpan("worker.network.start")
  )

  readonly stop = Effect.gen(this, function* () {
    yield* Effect.log("🛑 Stopping network worker...")
    this.isActive = false
    yield* Effect.log(`✅ Network worker stopped. Processed ${this.requestsProcessed} requests`)
  })

  readonly healthCheck = Effect.gen(this, function* () {
    return {
      status: this.isActive ? "running" as const : "stopped" as const,
      details: {
        isActive: this.isActive,
        requestsProcessed: this.requestsProcessed,
        workerType: "network"
      },
      timestamp: new Date()
    }
  })

  private readonly networkOperations = (): Effect.Effect<never, never, never> =>
    Effect.gen(this, function* () {
      while (this.isActive) {
        yield* this.makeAPICall()
        this.requestsProcessed++
        yield* Effect.sleep("4 seconds")
      }
    }).pipe(Effect.forever)

  private readonly makeAPICall = (): Effect.Effect<void, never, never> =>
    Effect.gen(this, function* () {
      const endpoint = `/api/data/${Math.floor(Math.random() * 100)}`
      
      yield* Effect.log(`🔗 Making API call to ${endpoint}`).pipe(
        Effect.withSpan("worker.network.api_call", {
          attributes: {
            endpoint,
            method: "GET"
          }
        })
      )
      
      yield* Effect.tryPromise({
        try: () => this.simulateAPICall(endpoint),
        catch: (error) => new Error(`API call failed: ${error}`)
      }).pipe(
        Effect.retry({
          schedule: EffectJ8s.retries.exponential(),
          onRetry: ({ attempt }) =>
            Effect.log(`🔄 Retrying API call ${endpoint}, attempt ${attempt}`)
        }),
        Effect.catchAll((error) =>
          Effect.log(`❌ API call ${endpoint} failed: ${error}`)
        )
      )
      
      yield* Effect.log(`✅ API call ${endpoint} completed`)
    })

  private async simulateAPICall(endpoint: string): Promise<any> {
    // Simulate network latency
    const latency = Math.random() * 2000 + 500 // 500-2500ms
    await new Promise(resolve => setTimeout(resolve, latency))
    
    // Simulate network errors
    if (Math.random() < 0.15) {
      throw new Error("Network timeout")
    }
    
    return { endpoint, data: `Response for ${endpoint}`, timestamp: Date.now() }
  }
}

/**
 * Main worker demo program
 */
const runWorkerDemo = Effect.gen(function* () {
  yield* Effect.log("🧵 Starting Effect-based Worker Services Demo with DevTools")
  yield* Effect.log("📊 DevTools available at: http://localhost:34437")
  
  // Create worker services
  const cpuWorker = new CPUIntensiveWorker("cpu-worker")
  const ioWorker = new IOWorker("io-worker")
  const networkWorker = new NetworkWorker("network-worker")

  yield* Effect.log("👥 Adding worker services...")

  // Add worker services with appropriate configurations
  yield* EffectServiceManagerOperations.addServices([
    {
      service: cpuWorker,
      config: {
        restartPolicy: "on-failure",
        maxRetries: 3,
        retrySchedule: EffectJ8s.retries.exponential()
      }
    },
    {
      service: ioWorker,
      config: {
        restartPolicy: "always", // I/O workers should always restart
        retrySchedule: EffectJ8s.retries.linear()
      }
    },
    {
      service: networkWorker,
      config: {
        restartPolicy: "on-failure",
        maxRetries: 5, // Network issues might need more retries
        retrySchedule: EffectJ8s.retries.fibonacci()
      }
    }
  ]).pipe(
    Effect.withSpan("workers.registration", {
      attributes: { workerCount: 3 }
    })
  )

  // Start health monitoring
  const manager = yield* Effect.service(IEffectServiceManager)
  yield* Effect.log("🔍 Starting health monitoring for workers...")
  yield* manager.startHealthMonitoring

  yield* Effect.log("🚀 Starting all worker services...")
  
  // Start workers concurrently
  yield* Effect.all([
    manager.startService("cpu-worker"),
    manager.startService("io-worker"),
    manager.startService("network-worker")
  ], { concurrency: "unbounded" }).pipe(
    Effect.withSpan("workers.startup")
  )

  yield* Effect.log("⏳ Waiting for workers to be healthy...")
  yield* EffectServiceManagerOperations.waitForHealthy(10000, 2000)

  // Monitor workers for 45 seconds
  yield* Effect.log("📊 Monitoring worker performance...")
  
  for (let i = 1; i <= 9; i++) { // 45 seconds of monitoring
    yield* Effect.sleep("5 seconds")
    
    const health = yield* manager.getOverallHealth
    
    yield* Effect.log(`📈 Worker Status Check #${i}:`).pipe(
      Effect.withSpan("workers.status_check", {
        attributes: {
          checkNumber: i,
          systemStatus: health.status
        }
      })
    )
    
    // Show detailed worker status
    for (const [serviceName, serviceHealth] of Object.entries(health.services)) {
      const details = serviceHealth.details as any
      let statusInfo = `${serviceName}: ${serviceHealth.status}`
      
      if (details.tasksCompleted !== undefined) {
        statusInfo += ` (${details.tasksCompleted} tasks)`
      }
      if (details.filesProcessed !== undefined) {
        statusInfo += ` (${details.filesProcessed} files)`
      }
      if (details.requestsProcessed !== undefined) {
        statusInfo += ` (${details.requestsProcessed} requests)`
      }
      if (details.queueSize !== undefined) {
        statusInfo += ` [queue: ${details.queueSize}]`
      }
      
      yield* Effect.log(`   ${statusInfo}`)
    }
  }

  // Demonstrate worker resilience by restarting one
  yield* Effect.log("🔄 Testing worker resilience - restarting CPU worker...")
  yield* manager.restartService("cpu-worker").pipe(
    Effect.withSpan("workers.resilience_test")
  )

  yield* Effect.sleep("5 seconds")

  // Final status check
  const finalHealth = yield* manager.getOverallHealth
  yield* Effect.log("📊 Final Worker Status:")
  yield* Effect.log(`   System: ${finalHealth.status}`)
  yield* Effect.log(`   Workers: ${finalHealth.summary.healthy} healthy, ${finalHealth.summary.unhealthy} unhealthy`)

  yield* Effect.log("🛑 Shutting down all workers...")
  yield* EffectServiceManagerOperations.gracefulShutdown(10000)

  yield* Effect.log("✨ Worker services demo completed!")
  yield* Effect.log("🎯 Check DevTools for detailed worker traces and performance metrics")

}).pipe(
  Effect.provide(EffectServiceManagerLive),
  Effect.provide(ObservabilityDev),
  Effect.withSpan("j8s.worker_demo", {
    attributes: {
      demoType: "worker-services",
      workerTypes: ["cpu-intensive", "io-intensive", "network"],
      devtools: true
    }
  }),
  Effect.catchAllCause((cause) =>
    Effect.gen(function* () {
      yield* Effect.logError("❌ Worker demo failed:", cause)
      yield* Effect.sleep("2 seconds")
      process.exit(1)
    })
  )
)

/**
 * DevTools configuration
 */
const DevToolsLive = DevTools.layer()

/**
 * Run the worker demo with DevTools
 */
console.log("🧵 Starting Effect-based Worker Services Demo...")
console.log("📊 DevTools will be available at: http://localhost:34437")
console.log("🔍 Open DevTools to see worker performance metrics and traces!")
console.log("")

runWorkerDemo.pipe(
  Effect.provide(DevToolsLive),
  NodeRuntime.runMain
)
