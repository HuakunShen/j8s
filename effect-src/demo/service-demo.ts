#!/usr/bin/env bun

/**
 * Complete Service Demo of Effect-based j8s with DevTools
 * 
 * This demonstrates the full service orchestration capabilities
 * with real service examples and DevTools integration.
 */

import { DevTools } from "@effect/experimental"
import { NodeRuntime } from "@effect/platform-node"
import { Effect, Duration, Console, Schedule, Ref } from "effect"

// Simple service implementations for the demo
class WebServerService {
  readonly name = "web-server"
  private isRunning = false
  private requestCount = 0

  readonly start = Effect.gen(this, function* () {
    yield* Effect.log("🌐 Starting web server...")
    
    // Simulate server startup with potential failure and automatic retry
    yield* Effect.tryPromise({
      try: () => this.startServer(),
      catch: (error) => new Error(`Server startup failed: ${error}`)
    }).pipe(
      Effect.retry(Schedule.exponential(Duration.millis(100), 2.0)),
      Effect.withSpan("server.startup", {
        attributes: { 
          service: this.name,
          port: 8080
        }
      })
    )

    this.isRunning = true
    
    // Start processing requests in background
    yield* Effect.fork(this.processRequests())
    
    yield* Effect.log("✅ Web server started on port 8080")
  })

  readonly stop = Effect.gen(this, function* () {
    yield* Effect.log("🛑 Stopping web server...")
    this.isRunning = false
    
    yield* Effect.tryPromise({
      try: () => this.stopServer(),
      catch: (error) => new Error(`Server shutdown failed: ${error}`)
    }).pipe(
      Effect.withSpan("server.shutdown")
    )
    
    yield* Effect.log("✅ Web server stopped")
  })

  readonly healthCheck = Effect.gen(this, function* () {
    return {
      status: this.isRunning ? "running" as const : "stopped" as const,
      details: {
        isRunning: this.isRunning,
        requestCount: this.requestCount,
        port: 8080
      },
      timestamp: new Date()
    }
  })

  private async startServer(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 500))
    if (Math.random() < 0.2) {
      throw new Error("Port binding failed")
    }
  }

  private async stopServer(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 300))
  }

  private readonly processRequests = (): Effect.Effect<never, never, never> =>
    Effect.gen(this, function* () {
      while (this.isRunning) {
        yield* Effect.sleep(Duration.seconds(2))
        this.requestCount++
        
        yield* Effect.log(`📨 Processed request #${this.requestCount}`).pipe(
          Effect.withSpan("request.process", {
            attributes: {
              requestId: this.requestCount,
              method: "GET"
            }
          })
        )
      }
    }).pipe(Effect.forever)
}

class DatabaseService {
  readonly name = "database"
  private connected = false

  readonly start = Effect.gen(this, function* () {
    yield* Effect.log("🗄️ Connecting to database...")
    
    yield* Effect.tryPromise({
      try: () => this.connect(),
      catch: (error) => new Error(`Database connection failed: ${error}`)
    }).pipe(
      // Built-in fibonacci backoff for database connections
      Effect.retry(Schedule.fibonacci(Duration.millis(100))),
      Effect.withSpan("database.connect", {
        attributes: {
          service: this.name,
          host: "localhost",
          database: "demo_db"
        }
      })
    )

    this.connected = true
    yield* Effect.log("✅ Database connected")
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
    yield* Effect.log("✅ Database disconnected")
  })

  readonly healthCheck = Effect.gen(this, function* () {
    if (!this.connected) {
      return {
        status: "unhealthy" as const,
        details: { reason: "Not connected" },
        timestamp: new Date()
      }
    }

    const isHealthy = yield* Effect.tryPromise({
      try: () => this.ping(),
      catch: () => false
    })

    return {
      status: isHealthy ? "running" as const : "unhealthy" as const,
      details: {
        connected: this.connected,
        pingSuccess: isHealthy
      },
      timestamp: new Date()
    }
  })

  private async connect(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 800))
    if (Math.random() < 0.3) {
      throw new Error("Connection timeout")
    }
  }

  private async disconnect(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 400))
  }

  private async ping(): Promise<boolean> {
    await new Promise(resolve => setTimeout(resolve, 50))
    return Math.random() > 0.1 // 90% success rate
  }
}

class BackupService {
  readonly name = "backup"
  private backupCount = 0

  readonly start = Effect.gen(this, function* () {
    yield* Effect.log("💾 Running backup operation...")
    
    yield* Effect.tryPromise({
      try: () => this.performBackup(),
      catch: (error) => new Error(`Backup failed: ${error}`)
    }).pipe(
      Effect.retry(Schedule.spaced(Duration.seconds(1))),
      Effect.withSpan("backup.operation", {
        attributes: {
          backupId: this.backupCount + 1,
          type: "incremental"
        }
      })
    )
    
    this.backupCount++
    yield* Effect.log(`✅ Backup #${this.backupCount} completed`)
  })

  readonly stop = Effect.gen(this, function* () {
    yield* Effect.log("Backup service ready to stop")
  })

  readonly healthCheck = Effect.gen(this, function* () {
    return {
      status: "running" as const,
      details: { backupsCompleted: this.backupCount },
      timestamp: new Date()
    }
  })

  private async performBackup(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 2000))
    if (Math.random() < 0.2) {
      throw new Error("Backup storage unavailable")
    }
  }
}

