/**
 * Basic usage examples of Effect-based j8s
 * 
 * This demonstrates how the new Effect-based system provides the same
 * functionality as the original j8s but with enhanced reliability and features.
 */

import { Effect, Duration } from "effect"
import {
  BaseEffectService,
  EffectServiceManagerLive,
  EffectServiceManagerOperations,
  EffectJ8s,
  CronScheduling,
  createCronJob,
  ObservabilityDev,
  type IEffectServiceManager,
  type ServiceConfig
} from "../index"

/**
 * Example 1: Simple service running in main thread
 * Equivalent to the original BaseService example but with Effect
 */
class SimpleEffectService extends BaseEffectService {
  readonly start = Effect.gen(this, function* () {
    yield* Effect.log(`Effect service ${this.name} started`)
    
    // Simulate some work with built-in Effect utilities
    yield* Effect.sleep("2 seconds")
    
    yield* Effect.log(`Effect service ${this.name} completed work`)
  }).pipe(
    Effect.catchAll((error) => 
      Effect.fail(new Error(`Service failed: ${error}`))
    )
  )

  readonly stop = Effect.gen(this, function* () {
    yield* Effect.log(`Effect service ${this.name} stopped`)
    yield* Effect.sleep("100 millis") // Graceful shutdown
  })
}

/**
 * Example 2: Cron job service using Effect's built-in Cron
 * No need for external cron package!
 */
class BackupEffectService extends BaseEffectService {
  readonly start = Effect.gen(this, function* () {
    yield* Effect.log("🔄 Running backup...")
    
    // Simulate backup work with automatic retry on failure
    yield* Effect.tryPromise({
      try: () => this.performBackup(),
      catch: (error) => new Error(`Backup failed: ${error}`)
    })
    
    yield* Effect.log("✅ Backup completed successfully")
  })

  readonly stop = Effect.gen(this, function* () {
    yield* Effect.log("Backup service stopped")
  })

  private async performBackup(): Promise<void> {
    // Simulate backup operation
    await new Promise(resolve => setTimeout(resolve, 3000))
    
    // Simulate occasional failure for retry demonstration
    if (Math.random() < 0.3) {
      throw new Error("Backup operation failed")
    }
  }
}

/**
 * Example 3: Service with custom health check and observability
 */
class DatabaseEffectService extends BaseEffectService {
  private connected = false
  
  readonly start = Effect.gen(this, function* () {
    yield* Effect.log("🔌 Connecting to database...")
    
    // Simulate connection with potential failure and automatic retry
    yield* Effect.tryPromise({
      try: () => this.connect(),
      catch: (error) => new Error(`DB connection failed: ${error}`)
    }).pipe(
      // Built-in exponential backoff - no manual implementation!
      Effect.retry({
        schedule: EffectJ8s.retries.exponential(),
        while: (error) => Effect.succeed(!error.message.includes("permanent"))
      })
    )
    
    this.connected = true
    yield* Effect.log("✅ Database connected")
  })

  readonly stop = Effect.gen(this, function* () {
    if (this.connected) {
      yield* Effect.log("📡 Disconnecting from database...")
      yield* Effect.tryPromise({
        try: () => this.disconnect(),
        catch: () => new Error("Disconnect failed")
      })
      this.connected = false
    }
  })

  // Custom health check with Effect
  readonly healthCheck = Effect.gen(this, function* () {
    if (!this.connected) {
      return {
        status: "unhealthy" as const,
        details: { reason: "Not connected to database" },
        timestamp: new Date()
      }
    }

    // Perform actual health check
    const isHealthy = yield* Effect.tryPromise({
      try: () => this.ping(),
      catch: () => false
    })

    return {
      status: isHealthy ? "running" as const : "unhealthy" as const,
      details: { 
        connected: this.connected,
        pingResult: isHealthy,
        lastCheck: new Date().toISOString()
      },
      timestamp: new Date()
    }
  })

  private async connect(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 1000))
    if (Math.random() < 0.2) {
      throw new Error("Connection failed")
    }
  }

  private async disconnect(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  private async ping(): Promise<boolean> {
    await new Promise(resolve => setTimeout(resolve, 100))
    return Math.random() > 0.1 // 90% success rate
  }
}

/**
 * Example 4: Quick service creation using helper functions
 */
const quickService = EffectJ8s.createSimpleService(
  "quick-service",
  () => {
    console.log("Quick service started")
  },
  () => {
    console.log("Quick service stopped")
  }
)

/**
 * Main example demonstrating the complete Effect-based j8s system
 */
export const runBasicExample = (): Effect.Effect<void, never, never> =>
  Effect.gen(function* () {
    yield* Effect.log("🚀 Starting Effect-based j8s example")

    // Create services
    const simpleService = new SimpleEffectService("simple-service")
    const dbService = new DatabaseEffectService("database-service")
    const backupService = new BackupEffectService("backup-service")

    // Service configurations using Effect features
    const configs: Array<{ service: any; config: ServiceConfig }> = [
      { 
        service: simpleService, 
        config: EffectJ8s.configs.onFailure(3) 
      },
      { 
        service: dbService, 
        config: {
          restartPolicy: "always",
          retrySchedule: EffectJ8s.retries.exponential()
        }
      },
      { 
        service: backupService, 
        config: {
          cronJob: createCronJob(
            CronScheduling.daily(2), // 2 AM daily
            Duration.minutes(30)     // 30 minute timeout
          )
        }
      },
      {
        service: quickService,
        config: EffectJ8s.configs.neverRestart()
      }
    ]

    // Add all services
    yield* EffectServiceManagerOperations.addServices(configs)

    // Start health monitoring with Effect's built-in observability  
    const manager = yield* Effect.service(IEffectServiceManager)
    yield* manager.startHealthMonitoring

    // Start services in dependency order
    yield* EffectServiceManagerOperations.startServicesInOrder([
      "database-service",
      "simple-service", 
      "quick-service"
      // backup-service will start automatically via cron
    ])

    // Wait for services to be healthy
    yield* EffectServiceManagerOperations.waitForHealthy(10000)

    // Show overall system health
    const health = yield* manager.getOverallHealth
    yield* Effect.log("📊 System Health:", health)

    // Let services run for a bit
    yield* Effect.log("⏱️  Letting services run for 30 seconds...")
    yield* Effect.sleep("30 seconds")

    // Graceful shutdown with Effect's resource safety
    yield* EffectServiceManagerOperations.gracefulShutdown()

    yield* Effect.log("✨ Effect-based j8s example completed!")

  }).pipe(
    Effect.provide(EffectServiceManagerLive),
    Effect.provide(ObservabilityDev), // Enable debug logging
    Effect.catchAllCause((cause) =>
      Effect.gen(function* () {
        yield* Effect.logError("Example failed:", cause)
        process.exit(1)
      })
    )
  )

// Run the example if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  Effect.runFork(runBasicExample())
}
