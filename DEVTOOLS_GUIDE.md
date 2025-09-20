# j8s DevTools Integration Guide

This guide provides comprehensive instructions for integrating and using Effect DevTools with the j8s service framework for enhanced debugging and observability.

## 🚀 What is Effect DevTools?

Effect DevTools is a VS Code extension that provides real-time visualization and debugging capabilities for Effect-based applications. When integrated with j8s, it offers unprecedented insight into your service operations, performance metrics, and debugging capabilities.

## 📋 Prerequisites

### VS Code Extension

- **Effect DevTools** - Install from the VS Code marketplace
  - Search for "Effect DevTools" by the Effect Team
  - Click "Install"

### Required Packages

```bash
cd effect-src
npm install @effect/experimental
```

### Development Environment

- Node.js 18+
- VS Code with Effect DevTools extension installed
- j8s effect-src project

## 🔧 Basic Setup

### 1. Adding DevTools to Your j8s Services

Import the DevTools layer and add it to your program:

```typescript
import { DevTools } from "@effect/experimental";
import { NodeRuntime } from "@effect/platform-node";
import { Effect } from "effect";
import { EffectServiceManager } from "./index";

// Your existing j8s program
const myProgram = Effect.log("Starting j8s services...").pipe(
  Effect.flatMap(() => {
    const manager = new EffectServiceManager();
    // Your service logic here
    return Effect.log("Services started");
  })
);

// Add DevTools integration
const DevToolsLive = DevTools.layer({
  traceId: "my-j8s-application",
  spanId: "main",
  sampling: 1.0, // Sample 100% of traces for development
});

const programWithDevTools = myProgram.pipe(
  Effect.provide(DevToolsLive),
  Effect.catchAll((error) => Effect.log(`Program failed: ${error}`))
);

// Run the program
programWithDevTools.pipe(NodeRuntime.runMain);
```

### 2. Quick Test

Run the included demo to verify DevTools integration:

```bash
cd effect-src
bun run dev-demo
```

## 🎯 Connecting VS Code DevTools

### Step 1: Start Your j8s Application

```bash
cd effect-src
bun run dev-demo  # or your own j8s application
```

### Step 2: Open VS Code

Launch VS Code and open your project directory.

### Step 3: Open DevTools Panel

- **Windows/Linux**: `Ctrl+Shift+P` → "Effect: Show DevTools"
- **macOS**: `Cmd+Shift+P` → "Effect: Show DevTools"
- Or use the sidebar: Click on the Effect icon

### Step 4: Connect to Running Application

DevTools should automatically detect and connect to your running j8s application. If not:

1. Click the "Connect" button in DevTools
2. Ensure your application is running on the correct port
3. Check that the DevTools layer is properly configured

## 📊 What You'll See in DevTools

### Service Lifecycle Operations

```typescript
// These operations will create visible spans in DevTools
await Effect.runPromise(service.start());
await Effect.runPromise(service.healthCheck());
await Effect.runPromise(service.stop());
```

**DevTools Visualization:**

- Service start/end timing
- Health check duration and results
- Resource allocation and cleanup

### Service Discovery and Load Balancing

```typescript
const selected = await Effect.runPromise(registry.getInstance("my-service"));
```

**DevTools Visualization:**

- Load balancing decision making
- Instance selection timing
- Routing decisions with attributes
- Health-based routing logic

### Retry Policies and Error Handling

```typescript
const result = await Effect.runPromise(
  retryExponential(riskyOperation, 3, 1000)
);
```

**DevTools Visualization:**

- Retry attempts with timing
- Exponential backoff delays
- Error boundaries and recovery
- Success/failure rates

### Worker Service Operations

```typescript
const result = await Effect.runPromise(worker.callRPC("processData", { data }));
```

**DevTools Visualization:**

- Worker communication timing
- RPC call durations
- Inter-thread message passing
- Worker lifecycle events

## 🔧 Advanced DevTools Configuration

### Custom Trace Configuration

```typescript
const DevToolsLive = DevTools.layer({
  traceId: "my-j8s-app", // Custom trace ID
  spanId: "root", // Root span ID
  parentSpanId: undefined, // No parent span
  sampling: 0.1, // Sample 10% in production
  serviceName: "my-j8s-service", // Custom service name
  resourceAttributes: {
    // Additional resource attributes
    "service.version": "1.0.0",
    "service.environment": "development",
  },
});
```

### Adding Custom Spans

```typescript
import { Effect } from "effect";

class MyService extends EffectBaseService {
  protected doStart(): Effect.Effect<void> {
    return Effect.sync(() => {
      console.log("Starting service...");
    }).pipe(
      Effect.withSpan("custom-service-start", {
        attributes: {
          "service.name": this.name,
          "service.type": "custom",
        },
      })
    );
  }
}
```

### Adding Rich Attributes

```typescript
const processData = (data: any) =>
  Effect.sync(() => {
    const result = transformData(data);
    return result;
  }).pipe(
    Effect.withSpan("data-processing", {
      attributes: {
        "data.size": JSON.stringify(data).length,
        "data.type": typeof data,
        "processing.algorithm": "v2",
      },
    })
  );
```

