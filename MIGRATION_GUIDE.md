# j8s Effect-Based Migration Guide

This guide provides a comprehensive overview of migrating from the original Promise-based j8s to the new Effect-based architecture.

## 🚀 Why Migrate to Effect-Based j8s?

### Key Benefits:

- **Type Safety**: Full TypeScript integration with typed errors and effects
- **Structured Concurrency**: Better handling of async operations and resource management
- **Service Discovery**: Built-in multi-instance support with load balancing
- **Health Monitoring**: Comprehensive health check system
- **Retry & Resilience**: Configurable retry policies with rate limiting
- **Observability**: Structured logging and OpenTelemetry integration
- **Testing**: Built-in testing utilities and mocking capabilities

## 📋 Migration Checklist

- [ ] Update TypeScript to support Effect types
- [ ] Replace Promise-based services with Effect-based services
- [ ] Update service manager to use EffectServiceManager
- [ ] Add service discovery for multi-instance support
- [ ] Implement health check monitoring
- [ ] Add retry policies for resilience
- [ ] Update logging to use structured logging
- [ ] Add load balancing for scalability
- [ ] Update worker services to use EffectWorkerService
- [ ] Add comprehensive testing

## 🔧 Basic Migration Steps

### 1. Service Migration

**Before (Promise-based):**

```typescript
class MyService extends BaseService {
  async start(): Promise<void> {
    console.log("Starting service...");
    // Your logic here
  }

  async stop(): Promise<void> {
    console.log("Stopping service...");
    // Your logic here
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      status: "healthy",
      timestamp: Date.now(),
      details: {},
    };
  }
}
```

**After (Effect-based):**

```typescript
import { EffectBaseService } from "./effect-src";

class MyService extends EffectBaseService {
  protected doStart(): Effect.Effect<void> {
    return Effect.sync(() => {
      console.log("Starting service...");
      // Your logic here
    });
  }

  protected doStop(): Effect.Effect<void> {
    return Effect.sync(() => {
      console.log("Stopping service...");
      // Your logic here
    });
  }

  protected doHealthCheck(): Effect.Effect<HealthCheckResult> {
    return Effect.sync(() => ({
      status: "healthy",
      timestamp: Date.now(),
      details: {},
    }));
  }
}
```

### 2. Service Manager Migration

**Before:**

```typescript
const manager = new ServiceManager();
await manager.startService("my-service");
const health = await manager.healthCheckService("my-service");
```

**After:**

```typescript
import { EffectServiceManager } from "./effect-src";

const manager = new EffectServiceManager();
await Effect.runPromise(manager.startService("my-service"));
const health = await Effect.runPromise(
  manager.healthCheckService("my-service")
);
```

### 3. Adding Retry Policies

**Before:**

```typescript
// Manual retry logic
let attempts = 0;
const maxRetries = 3;
while (attempts < maxRetries) {
  try {
    await riskyOperation();
    break;
  } catch (error) {
    attempts++;
    if (attempts >= maxRetries) throw error;
    await new Promise((resolve) => setTimeout(resolve, 1000 * attempts));
  }
}
```

**After:**

```typescript
import { retryExponential } from "./effect-src";

const result = await Effect.runPromise(
  retryExponential(
    Effect.sync(() => riskyOperation()),
    3, // max retries
    1000 // base delay
  )
);
```

### 4. Adding Service Discovery

**Before:**

```typescript
// Single instance only
const service = new MyService();
await service.start();
```

**After:**

```typescript
import { ServiceRegistry, ServiceInstanceFactory } from "./effect-src";

const registry = new ServiceRegistry();

// Register multiple instances
const instance1 = ServiceInstanceFactory.create("my-service", "localhost:3001");
const instance2 = ServiceInstanceFactory.create("my-service", "localhost:3002");

await Effect.runPromise(registry.register(instance1));
await Effect.runPromise(registry.register(instance2));

// Load balanced requests
const selected = await Effect.runPromise(registry.getInstance("my-service"));
```

### 5. Adding Health Monitoring

**Before:**

```typescript
// Manual health checks
setInterval(async () => {
  try {
    const health = await service.healthCheck();
    if (health.status !== "healthy") {
      console.warn("Service unhealthy");
    }
  } catch (error) {
    console.error("Health check failed:", error);
  }
}, 30000);
```

**After:**

```typescript
import { EffectServiceManager } from "./effect-src";

const manager = new EffectServiceManager();
await Effect.runPromise(manager.startService("my-service"));

// Automatic health monitoring with retry policies
const health = await Effect.runPromise(
  manager.healthCheckService("my-service")
);
```

### 6. Worker Service Migration

**Before:**

```typescript
class WorkerService extends BaseService {
  private worker: Worker;

  async start(): Promise<void> {
    this.worker = new Worker("./worker.js");
    this.worker.on("error", (error) => {
      console.error("Worker error:", error);
    });
  }

  async call(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36);
      const timeout = setTimeout(() => {
        reject(new Error("RPC timeout"));
      }, 30000);

      const handler = (event: MessageEvent) => {
        if (event.data.id === id) {
          clearTimeout(timeout);
          if (event.data.error) {
            reject(new Error(event.data.error));
          } else {
            resolve(event.data.result);
          }
        }
      };

      this.worker.addEventListener("message", handler);
      this.worker.postMessage({ id, method, params });
    });
  }
}
```

**After:**

