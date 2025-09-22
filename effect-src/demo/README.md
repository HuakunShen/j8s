# Effect-based j8s Demo Applications

This directory contains comprehensive demo applications showcasing the Effect-based j8s service orchestrator with DevTools integration for enhanced observability.

## 🚀 Quick Start

### Prerequisites

Make sure you have the required dependencies:

```bash
cd effect-src/demo
npm install
```

### Running the Demos

#### Basic Service Demo
```bash
npm run demo
```

This demonstrates:
- ✅ Multiple service types (web server, database, backup)
- ✅ Built-in exponential backoff (no manual implementation)
- ✅ Effect Cron scheduling (replaces cron package)
- ✅ Structured error handling with Effect
- ✅ Health monitoring with metrics
- ✅ Graceful shutdown with resource safety

#### Worker Services Demo
```bash
npm run demo:worker
```

This showcases:
- ✅ CPU-intensive worker simulation
- ✅ I/O worker for file processing
- ✅ Network worker for API calls
- ✅ Worker health monitoring
- ✅ Automatic retry policies per worker type
- ✅ Worker resilience testing

#### Run Both Demos Concurrently
```bash
npm run demo:both
```

## 📊 DevTools Integration

Both demos include Effect DevTools integration:

1. **Start any demo** - DevTools will automatically be available
2. **Open your browser** to `http://localhost:34437`
3. **Explore real-time traces** and performance metrics
4. **Monitor service lifecycle** events and errors

### DevTools Features Showcased

- 🔍 **Real-time tracing** of all service operations
- 📊 **Performance metrics** for each service
- 🎯 **Span attributes** with detailed context
- 🚨 **Error tracking** with full stack traces
- ⚡ **Fiber management** visualization
- 📈 **Health check monitoring**

## 🎯 Demo Highlights

### Basic Demo Features

**Service Types:**
- **WebServerService** - Simulates HTTP server with request processing
- **DatabaseService** - Connection management with automatic reconnection
- **BackupService** - Scheduled backups using Effect Cron
- **MonitoringService** - Simple service using helper functions

**Effect Features Demonstrated:**
```typescript
// Built-in exponential backoff
Effect.retry({
  schedule: EffectJ8s.retries.exponential()
})

// Effect Cron scheduling  
createCronJob(
  CronScheduling.everyMinutes(0.5), // Every 30 seconds
  Duration.seconds(10) // Timeout
)

// Structured error handling
Effect.tryPromise({
  try: () => this.connect(),
  catch: (error) => new Error(`Connection failed: ${error}`)
})

// Tracing with attributes
Effect.withSpan("database.connect", {
  attributes: { host: "localhost", database: "demo_db" }
})
```

### Worker Demo Features

**Worker Types:**
- **CPUIntensiveWorker** - Mathematical calculations with task queue
- **IOWorker** - File processing simulation
- **NetworkWorker** - API calls with network retry logic

**Advanced Patterns:**
```typescript
// Fiber-safe state management
private readonly taskQueue = Ref.unsafeMake<number[]>([])

// Different retry policies per worker type
{
  service: cpuWorker,
  config: {
    restartPolicy: "on-failure",
    retrySchedule: EffectJ8s.retries.exponential()
  }
},
{
  service: ioWorker,
  config: {
    restartPolicy: "always",
    retrySchedule: EffectJ8s.retries.linear()
  }
}
```

## 📈 Observability Examples

### Tracing Output
```
📦 Adding services to registry...
🔍 Starting health monitoring...
⚡ Starting services in dependency order...
📈 Health Check #1:
   System Status: healthy
   Services: 3 healthy, 0 unhealthy
   database: running
   web-server: running
   monitoring: running
```

### DevTools Traces
- Service startup spans with timing
- Health check operations with results
- Retry attempts with backoff visualization
- Worker task processing with queue metrics
- Error propagation with structured context

## 🛠️ Customization

### Adding Custom Services

```typescript
class MyCustomService extends BaseEffectService {
  readonly start = Effect.gen(this, function* () {
    yield* Effect.log("Starting my service...")
    // Your service logic here
  }).pipe(
    ServiceTracing.traceServiceOperation("start", this.name),
    Effect.withSpan("my-service.start", {
      attributes: { customAttribute: "value" }
    })
  )
}
```

### Custom Retry Policies

```typescript
const customRetry = Schedule.exponential("50 millis").pipe(
  Schedule.compose(Schedule.recurs(5)),
  Schedule.jittered()
)

// Use in service config
{
  service: myService,
  config: { retrySchedule: customRetry }
}
```

### Custom Health Checks

```typescript
readonly healthCheck = Effect.gen(this, function* () {
  const customMetrics = yield* this.gatherMetrics()
  
  return {
    status: customMetrics.isHealthy ? "running" as const : "unhealthy" as const,
    details: {
      ...customMetrics,
      customField: "custom value"
    },
    timestamp: new Date()
  }
}).pipe(
  ServiceTracing.traceHealthCheck(this.name)
)
```

## 🔧 Development

### Watch Mode
```bash
npm run dev
```

### Adding New Demos

1. Create new `.ts` file in `demo/` directory
2. Import Effect-based j8s components
3. Add DevTools integration:
   ```typescript
   const DevToolsLive = DevTools.layer()
   
   myDemo.pipe(
     Effect.provide(DevToolsLive),
     NodeRuntime.runMain
   )
   ```
4. Add script to `package.json`

## 📚 Learning Resources

These demos showcase the transformation from manual service management to Effect's declarative approach:

- **Before**: Manual exponential backoff implementation
- **After**: `Schedule.exponential().jittered()`

- **Before**: External cron package with string expressions  
- **After**: Effect's structured `Cron.make()` with timezone support

- **Before**: Untyped Promise chains with try/catch
- **After**: Typed Effects with structured error handling

- **Before**: Manual state coordination
- **After**: Fiber-safe `Ref` and automatic resource cleanup

The demos provide hands-on experience with Effect's powerful patterns for building reliable, observable service orchestration systems.
