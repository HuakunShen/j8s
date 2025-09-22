# 🚀 Effect-based j8s Demo Guide with DevTools

Welcome to the comprehensive demo of the Effect-based j8s service orchestrator! This guide shows you how to run the demos with Effect DevTools for enhanced observability.

## 📊 **Effect DevTools Integration**

All demos include Effect DevTools which provides:
- 🔍 **Real-time tracing** of all operations
- 📈 **Performance metrics** and timing
- 🎯 **Span visualization** with detailed attributes  
- 🚨 **Error tracking** with full context
- ⚡ **Fiber management** monitoring
- 📊 **Service health** visualization

**DevTools URL**: `http://localhost:34437`

## 🎯 **Quick Start**

### Option 1: Interactive Demo Runner
```bash
cd effect-src/demo
./test-run.sh
```

Choose from:
1. **Quick DevTools Demo** (5 minutes) - Core Effect features
2. **Basic Service Demo** (10 minutes) - Full service orchestration  
3. **Worker Services Demo** (8 minutes) - Worker thread management
4. **All Demos** - Run everything concurrently

### Option 2: Direct Demo Execution

```bash
cd effect-src/demo
bun install

# Quick DevTools demo
tsx run-demo.ts

# Basic service orchestration
tsx basic-demo.ts  

# Worker services
tsx worker-demo.ts

# All demos concurrently
npm run demo:both
```

## 🌟 **Demo Highlights**

### **Quick DevTools Demo** (`run-demo.ts`)
Showcases core Effect features that replace manual j8s implementations:

**🔄 Built-in Exponential Backoff**
```typescript
// OLD: Manual implementation
const delay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay)

// NEW: Effect's built-in scheduling
Effect.retry({
  schedule: Schedule.exponential("100 millis")
    |> Schedule.compose(Schedule.recurs(5))
    |> Schedule.jittered()
})
```

**🧵 Fiber-based Concurrency**
```typescript
// Automatic resource cleanup and cancellation
Effect.all([task1, task2, task3], { concurrency: "unbounded" })
```

**🛡️ Resource Safety**
```typescript
// Automatic cleanup even on failures
Effect.ensuring(cleanupEffect)
```

**⏰ Built-in Scheduling**
```typescript
// Replaces cron package
Effect.repeat({
  schedule: Schedule.spaced("2 seconds")
})
```

### **Basic Service Demo** (`basic-demo.ts`)
Complete service orchestration with:

- **WebServerService** - HTTP server simulation with request processing
- **DatabaseService** - Connection management with automatic reconnection  
- **BackupService** - Scheduled backups using Effect Cron
- **MonitoringService** - Simple service using helper functions

**Key Features:**
- ✅ Dependency-ordered startup
- ✅ Health monitoring with alerts
- ✅ Automatic restart policies
- ✅ Graceful shutdown with resource safety
- ✅ Built-in retry mechanisms
- ✅ Comprehensive tracing

### **Worker Services Demo** (`worker-demo.ts`)
Advanced worker thread management:

- **CPUIntensiveWorker** - Mathematical calculations with task queue
- **IOWorker** - File processing simulation  
- **NetworkWorker** - API calls with network retry logic

**Advanced Patterns:**
- ✅ Fiber-safe state management with `Ref`
- ✅ Different retry policies per worker type
- ✅ Worker health monitoring
- ✅ Queue management with Effect
- ✅ Resilience testing

## 📊 **DevTools Experience**

### **Opening DevTools**
1. Start any demo
2. Open browser to `http://localhost:34437`
3. Explore real-time traces and metrics

### **Key DevTools Features**

**🔍 Tracing View**
- See all service operations in real-time
- Expand spans to see detailed timing
- View span attributes and context
- Track error propagation

**📈 Performance Metrics**
- Service startup times
- Health check durations  
- Retry attempt patterns
- Worker task processing rates

