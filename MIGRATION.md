# j8s Migration Guide

This guide helps you migrate from j8s 0.1.x to 0.2.x and adopt the new Effect-powered features.

## 🎯 What's New in 0.2.x

j8s 0.2.x introduces a complete Effect integration layer while maintaining full backward compatibility. Key improvements:

- **Effect-Powered Core**: Full integration with [Effect](https://effect.website/) for enhanced reliability
- **Enhanced Error Handling**: Sophisticated retry policies and error recovery
- **Monitoring & Metrics**: Built-in service monitoring and performance tracking
- **Web UI**: React-based monitoring dashboard
- **Advanced Resource Management**: Automatic cleanup and resource leak prevention

## 🔄 Migration Path

### Step 1: Update Dependencies

```bash
# Update j8s to latest version
npm update j8s
# or
bun update j8s
# or
pnpm update j8s

# Ensure Effect is installed (should be a peer dependency)
npm install effect
```

### Step 2: Verify Existing Code

Your existing j8s code should work without any changes:

```typescript
// This still works exactly as before
import { ServiceManager, BaseService } from "j8s";

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
manager.addService(service);
await manager.startService(service);
```

## 🚀 Adopting New Features

### Option 1: Enhanced Service Manager (Recommended)

Replace `ServiceManager` with `EnhancedServiceManager` for additional features:

```typescript
// Before
import { ServiceManager } from "j8s";
const manager = new ServiceManager();

// After
import { EnhancedServiceManager } from "j8s";
const manager = new EnhancedServiceManager({
  retryPolicy: RetryPolicies.exponentialBackoff({
    initialDelay: "100 millis",
    maxRetries: 5,
  }),
  monitoring: {
    enableMetrics: true,
    healthCheckInterval: "30 seconds",
  },
});
```

### Option 2: Effect-Based Services

For new services, consider using Effect-based patterns:

```typescript
import { BaseEffectService, EnhancedServiceManager } from "j8s";
import { Effect } from "effect";

class MyService extends BaseEffectService {
  // Effect-based methods with automatic error handling
  startEffect = Effect.gen(function* () {
    yield* Effect.log("Starting service");
    // Your business logic here
    return "Service started";
  });

  healthCheckEffect = Effect.gen(function* () {
    return { status: "running" as const };
  });
}

const manager = new EnhancedServiceManager();
const service = new MyService("my-service");
await manager.addService(service);
```

## 📋 Migration Checklist

### 1. Update Imports (If Using New Features)

```typescript
// Add these imports for new features
import {
  EnhancedServiceManager,
  BaseEffectService,
  RetryPolicies,
  ResourceManager,
  Monitoring,
} from "j8s";
import { Effect, Schedule } from "effect";
```

### 2. Update Service Creation (Optional)

```typescript
// Traditional approach (still supported)
class MyService extends BaseService {
  async start(): Promise<void> {
    /* ... */
  }
}

// Enhanced approach with Effect
class MyService extends BaseEffectService {
  startEffect = Effect.gen(function* () {
    /* ... */
  });
}
```

### 3. Add Error Handling (Recommended)

```typescript
const manager = new EnhancedServiceManager({
  errorHandling: {
    logErrors: true,
    captureErrors: true, // For Sentry integration
    retryOnFailure: true,
    maxRetries: 3,
  },
});
```

### 4. Enable Monitoring (Optional)

```typescript
const manager = new EnhancedServiceManager({
  monitoring: {
    enableMetrics: true,
    healthCheckInterval: "30 seconds",
    performanceTracking: true,
  },
});
```

## 🛠️ Common Migration Scenarios

### Scenario 1: Adding Retry Logic to Existing Service

```typescript
// Before - manual retry logic
class MyService extends BaseService {
  async start(): Promise<void> {
    let retries = 0;
    while (retries < 3) {
      try {
        await connectToDatabase();
        break;
      } catch (error) {
        retries++;
        if (retries >= 3) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000 * retries));
      }
    }
  }
}

// After - automatic retry with EnhancedServiceManager
class MyService extends BaseService {
  async start(): Promise<void> {
    await connectToDatabase(); // No retry logic needed here
  }
}

const manager = new EnhancedServiceManager({
  retryPolicy: RetryPolicies.exponentialBackoff({
    initialDelay: "1 second",
    maxRetries: 3,
  }),
});
```

### Scenario 2: Adding Monitoring

```typescript
// Before - manual metrics tracking
class MyService extends BaseService {
  private requestCount = 0;

  async start(): Promise<void> {
    // Your service logic
    this.requestCount++;
  }

  getMetrics() {
    return { requestCount: this.requestCount };
  }
}

// After - automatic monitoring
class MyService extends BaseService {
  async start(): Promise<void> {
    // Your service logic
    Monitoring.Counter.inc("requestCount");
  }
}

const manager = new EnhancedServiceManager({
  monitoring: {
    enableMetrics: true,
    customMetrics: {
      requestCount: Monitoring.Counter(),
    },
  },
});
```

### Scenario 3: Adding Web UI

```typescript
// Add to your existing setup
import { createServiceManagerUI } from "j8s";
import { serve } from "@hono/node-server";

const manager = new EnhancedServiceManager();
// ... add your services ...

const { app } = createServiceManagerUI(manager, {
  title: "My Services",
  theme: "dark",
});

serve({ fetch: app.fetch, port: 3000 });
console.log("Web UI: http://localhost:3000");
```

## 🔄 Breaking Changes

### Minimal Breaking Changes

j8s 0.2.x maintains full backward compatibility. However, there are a few internal changes to be aware of:

1. **Internal Refactoring**: Service management now uses Effect internally
2. **Enhanced Dependencies**: Added `effect` as a peer dependency
3. **Improved Error Handling**: Better error messages and structured errors

### No Code Changes Required

Your existing j8s 0.1.x code will work without modification in 0.2.x.

## 🎯 Best Practices After Migration

### 1. Gradual Adoption

```typescript
// Start with traditional approach
const manager = new ServiceManager();

// Gradually move to enhanced features
const enhancedManager = new EnhancedServiceManager();

// Mix both approaches in the same application
const traditionalService = new MyTraditionalService();
const effectService = new MyEffectService();

enhancedManager.addService(traditionalService);
enhancedManager.addService(effectService);
```

### 2. Error Handling Strategy

```typescript
// Use structured error handling
import { ServiceErrorType, StructuredServiceError } from "j8s";

class MyService extends BaseEffectService {
  startEffect = Effect.gen(function* () {
    return yield* Effect.tryPromise({
      try: () => riskyOperation(),
      catch: (error) =>
        new StructuredServiceError({
          type: ServiceErrorType.CONNECTION,
          message: "Connection failed",
          cause: error,
          retryable: true,
        }),
    });
  });
}
```

### 3. Resource Management

```typescript
// Use automatic resource cleanup
class DatabaseService extends BaseEffectService {
  startEffect = Effect.gen(function* () {
    const connection = yield* ResourceManager.acquireRelease(
      Effect.promise(() => createConnection()),
      (conn) => Effect.promise(() => conn.close())
    );

    return yield* useConnection(connection);
  });
}
```

## 🐛 Troubleshooting

### Common Issues

**Issue: TypeScript errors about missing Effect types**

```typescript
// Solution: Import Effect types
import { Effect } from "effect";
```

**Issue: Services not retrying on failure**

```typescript
// Solution: Configure retry policy
const manager = new EnhancedServiceManager({
  retryPolicy: RetryPolicies.exponentialBackoff({
    initialDelay: "1 second",
    maxRetries: 3,
  }),
});
```

**Issue: Web UI not starting**

```typescript
// Solution: Ensure all dependencies are installed
npm install @hono/node-server react react-dom
```

### Getting Help

- Check the [main documentation](./README.md)
- Review the [examples](./examples/)
- Open an issue on GitHub
- Join our community discussions

## 📚 Next Steps

1. **Read the full documentation** to understand all new features
2. **Try the examples** to see new patterns in action
3. **Gradually adopt** new features in your existing services
4. **Monitor your services** using the new web UI and metrics
5. **Provide feedback** to help improve j8s

## 🎉 Summary

j8s 0.2.x brings powerful new capabilities while maintaining full backward compatibility. You can:

- ✅ Keep using existing code without changes
- ✅ Gradually adopt new features
- ✅ Benefit from improved reliability and monitoring
- ✅ Use Effect patterns for better error handling

The migration is designed to be smooth and non-disruptive, allowing you to adopt new features at your own pace.