```typescript
import { EffectWorkerService, WorkerServiceFactory } from "./effect-src";

class WorkerService extends EffectWorkerService {
  constructor() {
    super("my-worker", {
      workerURL: new URL("./worker.js", import.meta.url),
      workerOptions: { type: "module" },
      autoTerminate: false,
    });
  }

  // Custom RPC method
  processData(data: any[]): Effect.Effect<any[]> {
    return this.callRPC("processBatch", { data });
  }
}

// Or use factory
const worker = WorkerServiceFactory.create("my-worker", "./worker.js", {
  rpcTimeout: 30000,
});
```

## 🏗️ Advanced Features

### Load Balancing Strategies

```typescript
import { ServiceRegistry, LoadBalanceStrategy } from "./effect-src";

const registry = new ServiceRegistry(null, {
  strategy: "weighted", // or "round-robin", "random", "least-connections", "health-based"
});

// Register instances with different weights
await Effect.runPromise(
  registry.register(
    ServiceInstanceFactory.create(
      "api-service",
      "api-1.example.com",
      { weight: 2 } // 2x more traffic
    )
  )
);

await Effect.runPromise(
  registry.register(
    ServiceInstanceFactory.create("api-service", "api-2.example.com", {
      weight: 1,
    })
  )
);
```

### Health Check Integration

```typescript
// Automatic health check updates
await Effect.runPromise(
  registry.updateInstanceHealth("instance-1", {
    status: "healthy",
    timestamp: Date.now(),
    details: { responseTime: 150 },
  })
);
```

### Service Statistics

```typescript
const stats = await Effect.runPromise(registry.getStatistics("api-service"));
// Returns: { totalInstances: 2, healthyInstances: 2 }
```

## 📊 Migration Benefits

### Reliability Improvements:

- **Automatic Retry**: Failed operations automatically retry with configurable policies
- **Health Monitoring**: Real-time health checks with automatic failover
- **Graceful Shutdown**: Proper resource cleanup and state management
- **Error Boundaries**: Errors are contained and don't crash the entire system

### Scalability Enhancements:

- **Multi-Instance Support**: Run multiple instances of the same service
- **Load Balancing**: Distribute traffic across instances efficiently
- **Service Discovery**: Automatic registration and discovery of instances
- **Resource Management**: Better handling of concurrent operations

### Observability Features:

- **Structured Logging**: Consistent, searchable log format
- **Health Metrics**: Built-in health monitoring and statistics
- **Tracing Integration**: Ready for OpenTelemetry integration
- **Performance Monitoring**: Detailed metrics and monitoring capabilities

### Developer Experience:

- **Type Safety**: Full TypeScript support with typed errors
- **Better Error Handling**: Comprehensive error types and recovery
- **Testing Utilities**: Built-in mocking and testing capabilities
- **IntelliSense**: Better IDE support and autocomplete

## 🚀 Production Deployment

### 1. Package Installation

```bash
npm install effect @effect/schema
```

### 2. Configuration

```typescript
// service-config.ts
export const serviceConfig = {
  retry: {
    maxRetries: 3,
    schedule: "exponential",
    baseDelay: 1000,
    maxDelay: 30000,
  },
  logging: {
    level: "info",
    structured: true,
  },
  healthCheck: {
    interval: 30000,
    timeout: 5000,
  },
};
```

### 3. Service Implementation

```typescript
// services/MyService.ts
import { EffectBaseService } from "effect-src";
import { serviceConfig } from "./service-config";

export class MyService extends EffectBaseService {
  constructor() {
    super("my-service", serviceConfig);
  }

  protected doStart(): Effect.Effect<void> {
    return Effect.sync(() => {
      // Service startup logic
    });
  }

  // ... other required methods
}
```

### 4. Application Bootstrap

```typescript
// app.ts
import { EffectServiceManager, ServiceRegistry } from "effect-src";
import { MyService } from "./services/MyService";

async function bootstrap() {
  const manager = new EffectServiceManager();
  const registry = new ServiceRegistry();

  const service = new MyService();

  // Register and start service
  await Effect.runPromise(manager.addService(service));
  await Effect.runPromise(manager.startService("my-service"));

  // For multi-instance deployment
  const instances = [
    { address: "service-1:3000", weight: 1 },
    { address: "service-2:3000", weight: 1 },
    { address: "service-3:3000", weight: 2 },
  ];

  for (const instance of instances) {
    const serviceInstance = ServiceInstanceFactory.create(
      "my-service",
      instance.address,
      { weight: instance.weight }
    );
    await Effect.runPromise(registry.register(serviceInstance));
  }

  console.log("🚀 j8s Effect-based services started successfully!");
}

bootstrap().catch(console.error);
```

## 📚 Additional Resources

- [Effect Documentation](https://effect.website/)
- [j8s Examples](./examples/)
- [Migration Guide](./MIGRATION_GUIDE.md)
- [API Reference](./docs/api.md)

## 🎯 Next Steps

1. **Run Tests**: Ensure all existing tests pass
2. **Update CI/CD**: Modify build processes to handle TypeScript compilation
3. **Monitor Performance**: Compare performance before and after migration
4. **Train Team**: Provide training on Effect-based patterns
5. **Update Documentation**: Update team documentation and guides

## 💡 Tips for Successful Migration

1. **Start Small**: Begin with non-critical services
2. **Use Feature Flags**: Enable Effect-based features incrementally
3. **Monitor Closely**: Watch for performance regressions
4. **Provide Training**: Ensure team understands Effect concepts
5. **Update Tooling**: Modify IDE settings and build tools

The migration to Effect-based j8s provides significant improvements in reliability, scalability, and maintainability. Take your time and migrate incrementally for the best results.
