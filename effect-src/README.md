# Effect-based j8s - Next-Generation Service Orchestrator

This is a complete rewrite of j8s using the [Effect](https://effect.website) TypeScript library, providing enhanced reliability, better error handling, and modern patterns for service orchestration.

## Key Improvements Over Original j8s

### 🔄 **Built-in Exponential Backoff**
- **Before**: Manual exponential backoff implementation
- **Now**: Effect's `Schedule.exponential()` with built-in jittering

```typescript
// Old way - manual implementation
const delay = Math.min(baseDelay * Math.pow(2, restartCount), maxDelay)

// New way - Effect's built-in scheduling
const schedule = Schedule.exponential("10 millis").pipe(
  Schedule.compose(Schedule.upTo("30 seconds")),
  Schedule.jittered()
)
```

### 📅 **Effect Cron Scheduling** 
- **Before**: External `cron` package dependency
- **Now**: Effect's built-in `Cron` module with DateTime support

```typescript
// Old way - string-based cron expressions
new CronJob("0 2 * * *", callback)

// New way - structured Effect Cron
const cron = Cron.make({
  seconds: [0],
  minutes: [0], 
  hours: [2],
  days: [],
  months: [],
  weekdays: [],
  tz: DateTime.zoneUnsafeMakeNamed("UTC")
})
```

### 🎯 **Structured Error Handling**
- **Before**: Try/catch with string errors  
- **Now**: Effect's typed error system with structured errors

```typescript
// Old way - untyped errors
try {
  await service.start()
} catch (error) {
  console.error("Service failed:", error)
}

// New way - typed Effect errors
const serviceEffect = service.start.pipe(
  Effect.catchTag("ServiceError", (error) => 
    Effect.log(`Service ${error.serviceName} failed: ${error.message}`)
  )
)
```

### 🧵 **Fiber-based Concurrency**
- **Before**: Promise-based concurrency with manual coordination
- **Now**: Effect's fiber system with built-in cancellation and resource safety

### 📊 **Built-in Observability**
- **Before**: Console logging only
- **Now**: Effect's tracing, metrics, and structured logging

### 🔧 **Service Layer Dependency Injection**
- **Before**: Manual service management
- **Now**: Effect's Context system for dependency injection

## Quick Start

### Basic Service Creation

```typescript
import { BaseEffectService, EffectJ8s } from "./index"

class MyService extends BaseEffectService {
  readonly start = Effect.gen(this, function* () {
    yield* Effect.log("Starting my service")
    yield* Effect.sleep("1 second")
    yield* Effect.log("Service ready")
  })

  readonly stop = Effect.gen(this, function* () {
    yield* Effect.log("Stopping service")
  })
}

// Or use the helper for simple cases
const quickService = EffectJ8s.createSimpleService(
  "quick-service",
  () => console.log("Started"),
  () => console.log("Stopped")
)
```

### Service with Automatic Retries

```typescript
import { Effect } from "effect"
import { EffectJ8s, BaseEffectService } from "./index"

class DatabaseService extends BaseEffectService {
  readonly start = Effect.gen(this, function* () {
    yield* Effect.tryPromise({
      try: () => this.connectToDatabase(),
      catch: (error) => new Error(`DB connection failed: ${error}`)
    }).pipe(
      // Built-in exponential backoff - no manual implementation!
      Effect.retry({
        schedule: EffectJ8s.retries.exponential()
      })
    )
  })
  
  private async connectToDatabase() {
    // Connection logic
  }
}
```

### Cron Job Service

```typescript
import { BaseEffectService, CronScheduling, createCronJob } from "./index"

const backupService = new BackupService("backup")
const cronConfig = createCronJob(
  CronScheduling.daily(2), // 2 AM daily
  Duration.minutes(30)     // 30 minute timeout
)

// Add to service manager with cron
manager.addService(backupService, { cronJob: cronConfig })
```

### Running the Service Manager

```typescript
import { Effect } from "effect"
import {
  EffectServiceManagerLive,
  EffectServiceManagerOperations,
  ObservabilityDev
} from "./index"

const runServices = Effect.gen(function* () {
  // Add services
  yield* EffectServiceManagerOperations.addServices([
    { service: myService, config: EffectJ8s.configs.alwaysRestart() },
    { service: dbService, config: EffectJ8s.configs.onFailure(5) }
  ])

  // Start health monitoring
  const manager = yield* Effect.service(IEffectServiceManager)
  yield* manager.startHealthMonitoring

  // Start all services
  yield* manager.startAllServices

  // Wait for healthy state
  yield* EffectServiceManagerOperations.waitForHealthy()

  // Graceful shutdown after work
  yield* EffectServiceManagerOperations.gracefulShutdown()
})

// Run with Effect layers
Effect.runFork(
  runServices.pipe(
    Effect.provide(EffectServiceManagerLive),
    Effect.provide(ObservabilityDev)
  )
)
```

## Key Features

### 🔄 **Smart Retry Policies**

```typescript
// Pre-built retry strategies
const retryPolicies = {
  exponential: EffectJ8s.retries.exponential(),
  fibonacci: EffectJ8s.retries.fibonacci(), 
  linear: EffectJ8s.retries.linear(),
  quick: EffectJ8s.retries.quick(),      // 3 retries, 100ms
  aggressive: EffectJ8s.retries.aggressive() // 10 retries, 50ms
}
```

### 📋 **Health Monitoring**

```typescript
// Automatic health monitoring with metrics
const healthConfig = {
  checkInterval: Duration.seconds(30),
  enableMetrics: true,
  enableAlerts: true
}

// Subscribe to health alerts
monitor.subscribeToAlerts((alert) => 
  Effect.log(`🚨 Alert: ${alert.type} for ${alert.serviceName}`)
)
```

### 🧵 **Worker Services**

```typescript
import { createEffectWorkerService } from "./index"

const workerService = createEffectWorkerService(
  "cpu-intensive-worker",
  new URL("./worker.ts", import.meta.url),
  {
    workerData: { config: { maxRetries: 5 } },
    autoTerminate: false
  }
)

// worker.ts
import { runExposeEffect, BaseEffectService } from "../index"

class WorkerTaskService extends BaseEffectService {
  readonly start = Effect.gen(this, function* () {
    // CPU-intensive work here
  })
}

runExposeEffect(new WorkerTaskService("worker"))
```

### 🌐 **REST API**

```typescript
import { createEffectAPI } from "./api/EffectAPI"
import { serve } from "@hono/node-server"

const api = await Effect.runPromise(
  createEffectAPI({
    enableMetrics: true,
    cors: { origin: ["http://localhost:3000"] }
  }).pipe(
    Effect.provide(EffectServiceManagerLive)
  )
)

serve({ fetch: api.fetch, port: 3000 })
```

## API Endpoints

- `GET /health` - Overall system health
- `GET /services` - List all services  
- `GET /services/:name` - Get service details
- `POST /services/:name/start` - Start a service
- `POST /services/:name/stop` - Stop a service
- `POST /services/:name/restart` - Restart a service
- `GET /services/:name/health` - Service health check
- `GET /metrics` - Prometheus-style metrics
- `POST /monitoring/start` - Start health monitoring
- `POST /monitoring/stop` - Stop health monitoring

## Examples

See the `examples/` directory for complete working examples:

- **basic-usage.ts** - Demonstrates core features and service lifecycle
- **worker-example.ts** - Shows worker thread management with Effect

Run examples:

```bash
npx tsx effect-src/examples/basic-usage.ts
npx tsx effect-src/examples/worker-example.ts
```

## Architecture

The Effect-based j8s is built with a layered architecture using Effect's Context system:

```
┌─────────────────────┐
│    API Layer        │ ← REST API with Hono
├─────────────────────┤
│  Service Manager    │ ← Orchestrates services with Effect
├─────────────────────┤
│  Service Registry   │ ← Manages service lifecycle  
├─────────────────────┤
│  Health Monitor     │ ← Monitors and alerts
├─────────────────────┤
│  Observability      │ ← Metrics, tracing, logging
├─────────────────────┤
│   Effect Runtime    │ ← Fiber concurrency, scheduling
└─────────────────────┘
```

## Key Achievements Over Original j8s

The Effect-based j8s represents a complete transformation from manual implementations to declarative, reliable patterns:

| **Feature** | **Original j8s** | **Effect-based j8s** | **Improvement** |
|-------------|------------------|----------------------|-----------------|
| **Retries** | Manual `Math.pow(2, count)` implementation | `Schedule.exponential()` with built-in jittering | ✅ Zero manual retry logic |
| **Concurrency** | Promise coordination with manual cleanup | Fiber-based with automatic cancellation | ✅ More efficient + resource safe |
| **Resources** | Manual cleanup in try/finally blocks | `Effect.ensuring()` automatic cleanup | ✅ Cleanup even on failures |
| **Scheduling** | External cron package dependency | Built-in Effect scheduling | ✅ No external dependencies |
| **Errors** | Untyped try/catch with string messages | Structured error types with context | ✅ Type-safe error handling |
| **Services** | Manual lifecycle management | Effect orchestration with dependency injection | ✅ Declarative service patterns |
| **Observability** | Console logs only | DevTools tracing + metrics + structured logging | ✅ Real-time observability |
| **State** | Manual coordination with race conditions | Fiber-safe `Ref` updates | ✅ Concurrent-safe state |

## Additional Benefits

1. **Zero manual retry logic** - Effect handles all retry patterns with built-in strategies
2. **Better error handling** - Typed errors with structured information and context
3. **Resource safety** - Automatic cleanup even on failures with `Effect.ensuring`
4. **Observability built-in** - DevTools tracing, metrics, and structured logging
5. **Type safety** - Full TypeScript support with Effect's powerful type system
6. **Composability** - Services can be easily composed, tested, and reasoned about
7. **Performance** - Fiber-based concurrency is more efficient than Promise chains
8. **Maintenance** - Cleaner, more declarative code with Effect's functional patterns

## Migration from Original j8s

The Effect-based j8s maintains API compatibility while providing enhanced features:

```typescript
// Old j8s service
class OldService extends BaseService {
  async start() {
    console.log("Starting...")
  }
}

// New Effect-based service  
class NewService extends BaseEffectService {
  readonly start = Effect.gen(this, function* () {
    yield* Effect.log("Starting...")
  })
}
```

Services can be gradually migrated to take advantage of Effect's features while maintaining compatibility with existing code.

## Contributing

This Effect-based implementation demonstrates the power of functional programming patterns for reliable service orchestration. Contributions are welcome to extend features and improve the implementation.