### Error Tracking with Spans

```typescript
const riskyOperation = Effect.sync(() => {
  if (Math.random() < 0.3) {
    throw new Error("Random failure");
  }
  return "Success!";
}).pipe(
  Effect.withSpan("risky-operation"),
  Effect.catchAll((error) =>
    Effect.log(`Operation failed: ${error}`).pipe(
      Effect.withSpan("operation-failure", {
        attributes: {
          "error.type": "random",
          "error.severity": "medium",
        },
      })
    )
  )
);
```

## 📈 Performance Monitoring

### Service Health Monitoring

```typescript
class MonitoredService extends EffectBaseService {
  protected doHealthCheck(): Effect.Effect<HealthCheckResult> {
    return Effect.gen(() => {
      const startTime = Date.now();

      // Perform actual health check
      const isHealthy = yield * this.checkDependencies();
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();

      return {
        status: isHealthy ? "healthy" : "degraded",
        timestamp: Date.now(),
        details: {
          responseTime: Date.now() - startTime,
          memory: memoryUsage,
          cpu: cpuUsage,
          uptime: process.uptime(),
        },
      };
    }).pipe(
      Effect.withSpan("comprehensive-health-check", {
        attributes: {
          "check.type": "comprehensive",
          "metrics.collected": true,
        },
      })
    );
  }
}
```

### Load Balancing Metrics

```typescript
const loadBalancedRequest = () =>
  Effect.gen(() => {
    const startTime = Date.now();

    const selected = yield * registry.getInstance("api-service");

    const result = yield * makeRequest(selected.address);

    return {
      result,
      selectedInstance: selected.id,
      responseTime: Date.now() - startTime,
    };
  }).pipe(
    Effect.withSpan("load-balanced-request", {
      attributes: {
        "routing.strategy": "weighted",
        "instance.count": yield * registry.getInstanceCount("api-service"),
      },
    })
  );
```

### Resource Usage Tracking

```typescript
const withResourceTracking = <T>(
  effect: Effect.Effect<T>,
  resourceName: string
) =>
  Effect.gen(() => {
    const startMemory = process.memoryUsage();
    const startCpu = process.cpuUsage();

    const result = yield * effect;

    const endMemory = process.memoryUsage();
    const endCpu = process.cpuUsage();

    return {
      result,
      resourceUsage: {
        memoryDelta: endMemory.heapUsed - startMemory.heapUsed,
        cpuDelta: calculateCpuDelta(startCpu, endCpu),
      },
    };
  }).pipe(
    Effect.withSpan("resource-tracked-operation", {
      attributes: {
        "resource.name": resourceName,
        "tracking.enabled": true,
      },
    })
  );
```

## 🛠️ Debugging Workflows

### 1. Service Lifecycle Debugging

**Problem**: Service is taking too long to start
**DevTools Solution**:

1. Open DevTools and look for "service-start" span
2. Check the duration and child spans
3. Identify bottlenecks in the startup process
4. Examine any error spans or warnings

### 2. Performance Optimization

**Problem**: High latency in service operations
**DevTools Solution**:

1. Find slow operations in the trace timeline
2. Look for spans with high duration
3. Check resource usage attributes
4. Identify optimization opportunities

### 3. Error Investigation

**Problem**: Services failing intermittently
**DevTools Solution**:

1. Look for error spans and exception details
2. Check retry attempts and timing patterns
3. Examine error boundaries and recovery flows
4. Identify root causes of failures

### 4. Load Balancing Analysis

**Problem**: Uneven load distribution
**DevTools Solution**:

1. Examine "routing-decision" spans
2. Check instance selection patterns
3. Analyze load balancing strategy effectiveness
4. Identify configuration issues

## 🔍 Advanced Features

### Custom Metrics and Attributes

```typescript
const withBusinessMetrics = <T>(effect: Effect.Effect<T>, operation: string) =>
  effect.pipe(
    Effect.withSpan("business-operation", {
      attributes: {
        "business.operation": operation,
        "business.user.id": getUserId(),
        "business.tenant.id": getTenantId(),
        "business.success.rate": calculateSuccessRate(),
      },
    })
  );
```

### Distributed Tracing

```typescript
// For multi-service applications
const tracingConfig = {
  traceId: generateTraceId(),
  spanId: generateSpanId(),
  parentSpanId: incomingTraceId,
  sampling: shouldSampleTrace(),
};

const DevToolsLive = DevTools.layer(tracingConfig);
```

### Performance Thresholds

```typescript
const withPerformanceThresholds = <T>(
  effect: Effect.Effect<T>,
  thresholds: {
    warning?: number;
    critical?: number;
  }
) =>
  Effect.gen(() => {
    const startTime = Date.now();
    const result = yield * effect;
    const duration = Date.now() - startTime;

    if (thresholds.critical && duration > thresholds.critical) {
      yield *
        Effect.log(
          `CRITICAL: Operation exceeded threshold: ${duration}ms`
        ).pipe(
          Effect.withSpan("performance-critical", {
            attributes: { threshold: thresholds.critical, actual: duration },
          })
        );
    }

    return result;
  });
```

