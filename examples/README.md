# j8s Examples

This directory contains comprehensive examples demonstrating j8s capabilities, from basic service management to advanced Effect-powered patterns.

## 🌟 What You'll Learn

- **Basic Service Management**: Traditional Promise-based service orchestration
- **Effect Integration**: Leveraging Effect for robust, type-safe service management
- **Advanced Error Handling**: Sophisticated retry policies and error recovery
- **Resource Management**: Automatic cleanup and resource leak prevention
- **Monitoring & Metrics**: Built-in service monitoring and performance tracking
- **Web UI**: React-based monitoring dashboard
- **Worker Threads**: Running services in isolated worker threads
- **Scheduled Jobs**: Cron-like scheduling for periodic tasks

## 📁 Examples Overview

### 🚀 Getting Started

#### 1. [`basic-effect-service.ts`](./basic-effect-service.ts)

**Basic Service Management with Effect Integration**

Learn the fundamentals of j8s with Effect:

- Traditional service creation and management
- Effect-based service operations (`startServiceEffect`, `stopServiceEffect`, etc.)
- Health checking with both Promise and Effect APIs
- Basic error handling patterns

```bash
bun run examples:basic
```

#### 2. [`demo.ts`](./demo.ts)

**Complete Service Management Demo**

A comprehensive demonstration of core j8s features:

- Multiple service types (main thread, worker thread)
- Service lifecycle management
- Health checks and monitoring
- Error handling and restart policies

```bash
bun run demo.ts
```

### 🔧 Advanced Patterns

#### 3. [`advanced-effect-patterns.ts`](./advanced-effect-patterns.ts)

**Advanced Effect Patterns for Production**

Explore sophisticated patterns for reliable service management:

- Retry logic with exponential backoff
- Timeout handling for long-running operations
- Concurrent service operations
- Resource management with automatic cleanup
- Service dependency handling

```bash
bun run examples:advanced
```

#### 4. [`effect-orchestration.ts`](./effect-orchestration.ts)

**Enterprise-Grade Service Orchestration**

Advanced patterns for production deployments:

- Service pipelines and workflows
- Event-driven service coordination
- Stream-based service processing
- System resilience and fault tolerance
- Complex dependency management

```bash
bun run examples:orchestration
```

#### 5. [`enhanced-usage-example.ts`](./enhanced-usage-example.ts)

**Enhanced Service Manager Features**

Demonstrate the full power of `EnhancedServiceManager`:

- Advanced retry policies
- Comprehensive monitoring and metrics
- Structured error handling
- Performance tracking
- Custom metrics integration

```bash
bun run enhanced-usage-example.ts
```

### 🛡️ Error Handling & Reliability

#### 6. [`restart-policy.ts`](./restart-policy.ts) & [`worker-restart-policy.ts`](./worker-restart-policy.ts)

**Service Restart Policies**

Learn about different restart strategies:

- `always`: Always restart services
- `on-failure`: Restart only on failure with retry limits
- `unless-stopped`: Keep services running unless manually stopped
- `no`: Don't restart automatically

```bash
bun run restart-policy.ts
bun run worker-restart-policy.ts
```

#### 7. [`restart.ts`](./restart.ts)

**Service Restart Strategies**

Advanced restart patterns and scenarios:

- Conditional restart based on health checks
- Coordinated restart of service dependencies
- Graceful shutdown handling

```bash
bun run restart.ts
```

### ⏰ Scheduling & Automation

#### 8. [`cron.ts`](./cron.ts)

**Scheduled Service Execution**

Implement cron-like scheduling for services:

- Daily, weekly, monthly schedules
- Custom interval scheduling
- Timeout handling for scheduled tasks
- Retry policies for scheduled jobs

```bash
bun run cron.ts
```

#### 9. [`effect-scheduling.ts`](./effect-scheduling.ts)

**Advanced Scheduling with Effect**

Effect-based scheduling patterns:

- Complex scheduling logic
- Dependent job scheduling
- Schedule composition and modification
- Error handling in scheduled tasks

```bash
bun run effect-scheduling.ts
```

### 🌐 Web Services & APIs

#### 10. [`rest-api.ts`](./rest-api.ts)

**REST API Integration**

Build and serve REST APIs for service management:

- OpenAPI documentation
- Interactive API explorer (Scalar)
- Service management endpoints
- Health check endpoints
- Metrics and monitoring endpoints

```bash
bun run rest-api.ts
```

### 👷 Worker Thread Services

#### 11. [`worker-with-data.ts`](./worker-with-data.ts)

**Worker Services with Custom Data**

Pass configuration and data to worker services:

- Worker data initialization
- Configuration management in workers
- Communication patterns between main and worker threads

```bash
bun run worker-with-data.ts
```

#### 12. [`worker-failure.ts`](./worker-failure.ts)

**Worker Service Failure Handling**

Handle worker service failures gracefully:

- Worker crash detection
- Automatic worker restart
- Error propagation and logging
- Worker health monitoring

```bash
bun run worker-failure.ts
```

## 🚀 Running the Examples

### Prerequisites

Ensure you have the required dependencies installed:

```bash
cd packages/j8s
bun install
```

### Running Individual Examples

```bash
# Basic service management
bun run examples:basic

# Advanced patterns
bun run examples:advanced

# Full orchestration
bun run examples:orchestration

# Enhanced features
bun run enhanced-usage-example.ts

# Other specific examples
bun run cron.ts
bun run rest-api.ts
bun run restart-policy.ts
```