**🎯 Span Attributes**
```typescript
Effect.withSpan("database.connect", {
  attributes: {
    host: "localhost",
    database: "demo_db",
    connectionPool: 10
  }
})
```

**⚡ Fiber Management**
- See concurrent operations
- Monitor fiber lifecycle
- Track resource cleanup
- Visualize cancellation

## 🎯 **Key Achievements: Before vs After**

The Effect-based j8s represents a complete architectural transformation:

| **Feature** | **Original j8s** | **Effect-based j8s** | **Improvement** |
|-------------|------------------|----------------------|-----------------|
| **Retries** | Manual `Math.pow(2, count)` implementation | `Schedule.exponential().jittered()` | ✅ Built-in retry patterns with jittering |
| **Cron** | External `cron` package dependency | Built-in `Cron.make()` with timezone support | ✅ No external dependencies needed |
| **Errors** | Untyped try/catch with string messages | Structured error types with full context | ✅ Type-safe error handling |
| **State** | Manual coordination with race conditions | Fiber-safe `Ref` updates | ✅ Concurrent-safe state management |
| **Observability** | Console logs only | DevTools tracing + metrics + spans | ✅ Real-time observability at localhost:34437 |
| **Concurrency** | Promise chains with manual coordination | Fiber-based with automatic cancellation | ✅ More efficient + resource safe |
| **Resources** | Manual cleanup in try/finally blocks | Automatic cleanup with `Effect.ensuring` | ✅ Guaranteed cleanup even on failures |
| **Services** | Manual lifecycle management | Effect orchestration with dependency injection | ✅ Declarative service patterns |

## 🚀 **Running Your First Demo**

### Step 1: Start the Demo
```bash
cd effect-src/demo
tsx run-demo.ts
```

### Step 2: Open DevTools
Navigate to `http://localhost:34437` in your browser

### Step 3: Watch the Magic
- See exponential backoff in action
- Monitor fiber-based concurrency  
- Track resource safety patterns
- Observe structured error handling

### Step 4: Explore Advanced Demos
```bash
# Full service orchestration
tsx basic-demo.ts

# Worker services with queues
tsx worker-demo.ts
```

## 🛠️ **Customizing Demos**

### Adding Custom Services
```typescript
class MyService extends BaseEffectService {
  readonly start = Effect.gen(this, function* () {
    yield* Effect.log("Starting my service...")
    // Your logic here
  }).pipe(
    ServiceTracing.traceServiceOperation("start", this.name),
    Effect.withSpan("my-service.start", {
      attributes: { version: "1.0.0" }
    })
  )
}
```

### Custom Retry Policies
```typescript
const customRetry = Schedule.fibonacci("100 millis")
  |> Schedule.compose(Schedule.recurs(10))
  |> Schedule.jittered()
```

### Enhanced Tracing
```typescript
Effect.withSpan("custom.operation", {
  attributes: {
    userId: "123",
    operation: "data-processing",
    batchSize: 100
  }
})
```

## 🎯 **What You'll Learn**

1. **Effect's Power**: See how Effect eliminates manual implementations
2. **Observability**: Experience real-time tracing and metrics
3. **Reliability**: Witness automatic retry and resource safety
4. **Performance**: Monitor fiber-based concurrency benefits
5. **Maintainability**: Observe structured error handling
6. **Composability**: See how services compose naturally

## 🚀 **Next Steps**

After running the demos:

1. **Explore DevTools** - Dive deep into traces and metrics
2. **Modify Services** - Add your own custom services
3. **Experiment** - Try different retry policies and configurations
4. **Build** - Create your own Effect-based services
5. **Deploy** - Use the patterns in production systems

## 🎉 **Ready to Start?**

```bash
cd effect-src/demo
./test-run.sh
```

Then open `http://localhost:34437` and experience the future of service orchestration with Effect! 🚀

---

**The demos showcase how Effect transforms service orchestration from manual, error-prone implementations to declarative, reliable, and observable systems.** ✨