// Simple service registry
const createServiceRegistry = () => {
  const services = new Map()
  
  return {
    addService: (service: any) => {
      services.set(service.name, {
        service,
        status: Ref.unsafeMake("stopped" as const)
      })
    },
    
    startService: (name: string) => Effect.gen(function* () {
      const entry = services.get(name)
      if (!entry) {
        yield* Effect.fail(new Error(`Service '${name}' not found`))
      }
      
      yield* Ref.set(entry.status, "running")
      yield* entry.service.start
      yield* Effect.log(`Service '${name}' started successfully`)
    }),
    
    stopService: (name: string) => Effect.gen(function* () {
      const entry = services.get(name)
      if (!entry) {
        yield* Effect.fail(new Error(`Service '${name}' not found`))
      }
      
      yield* Ref.set(entry.status, "stopping")
      yield* entry.service.stop
      yield* Ref.set(entry.status, "stopped")
      yield* Effect.log(`Service '${name}' stopped successfully`)
    }),
    
    healthCheckService: (name: string) => Effect.gen(function* () {
      const entry = services.get(name)
      if (!entry) {
        yield* Effect.fail(new Error(`Service '${name}' not found`))
      }
      
      const health = yield* entry.service.healthCheck
      const status = yield* Ref.get(entry.status)
      
      return {
        ...health,
        status // Use our managed status
      }
    }),
    
    getAllServices: () => Array.from(services.keys())
  }
}

// Main demo program
const serviceDemo = Effect.gen(function* () {
  yield* Effect.log("🚀 Starting Complete Effect-based j8s Service Demo!")
  yield* Effect.log("📊 DevTools available at: http://localhost:34437")
  
  // Create services
  const webServer = new WebServerService()
  const database = new DatabaseService()
  const backup = new BackupService()
  
  // Create service registry
  const registry = createServiceRegistry()
  
  yield* Effect.log("📦 Registering services...")
  registry.addService(webServer)
  registry.addService(database)
  registry.addService(backup)
  
  yield* Effect.log("⚡ Starting services in dependency order...")
  
  // Start services in dependency order
  yield* registry.startService("database").pipe(
    Effect.withSpan("service-startup", {
      attributes: { serviceName: "database", order: 1 }
    })
  )
  
  yield* registry.startService("web-server").pipe(
    Effect.withSpan("service-startup", {
      attributes: { serviceName: "web-server", order: 2 }
    })
  )
  
  // Run backup as a one-time task
  yield* Effect.fork(registry.startService("backup")).pipe(
    Effect.withSpan("service-startup", {
      attributes: { serviceName: "backup", order: 3, type: "background" }
    })
  )
  
  yield* Effect.log("🔍 Monitoring services for 10 seconds...")
  
  // Monitor services for 10 seconds
  for (let i = 1; i <= 5; i++) {
    yield* Effect.sleep(Duration.seconds(2))
    
    yield* Effect.log(`📊 Health Check #${i}:`).pipe(
      Effect.withSpan("health-monitoring", {
        attributes: { checkNumber: i }
      })
    )
    
    // Check health of all services
    for (const serviceName of registry.getAllServices()) {
      const health = yield* registry.healthCheckService(serviceName).pipe(
        Effect.catchAll(() => Effect.succeed({
          status: "unhealthy" as const,
          details: { error: "Health check failed" },
          timestamp: new Date()
        }))
      )
      
      yield* Effect.log(`   ${serviceName}: ${health.status}`)
    }
  }
  
  yield* Effect.log("🔄 Testing service restart...")
  
  // Restart web server to show restart capabilities
  yield* registry.stopService("web-server").pipe(
    Effect.withSpan("service-restart", {
      attributes: { serviceName: "web-server", phase: "stop" }
    })
  )
  
  yield* Effect.sleep(Duration.seconds(1))
  
  yield* registry.startService("web-server").pipe(
    Effect.withSpan("service-restart", {
      attributes: { serviceName: "web-server", phase: "start" }
    })
  )
  
  yield* Effect.log("🛑 Graceful shutdown of all services...")
  
  // Graceful shutdown
  for (const serviceName of registry.getAllServices()) {
    yield* registry.stopService(serviceName).pipe(
      Effect.catchAll((error) =>
        Effect.log(`⚠️ Failed to stop ${serviceName}: ${error}`)
      ),
      Effect.withSpan("service-shutdown", {
        attributes: { serviceName }
      })
    )
  }
  
  yield* Effect.log("✨ Complete service demo finished!")
  yield* Effect.log("🎯 Check DevTools for detailed service traces and metrics")
  
}).pipe(
  Effect.withSpan("j8s-service-demo", {
    attributes: {
      demo: "complete-services",
      services: ["web-server", "database", "backup"],
      features: ["dependency-startup", "health-monitoring", "graceful-shutdown"]
    }
  })
)

// DevTools layer
const DevToolsLive = DevTools.layer()

// Run the demo
console.log("🚀 Effect-based j8s Complete Service Demo")
console.log("📊 DevTools will be available at: http://localhost:34437")
console.log("🔍 Open DevTools to see service orchestration in action!")
console.log("⏱️  Demo will run for about 20 seconds...")
console.log("")

serviceDemo.pipe(
  Effect.provide(DevToolsLive),
  NodeRuntime.runMain
)
