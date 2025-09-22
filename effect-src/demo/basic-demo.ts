/**
 * Basic Demo of Effect-based j8s with DevTools
 * 
 * This demonstrates the core features of the new Effect-based j8s system
 * with DevTools enabled for enhanced observability and debugging.
 */

import { DevTools } from "@effect/experimental"
import { NodeRuntime } from "@effect/platform-node"
import { Effect, Duration, Console, Schedule } from "effect"
import {
  BaseEffectService,
  EffectServiceManagerLive,
  EffectServiceManagerOperations,
  EffectJ8s,
  CronScheduling,
  createCronJob,
  ObservabilityDev,
  ServiceTracing,
  type IEffectServiceManager,
  type ServiceError
} from "../index"

/**
 * Demo Service 1: Simple web server simulation
 */
class WebServerService extends BaseEffectService {
  private isRunning = false
  private requestCount = 0

  readonly start = Effect.gen(this, function* () {
    yield* Effect.log("🌐 Starting web server...")
    
    // Simulate server startup with potential failure
    yield* Effect.tryPromise({
      try: () => this.startServer(),
      catch: (error) => new Error(`Server startup failed: ${error}`)
    }).pipe(
      // Use Effect's built-in exponential backoff instead of manual implementation
      Effect.retry({
        schedule: EffectJ8s.retries.exponential(),
        while: (error) => Effect.succeed(!error.message.includes("permanent"))
      }),
      Effect.withSpan("server.startup", {
        attributes: { 
          service: this.name,
          port: 8080,
          environment: "demo"
        }
      })
    )

    this.isRunning = true
    
    // Start processing requests in background
    yield* Effect.fork(this.processRequests())
    
    yield* Effect.log("✅ Web server started successfully on port 8080")
  }).pipe(
    ServiceTracing.traceServiceOperation("start", this.name)
  )

  readonly stop = Effect.gen(this, function* () {
    yield* Effect.log("🛑 Stopping web server...")
    this.isRunning = false
    
    yield* Effect.tryPromise({
      try: () => this.stopServer(),
      catch: (error) => new Error(`Server shutdown failed: ${error}`)
    }).pipe(
      Effect.withSpan("server.shutdown", {
        attributes: { service: this.name, graceful: true }
      })
    )
    
    yield* Effect.log("✅ Web server stopped gracefully")
  }).pipe(
    ServiceTracing.traceServiceOperation("stop", this.name)
  )

  readonly healthCheck = Effect.gen(this, function* () {
    const memoryUsage = process.memoryUsage()
    
    return {
      status: this.isRunning ? "running" as const : "stopped" as const,
      details: {
        isRunning: this.isRunning,
        requestCount: this.requestCount,
        uptime: this.isRunning ? Date.now() : 0,
        memory: {
          used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          total: Math.round(memoryUsage.heapTotal / 1024 / 1024)
        }
      },
      timestamp: new Date()
    }
  }).pipe(
    ServiceTracing.traceHealthCheck(this.name)
  )

  private async startServer(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 1000))
    // Simulate occasional startup failure for retry demonstration
    if (Math.random() < 0.2) {
      throw new Error("Port already in use")
    }
  }

  private async stopServer(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  private readonly processRequests = (): Effect.Effect<never, never, never> =>
    Effect.gen(this, function* () {
      while (this.isRunning) {
        yield* Effect.sleep("2 seconds")
        this.requestCount++
        
        yield* Effect.log(`📨 Processed request #${this.requestCount}`).pipe(
          Effect.withSpan("request.process", {
            attributes: {
              requestId: this.requestCount,
              method: "GET",
              path: "/api/health"
            }
          })
        )
      }
    }).pipe(Effect.forever)
}

/**
 * Demo Service 2: Database connection with automatic reconnection
 */
class DatabaseService extends BaseEffectService {
  private connected = false
  private connectionPool = 0

  readonly start = Effect.gen(this, function* () {
    yield* Effect.log("🗄️ Connecting to database...")
    
    yield* Effect.tryPromise({
      try: () => this.connect(),
      catch: (error) => new Error(`Database connection failed: ${error}`)
    }).pipe(
      // Effect's built-in fibonacci backoff pattern
      Effect.retry({
        schedule: EffectJ8s.retries.fibonacci(),
        onRetry: ({ attempt, error }) =>
          Effect.log(`🔄 Database connection retry ${attempt}: ${error}`)
      }),
      Effect.withSpan("database.connect", {
        attributes: {
          service: this.name,
          host: "localhost",
          database: "demo_db"
        }
      })
    )

    this.connected = true
    this.connectionPool = 10 // Simulate connection pool
    
    yield* Effect.log("✅ Database connected with 10 connections in pool")
  })

