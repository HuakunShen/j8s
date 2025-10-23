# j8s - Effect-Powered Service Orchestrator

https://jsr.io/@hk/j8s

A production-ready service orchestration framework for JavaScript/TypeScript, built on [Effect](https://effect.website/) for unparalleled reliability, structured concurrency, and robust error handling.

## ✨ Key Features

### 🚀 Effect-Powered Core

- **Full Effect Integration**: Built entirely on [effect-ts](https://github.com/Effect-TS/effect) for type-safe, composable service management
- **Structured Concurrency**: Automatic resource management and cleanup guarantees
- **Sophisticated Error Handling**: Comprehensive retry policies, circuit breakers, and error recovery
- **Type Safety**: End-to-end type safety with Effect's powerful type system

### 🛡️ Production Reliability

- **Automatic Retry Policies**: Exponential backoff, fixed delay, and progressive retry strategies
- **Circuit Breaker Patterns**: Built-in fault tolerance and failure recovery
- **Resource Management**: Automatic cleanup prevents resource leaks
- **Health Monitoring**: Built-in health checks and performance metrics

### 🎯 Developer Experience

- **Dual API Support**: Both traditional Promise-based and Effect-based APIs
- **Familiar Patterns**: Class-based `IService` interface for easy adoption
- **Web UI**: Built-in React UI for service monitoring and management
- **REST API**: Full REST API with OpenAPI documentation and interactive docs

### ⚡ Performance & Scalability

- **Worker Thread Support**: Run services in isolated worker threads
- **Concurrent Execution**: Efficient parallel service operations
- **Scheduled Jobs**: Built-in cron-like scheduling for periodic tasks
- **Lightweight**: Minimal overhead with maximum reliability

## 🏗️ Architecture

j8s uses a **layered Effect-based architecture** that provides maximum reliability while maintaining developer familiarity:

```
┌─────────────────────────────────────────┐
│          Service Management             │
│    (Traditional Promise-based API)      │
├─────────────────────────────────────────┤
│         Effect Integration Layer        │
│   (EnhancedServiceManager & Utils)     │
├─────────────────────────────────────────┤
│           Effect Runtime               │
│    (Structured Concurrency & Error     │
│     Handling, Retry Policies, etc.)     │
└─────────────────────────────────────────┘
```

### Key Components

- **BaseService**: Familiar class-based service interface
- **ServiceManager**: Traditional service management with Promise APIs
- **EnhancedServiceManager**: Effect-powered service management with advanced features
- **EffectUtils**: Comprehensive utilities for retry, resource management, and monitoring
- **EnhancedServiceAdapter**: Bridge between traditional and Effect-based services
- **Web UI**: React-based monitoring and management interface

## 🚀 Quick Start

### Installation

```bash
npm install j8s effect
# or
bun install j8s effect
# or
pnpm add j8s effect
```

### Basic Service (Traditional API)

```typescript
import { BaseService, ServiceManager } from "j8s";

class MyService extends BaseService {
  async start(): Promise<void> {
    console.log("Service started");
  }

  async stop(): Promise<void> {
    console.log("Service stopped");
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return { status: "running" };
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

class MyEffectService extends BaseEffectService {
  // Effect-based start method with automatic retry
  startEffect = Effect.gen(function* () {
    yield* Effect.log("Starting service");
    // Your Effect-based business logic here
    yield* Effect.sleep("1 second");
    return "Service started";
  });

  // Effect-based health check with monitoring
  healthCheckEffect = Effect.gen(function* () {
    return { status: "running" as const };
  });
}

const manager = new EnhancedServiceManager();
const service = new MyEffectService("my-effect-service");
await manager.addService(service);
await Effect.runPromise(manager.startAllServicesEffect());
```

### Advanced Features

#### Retry Policies & Error Handling

```typescript
import { EnhancedServiceManager, RetryPolicies } from "j8s";
import { Effect, Schedule } from "effect";

const manager = new EnhancedServiceManager({
  retryPolicy: RetryPolicies.exponentialBackoff({
    initialDelay: "100 millis",
    maxDelay: "30 seconds",
    maxRetries: 5,
  }),
  // Enable comprehensive error handling
  errorHandling: {
    logErrors: true,
    captureErrors: true, // Sentry integration
    retryOnFailure: true,
  },
});

// Service with sophisticated error recovery
class RobustService extends BaseEffectService {
  startEffect = Effect.gen(function* () {
    // Automatically retries on failure with exponential backoff
    yield* Effect.tryPromise({
      try: () => connectToDatabase(),
      catch: (error) => new DatabaseConnectionError(error),
    });
  });
}
```

#### Resource Management

```typescript
import { ResourceManager } from "j8s";
import { Effect } from "effect";

class DatabaseService extends BaseEffectService {
  startEffect = Effect.gen(function* () {
    // Automatic resource acquisition and cleanup
    const connection = yield* ResourceManager.acquireRelease(
      Effect.promise(() => createDatabaseConnection()),
      (conn) => Effect.promise(() => conn.close())
    );

    // Use the connection with automatic cleanup
    return yield* useConnection(connection);
  });
}
```

#### Monitoring & Metrics

```typescript
import { EnhancedServiceManager, Monitoring } from "j8s";

const manager = new EnhancedServiceManager({
  monitoring: {
    enableMetrics: true,
    healthCheckInterval: "30 seconds",
    performanceTracking: true,
    customMetrics: {
      requestCount: Monitoring.Counter(),
      responseTime: Monitoring.Histogram(),
    },
  },
});

// Access service metrics
const metrics = await manager.getServiceMetrics("my-service");
console.log(`Uptime: ${metrics.uptime}`);
console.log(`Error rate: ${metrics.errorRate}`);
```

## 🌐 Web UI

j8s includes a built-in React web UI for monitoring and managing services:

```typescript
import { createServiceManagerUI } from "j8s";
import { serve } from "@hono/node-server";

const manager = new EnhancedServiceManager();
// Add your services...

// Create and serve the web UI
const { app, ui } = createServiceManagerUI(manager, {
  title: "Service Dashboard",
  theme: "dark",
  enableMetrics: true,
  refreshInterval: 5000,
});

serve({
  fetch: app.fetch,
  port: 3000,
});

console.log("Web UI available at http://localhost:3000");
```

**Web UI Features:**

- Real-time service status monitoring
- Service start/stop/restart controls
- Health check results and metrics
- Error logs and debugging information
- Performance charts and statistics
- Responsive design for mobile and desktop

## 🔌 REST API

j8s provides a comprehensive REST API with automatic OpenAPI documentation:

```typescript
import { serve } from "@hono/node-server";
import { EnhancedServiceManager, createServiceManagerAPI } from "j8s";

const manager = new EnhancedServiceManager();
// Add services...

const app = createServiceManagerAPI(manager, {
  openapi: {
    enabled: true,
    info: {
      title: "j8s Service Manager API",
      version: "1.0.0",
    },
  },
  scalar: {
    enabled: true,
    theme: "deepSpace",
  },
});

serve({ fetch: app.fetch, port: 3000 });
```

**Available Endpoints:**

- `GET /services` - List all services with status
- `GET /services/:name` - Get detailed service information
- `GET /services/:name/health` - Get service health status
- `GET /services/:name/metrics` - Get service performance metrics
- `POST /services/:name/start` - Start a service
- `POST /services/:name/stop` - Stop a service
- `POST /services/:name/restart` - Restart a service
- `POST /services/start-all` - Start all services
- `POST /services/stop-all` - Stop all services
- `GET /health` - Get system-wide health status

## 📊 Worker Thread Services

Run services in isolated worker threads for better performance and security:

```typescript
import { createWorkerService, EnhancedServiceManager } from "j8s";

// Create a worker service
const workerService = createWorkerService(
  "worker-service",
  new URL("./worker.ts", import.meta.url),
  {
    workerData: {
      config: { maxRetries: 5, timeout: 1000 },
      apiKey: "your-api-key",
    },
    restartPolicy: "on-failure",
    maxRetries: 3,
  }
);

const manager = new EnhancedServiceManager();
await manager.addService(workerService);
await manager.startService("worker-service");
```

**Worker Service Implementation:**

```typescript
// worker.ts
import { expose } from "j8s";
import type { IService, HealthCheckResult } from "j8s";
import { workerData } from "worker_threads";

class WorkerService implements IService {
  name = "worker-service";
  private config = workerData?.config || {};
  private running = false;

  async start(): Promise<void> {
    console.log("Worker started with config:", this.config);
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      status: this.running ? "running" : "stopped",
      details: { config: this.config },
    };
  }
}

expose(new WorkerService());
```

## ⏰ Scheduled Services

Schedule services to run at specific intervals using cron expressions:

```typescript
import { BaseEffectService, EnhancedServiceManager } from "j8s";
import { Schedule, Duration } from "effect";

class BackupService extends BaseEffectService {
  startEffect = Effect.gen(function* () {
    console.log("Running backup...");
    yield* Effect.sleep("2 seconds");
    console.log("Backup completed");
  });
}

const manager = new EnhancedServiceManager();
const service = new BackupService("backup-service");

await manager.addService(service, {
  scheduledJob: {
    schedule: Schedule.cron("0 2 * * *"), // Run at 2 AM daily
    timeout: Duration.minutes(30), // 30 minute timeout
    retryPolicy: RetryPolicies.fixedDelay({
      delay: "5 minutes",
      maxRetries: 3,
    }),
  },
});
```

## 🛡️ Advanced Error Handling

j8s provides comprehensive error handling with structured error types:

```typescript
import {
  EnhancedServiceManager,
  ServiceErrorType,
  StructuredServiceError,
} from "j8s";

class ResilientService extends BaseEffectService {
  startEffect = Effect.gen(function* () {
    return yield* Effect.tryPromise({
      try: () => connectToExternalService(),
      catch: (error) =>
        new StructuredServiceError({
          type: ServiceErrorType.CONNECTION,
          message: "Failed to connect to external service",
          cause: error,
          retryable: true,
          context: { service: "external-api" },
        }),
    });
  });
}
```

**Error Types:**

- `CONNECTION`: Network connection failures
- `TIMEOUT`: Operation timeout errors
- `VALIDATION`: Input validation errors
- `PERMISSION`: Authorization/permission errors
- `RESOURCE`: Resource exhaustion errors
- `UNKNOWN`: Uncategorized errors

## 🔧 Configuration Options

### EnhancedServiceManager Configuration

```typescript
interface EnhancedServiceManagerConfig {
  // Retry policies for all services
  retryPolicy?: Schedule.Schedule<unknown>;

  // Error handling configuration
  errorHandling?: {
    logErrors?: boolean;
    captureErrors?: boolean; // Sentry integration
    retryOnFailure?: boolean;
    maxRetries?: number;
  };

  // Monitoring and metrics
  monitoring?: {
    enableMetrics?: boolean;
    healthCheckInterval?: Duration.DurationInput;
    performanceTracking?: boolean;
    customMetrics?: Record<string, Monitoring.Metric>;
  };

  // Resource management
  resourceManagement?: {
    enableLeakDetection?: boolean;
    cleanupTimeout?: Duration.DurationInput;
  };

  // Concurrency control
  concurrency?: {
    maxConcurrentOperations?: number;
    queueSize?: number;
  };
}
```

## 📈 Monitoring & Observability

### Built-in Metrics

j8s automatically tracks key metrics for all services:

- **Uptime**: Service running time
- **Error Rate**: Failed operations percentage
- **Response Time**: Operation latency
- **Memory Usage**: Service memory consumption
- **CPU Usage**: Service CPU utilization
- **Health Check Results**: Historical health data

### Custom Metrics

```typescript
import { Monitoring, EnhancedServiceManager } from "j8s";

const manager = new EnhancedServiceManager({
  monitoring: {
    customMetrics: {
      // Counter for tracking events
      requestCount: Monitoring.Counter(),

      // Histogram for tracking values
      responseTime: Monitoring.Histogram({
        buckets: [10, 50, 100, 500, 1000],
      }),

      // Gauge for tracking current values
      activeConnections: Monitoring.Gauge(),
    },
  },
});

// Update metrics in your service
Monitoring.Counter.inc("requestCount");
Monitoring.Histogram.observe("responseTime", 150);
Monitoring.Gauge.set("activeConnections", 42);
```

### Service-Owned Observability

j8s supports services defining their own observability layers through the `IService` interface:

```typescript
import { BaseService, ServiceManager } from "j8s";
import { Layer } from "effect";
import * as Otlp from "@effect/opentelemetry/Otlp";
import * as FetchHttpClient from "@effect/platform/FetchHttpClient";

class MyService extends BaseService {
  readonly observabilityLayer: Layer.Layer<never, never, never>;

  constructor(name: string, otlpBaseUrl: string = "http://localhost:4318") {
    super(name);
    
    // Service owns its observability layer
    this.observabilityLayer = Otlp.layer({
      baseUrl: otlpBaseUrl,
      resource: {
        serviceName: "my-service",
        serviceVersion: "1.0.0",
        attributes: {
          "service.namespace": "my-app",
          "service.instance.id": String(process.pid),
          "deployment.environment": process.env.NODE_ENV ?? "development",
        },
      },
    }).pipe(Layer.provide(FetchHttpClient.layer));
  }

  async start(): Promise<void> {
    // j8s automatically applies the observabilityLayer
    console.log("Service started with observability");
  }

  async stop(): Promise<void> {
    console.log("Service stopped");
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return { status: "running" };
  }
}

const manager = new ServiceManager();
const service = new MyService("my-service", "http://localhost:4318");

// Just add the service - it brings its own observability!
manager.addService(service, { restartPolicy: "always" });
await manager.startServiceEffect("my-service");
```

This approach provides:
- **Encapsulation**: Services own their observability configuration
- **Simplicity**: No external setup needed after service creation
- **Type Safety**: Compile-time verification of observability layers
- **Testability**: Easy to inject mock layers for testing
- **Consistency**: Same pattern for all services

## 🧪 Testing

j8s is thoroughly tested with comprehensive test coverage:

```bash
# Run all tests
npm test
# or
bun test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e
```

**Test Coverage:**

- Unit tests for all core components
- Integration tests for service lifecycle
- Error handling and recovery tests
- Performance and load tests
- Worker thread communication tests

## 📚 API Reference

### Core Classes

#### BaseService

Traditional service base class with Promise-based methods.

#### BaseEffectService

Effect-powered service base class with Effect-based methods.

#### ServiceManager

Traditional service manager with Promise-based API.

#### EnhancedServiceManager

Advanced service manager with Effect integration, monitoring, and enhanced features.

### Key Interfaces

#### IService

```typescript
interface IService {
  name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  healthCheck(): Promise<HealthCheckResult>;
}
```

#### IEffectService

```typescript
interface IEffectService {
  name: string;
  startEffect: Effect<void, Error>;
  stopEffect: Effect<void, Error>;
  healthCheckEffect: Effect<HealthCheckResult, Error>;
}
```

### Effect Utilities

#### RetryPolicies

- `exponentialBackoff(options)` - Exponential backoff retry
- `fixedDelay(options)` - Fixed delay retry
- `progressiveBackoff(options)` - Progressive retry strategies

#### ResourceManager

- `acquireRelease(acquire, release)` - Resource management with cleanup
- `withTimeout(effect, timeout)` - Timeout handling for operations

#### Monitoring

- `Counter()` - Event counting metric
- `Histogram(options)` - Value distribution metric
- `Gauge()` - Current value metric

## 🔄 Migration Guide

### From j8s 0.1.x to 0.2.x

The migration is straightforward with full backward compatibility:

```typescript
// Before (0.1.x)
const manager = new ServiceManager();

// After (0.2.x) - still works
const manager = new ServiceManager();

// Or use the enhanced version
const enhancedManager = new EnhancedServiceManager();
```

**Key Changes:**

- Added Effect-based APIs alongside existing Promise APIs
- Enhanced error handling and retry policies
- Added monitoring and metrics capabilities
- Improved performance and reliability

## 🤝 Contributing

Contributions are welcome! Please see our [contributing guidelines](./CONTRIBUTING.md) for details.

### Development Setup

```bash
# Clone the repository
git clone <repository-url>
cd packages/j8s

# Install dependencies
bun install

# Run development server
bun run dev

# Run tests
bun test

# Build the package
bun run build
```

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Effect](https://effect.website/) for the powerful functional programming foundation
- [Hono](https://hono.dev/) for the fast web framework
- [Valibot](https://valibot.dev/) for schema validation
- [Scalar](https://scalar.com/) for API documentation

---

**Built with ❤️ for reliable service orchestration**