### Running All Examples

```bash
# Run all core examples
bun run examples
```

## 🎯 Key j8s Concepts Demonstrated

### Service Management APIs

j8s provides both traditional and Effect-based APIs:

```typescript
// Traditional Promise-based APIs
await serviceManager.startService("my-service");
await serviceManager.stopService("my-service");
const health = await serviceManager.healthCheckService("my-service");

// Effect-based APIs (recommended for new code)
const program = Effect.gen(function* () {
  yield* serviceManager.startServiceEffect("my-service");
  yield* serviceManager.stopServiceEffect("my-service");
  const health = yield* serviceManager.healthCheckServiceEffect("my-service");
  return health;
});

await Effect.runPromise(program);
```

### Error Handling Patterns

```typescript
// Basic error handling
const result = await Effect.runPromise(
  Effect.either(serviceManager.startServiceEffect("flaky-service"))
);

if (result._tag === "Left") {
  console.log("Service failed:", result.left.message);
} else {
  console.log("Service started successfully");
}

// Advanced retry with custom policies
const withRetry = Effect.retry(
  serviceManager.startServiceEffect("unreliable-service"),
  RetryPolicies.exponentialBackoff({
    initialDelay: "100 millis",
    maxRetries: 5,
  })
);
```

### Resource Management

```typescript
// Automatic resource cleanup
const connection =
  yield *
  ResourceManager.acquireRelease(
    Effect.promise(() => createDatabaseConnection()),
    (conn) => Effect.promise(() => conn.close())
  );

// Use the connection with guaranteed cleanup
const result = yield * useConnection(connection);
```

### Monitoring & Metrics

```typescript
// Custom metrics tracking
Monitoring.Counter.inc("requests_processed");
Monitoring.Histogram.observe("response_time", latency);
Monitoring.Gauge.set("active_connections", count);

// Built-in service metrics
const metrics = await manager.getServiceMetrics("my-service");
console.log(`Uptime: ${metrics.uptime}`);
console.log(`Error rate: ${metrics.errorRate}`);
```

## 🛠️ Creating Your Own Services

### Traditional Service

```typescript
import { BaseService, ServiceManager } from "j8s";

class MyService extends BaseService {
  async start(): Promise<void> {
    console.log("Starting service...");
    // Your initialization logic
  }

  async stop(): Promise<void> {
    console.log("Stopping service...");
    // Your cleanup logic
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      status: "running",
      details: { version: "1.0.0" },
    };
  }
}

const manager = new ServiceManager();
const service = new MyService("my-service");
manager.addService(service, { restartPolicy: "always" });
await manager.startService(service);
```

### Effect-Powered Service

```typescript
import { BaseEffectService, EnhancedServiceManager } from "j8s";
import { Effect } from "effect";

class MyService extends BaseEffectService {
  startEffect = Effect.gen(function* () {
    yield* Effect.log("Starting service with Effect");
    // Your Effect-based business logic
    yield* Effect.sleep("1 second");
    return "Service started successfully";
  });

  healthCheckEffect = Effect.gen(function* () {
    return {
      status: "running" as const,
      details: { uptime: Date.now() },
    };
  });
}

const manager = new EnhancedServiceManager({
  retryPolicy: RetryPolicies.exponentialBackoff({
    initialDelay: "100 millis",
    maxRetries: 3,
  }),
});

const service = new MyService("my-effect-service");
await manager.addService(service);
await Effect.runPromise(manager.startServiceEffect("my-effect-service"));
```

## 📚 Best Practices

### 1. Choose the Right API

- **Use Traditional APIs** for simple services or when migrating existing code
- **Use Effect APIs** for new services, complex logic, or when you need advanced features

### 2. Implement Proper Error Handling

```typescript
class RobustService extends BaseEffectService {
  startEffect = Effect.gen(function* () {
    return yield* Effect.tryPromise({
      try: () => connectToExternalService(),
      catch: (error) =>
        new StructuredServiceError({
          type: ServiceErrorType.CONNECTION,
          message: "Failed to connect to external service",
          cause: error,
          retryable: true,
        }),
    });
  });
}
```

### 3. Use Resource Management

```typescript
class DatabaseService extends BaseEffectService {
  startEffect = Effect.gen(function* () {
    const pool = yield* ResourceManager.acquireRelease(
      Effect.promise(() => createConnectionPool()),
      (pool) => Effect.promise(() => pool.close())
    );

    return yield* useConnectionPool(pool);
  });
}
```

### 4. Monitor Your Services

```typescript
const manager = new EnhancedServiceManager({
  monitoring: {
    enableMetrics: true,
    healthCheckInterval: "30 seconds",
    customMetrics: {
      requestCount: Monitoring.Counter(),
      responseTime: Monitoring.Histogram(),
    },
  },
});
```

## 🤝 Contributing

Want to add more examples? Contributions are welcome! Please ensure examples:

1. Are well-documented with clear explanations
2. Demonstrate practical, real-world patterns
3. Include proper error handling
4. Follow Effect best practices
5. Are runnable with `bun run`

## 📝 License

These examples are part of the j8s project and follow the same license terms.

## 🚀 Next Steps

1. **Try the basic examples** to understand core concepts
2. **Explore advanced patterns** for production-ready code
3. **Read the main documentation** for comprehensive guides
4. **Check the migration guide** if upgrading from previous versions
5. **Experiment with the web UI** for service monitoring

Happy coding with j8s! 🎉