  readonly stop = Effect.gen(this, function* () {
    if (!this.connected) return
    
    yield* Effect.log("📡 Disconnecting from database...")
    
    yield* Effect.tryPromise({
      try: () => this.disconnect(),
      catch: () => new Error("Disconnect failed")
    }).pipe(
      Effect.withSpan("database.disconnect")
    )
    
    this.connected = false
    this.connectionPool = 0
    
    yield* Effect.log("✅ Database disconnected")
  })

  readonly healthCheck = Effect.gen(this, function* () {
    if (!this.connected) {
      return {
        status: "unhealthy" as const,
        details: { reason: "Not connected to database" },
        timestamp: new Date()
      }
    }

    // Simulate health check query
    const isHealthy = yield* Effect.tryPromise({
      try: () => this.pingDatabase(),
      catch: () => false
    }).pipe(
      Effect.withSpan("database.ping")
    )

    return {
      status: isHealthy ? "running" as const : "unhealthy" as const,
      details: {
        connected: this.connected,
        poolSize: this.connectionPool,
        pingSuccess: isHealthy,
        lastCheck: new Date().toISOString()
      },
      timestamp: new Date()
    }
  })

  private async connect(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 1500))
    if (Math.random() < 0.3) {
      throw new Error("Connection timeout")
    }
  }

  private async disconnect(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 800))
  }

  private async pingDatabase(): Promise<boolean> {
    await new Promise(resolve => setTimeout(resolve, 100))
    return Math.random() > 0.1 // 90% success rate
  }
}

/**
 * Demo Service 3: Scheduled backup service using Effect Cron
 */
class BackupService extends BaseEffectService {
  private backupCount = 0

  readonly start = Effect.gen(this, function* () {
    yield* Effect.log("💾 Running backup operation...")
    
    yield* Effect.tryPromise({
      try: () => this.performBackup(),
      catch: (error) => new Error(`Backup failed: ${error}`)
    }).pipe(
      // Built-in linear backoff for backup retries
      Effect.retry({
        schedule: EffectJ8s.retries.linear(),
        onRetry: ({ attempt }) =>
          Effect.log(`🔄 Backup retry attempt ${attempt}`)
      }),
      Effect.withSpan("backup.operation", {
        attributes: {
          backupId: this.backupCount + 1,
          type: "incremental"
        }
      })
    )
    
    this.backupCount++
    yield* Effect.log(`✅ Backup #${this.backupCount} completed successfully`)
  })

  readonly stop = Effect.gen(this, function* () {
    yield* Effect.log("Backup service ready to stop")
  })

  private async performBackup(): Promise<void> {
    // Simulate backup work
    await new Promise(resolve => setTimeout(resolve, 3000))
    
    // Simulate occasional failure for retry demonstration
    if (Math.random() < 0.25) {
      throw new Error("Backup storage unavailable")
    }
  }
}

/**
 * Main demo program with DevTools integration
 */