## 📚 Best Practices

### 1. Span Naming Conventions

- Use clear, descriptive names: "service-start", "data-processing"
- Use consistent naming patterns across services
- Include service name in span attributes when relevant

### 2. Attribute Management

- Include relevant metadata in span attributes
- Use structured data for complex attributes
- Avoid including sensitive information in attributes

### 3. Sampling Strategies

- Use 100% sampling in development
- Use 1-10% sampling in production
- Configure sampling based on operation criticality

### 4. Error Handling

- Always wrap operations in error boundaries
- Include error details in span attributes
- Use structured error logging with spans

### 5. Performance Considerations

- Keep span attributes lightweight
- Avoid excessive span creation in hot paths
- Use sampling for high-frequency operations

## 🚀 Production Deployment

### Configuration Management

```typescript
// config/devtools.ts
export const devtoolsConfig = {
  enabled: process.env.NODE_ENV === "development",
  sampling: process.env.DEVTOOLS_SAMPLING || "0.1",
  serviceName: process.env.SERVICE_NAME || "j8s-service",
  traceIdPrefix: process.env.TRACE_ID_PREFIX || "j8s",
};

// Conditional DevTools integration
const maybeAddDevTools = <T>(program: Effect.Effect<T>): Effect.Effect<T> => {
  if (devtoolsConfig.enabled) {
    const DevToolsLive = DevTools.layer({
      sampling: parseFloat(devtoolsConfig.sampling),
      serviceName: devtoolsConfig.serviceName,
    });
    return program.pipe(Effect.provide(DevToolsLive));
  }
  return program;
};
```

### Environment Variables

```bash
# Enable/disable DevTools
DEVTOOLS_ENABLED=true

# Configure sampling rate
DEVTOOLS_SAMPLING=0.1

# Set service name for traces
SERVICE_NAME=my-j8s-service

# Set trace ID prefix
TRACE_ID_PREFIX=my-app
```

### Monitoring Integration

```typescript
// Combine DevTools with other monitoring
const withComprehensiveMonitoring = <T>(effect: Effect.Effect<T>) =>
  effect.pipe(
    Effect.withSpan("monitored-operation"),
    Effect.tap(() => {
      // Send metrics to your monitoring system
      sendMetricsToMonitoringSystem();
    }),
    Effect.catchAll((error) => {
      // Send error to error tracking
      sendErrorToErrorTracking(error);
      return Effect.fail(error);
    })
  );
```

## 🎯 Troubleshooting

### DevTools Not Connecting

**Solutions:**

1. Verify the Effect DevTools extension is installed
2. Check that your application is running
3. Ensure the DevTools layer is properly configured
4. Check for port conflicts or firewall issues
5. Restart VS Code and try again

### Missing Spans

**Solutions:**

1. Verify operations are wrapped in `Effect.withSpan`
2. Check that the DevTools layer is provided to the program
3. Ensure sampling rate is appropriate
4. Check for errors in span creation

### Poor Performance

**Solutions:**

1. Reduce sampling rate in production
2. Minimize span attributes and metadata
3. Use selective span creation for critical operations
4. Consider async span creation for non-critical paths

### High Memory Usage

**Solutions:**

1. Reduce trace retention settings in DevTools
2. Use lower sampling rates
3. Clean up old traces periodically
4. Optimize span attribute usage

## 📖 Additional Resources

### Official Documentation

- [Effect DevTools Documentation](https://effect.website/docs/integrations/devtools)
- [Effect Tracing Documentation](https://effect.website/docs/tracing)
- [VS Code Extension Marketplace](https://marketplace.visualstudio.com/items?itemName=Effect.effect-devtools)

### Example Projects

- [j8s DevTools Demo](./effect-src/dev-demo-simple.ts)
- [Service Discovery with DevTools](./examples/service-discovery-with-devtools.ts)
- [Worker Service Debugging](./examples/worker-devtools-debugging.ts)

### Community Resources

- [Effect Discord Server](https://discord.gg/effect)
- [GitHub Discussions](https://github.com/Effect-TS/effect/discussions)
- [Stack Overflow](https://stackoverflow.com/questions/tagged/effect-ts)

---

## 🎉 Summary

Effect DevTools integration provides powerful debugging and observability capabilities for j8s applications. By following this guide, you can:

- **Visualize** service operations in real-time
- **Debug** complex service interactions and dependencies
- **Monitor** performance metrics and resource usage
- **Optimize** service performance and reliability
- **Trace** requests across service boundaries

The integration is minimal but powerful, requiring only a few lines of code to enable comprehensive observability for your j8s services.

**Key Benefits:**

- Real-time debugging capabilities
- Performance bottleneck identification
- Error trace visualization and analysis
- Service dependency mapping and understanding
- Comprehensive observability and monitoring

Start with the basic setup, explore the advanced features, and transform your j8s development and debugging experience! 🚀