const runDemo = Effect.gen(function* () {
  yield* Effect.log("🚀 Starting Effect-based j8s Demo with DevTools")
  yield* Effect.log("📊 DevTools available at: http://localhost:34437")
  
  // Create demo services
  const webServer = new WebServerService("web-server")
  const database = new DatabaseService("database")
  const backup = new BackupService("backup")

  // Quick service using helper
  const monitoringService = EffectJ8s.createSimpleService(
    "monitoring",
    () => console.log("📈 Monitoring service started"),
    () => console.log("📈 Monitoring service stopped")
  )

  yield* Effect.log("📦 Adding services to registry...")

  // Add services with different configurations
  yield* EffectServiceManagerOperations.addServices([
    {
      service: database,
      config: {
        restartPolicy: "always", // Always restart database
        retrySchedule: EffectJ8s.retries.exponential()
      }
    },
    {
      service: webServer,
      config: EffectJ8s.configs.onFailure(5) // Retry 5 times on failure
    },
    {
      service: monitoringService,
      config: EffectJ8s.configs.alwaysRestart()
    },
    {
      service: backup,
      config: {
        // Run backup every 30 seconds for demo (normally would be daily)
        cronJob: createCronJob(
          CronScheduling.everyMinutes(0.5), // Every 30 seconds for demo
          Duration.seconds(10) // 10 second timeout
        )
      }
    }
  ]).pipe(
    Effect.withSpan("services.registration", {
      attributes: { serviceCount: 4 }
    })
  )

  // Start health monitoring with Effect's built-in observability
  const manager = yield* Effect.service(IEffectServiceManager)
  yield* Effect.log("🔍 Starting health monitoring...")
  yield* manager.startHealthMonitoring

  yield* Effect.log("⚡ Starting services in dependency order...")
  
  // Start services in dependency order
  yield* EffectServiceManagerOperations.startServicesInOrder([
    "database",      // Start database first
    "web-server",    // Then web server
    "monitoring"     // Finally monitoring
    // backup service starts automatically via cron
  ]).pipe(
    Effect.withSpan("services.startup")
  )

  yield* Effect.log("⏳ Waiting for all services to be healthy...")
  
  // Wait for services to be healthy with timeout
  yield* EffectServiceManagerOperations.waitForHealthy(15000, 2000).pipe(
    Effect.withSpan("services.health_wait")
  )

  // Show system health every 10 seconds
  yield* Effect.log("📊 Starting health monitoring loop...")
  
  const healthMonitorLoop = Effect.gen(function* () {
    for (let i = 1; i <= 6; i++) { // Run for 1 minute
      yield* Effect.sleep("10 seconds")
      
      const health = yield* manager.getOverallHealth
      const serviceCount = yield* manager.getServiceCount
      
      yield* Effect.log(`📈 Health Check #${i}:`).pipe(
        Effect.withSpan("health.check", {
          attributes: {
            checkNumber: i,
            systemStatus: health.status,
            totalServices: serviceCount
          }
        })
      )
      
      yield* Effect.log(`   System Status: ${health.status}`)
      yield* Effect.log(`   Services: ${health.summary.healthy} healthy, ${health.summary.unhealthy} unhealthy`)
      yield* Effect.log(`   Total Services: ${serviceCount}`)

      // Show individual service details
      for (const [serviceName, serviceHealth] of Object.entries(health.services)) {
        yield* Effect.log(`   ${serviceName}: ${serviceHealth.status}`)
      }
    }
  }).pipe(
    Effect.withSpan("demo.monitoring_loop")
  )

  yield* healthMonitorLoop

  yield* Effect.log("🔄 Demonstrating service restart...")
  
  // Restart a service to show restart capabilities
  yield* manager.restartService("web-server").pipe(
    Effect.withSpan("demo.service_restart", {
      attributes: { serviceName: "web-server" }
    })
  )

  yield* Effect.sleep("5 seconds")

  yield* Effect.log("🛑 Initiating graceful shutdown...")
  
  // Graceful shutdown with Effect's resource safety
  yield* EffectServiceManagerOperations.gracefulShutdown(15000).pipe(
    Effect.withSpan("demo.shutdown")
  )

  yield* Effect.log("✨ Effect-based j8s Demo completed successfully!")
  yield* Effect.log("🎯 Check DevTools at http://localhost:34437 for detailed traces and metrics")

}).pipe(
  Effect.provide(EffectServiceManagerLive),
  Effect.provide(ObservabilityDev),
  Effect.withSpan("j8s.demo", {
    attributes: {
      version: "effect-based",
      environment: "demo",
      features: ["devtools", "tracing", "metrics", "health-monitoring"]
    }
  }),
  Effect.catchAllCause((cause) =>
    Effect.gen(function* () {
      yield* Effect.logError("❌ Demo failed:", cause)
      yield* Effect.sleep("2 seconds") // Give time to see the error
      process.exit(1)
    })
  )
)

/**
 * DevTools configuration for enhanced observability
 */
const DevToolsLive = DevTools.layer()

/**
 * Run the demo with DevTools enabled
 */
console.log("🚀 Starting Effect-based j8s Demo...")
console.log("📊 DevTools will be available at: http://localhost:34437")
console.log("🔍 Open DevTools in your browser to see real-time traces and metrics!")
console.log("")

runDemo.pipe(
  Effect.provide(DevToolsLive),
  NodeRuntime.runMain
)
