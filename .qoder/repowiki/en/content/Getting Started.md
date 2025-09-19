# Getting Started

<cite>
**Referenced Files in This Document**   
- [index.ts](file://index.ts)
- [src/BaseService.ts](file://src/BaseService.ts)
- [src/ServiceManager.ts](file://src/ServiceManager.ts)
- [src/WorkerService.ts](file://src/WorkerService.ts)
- [examples/demo.ts](file://examples/demo.ts)
- [package.json](file://package.json)
- [tsconfig.json](file://tsconfig.json)
</cite>

## Table of Contents
1. [Installation](#installation)
2. [Creating a Service Manager](#creating-a-service-manager)
3. [Implementing Services](#implementing-services)
4. [Creating a Complete Example](#creating-a-complete-example)
5. [Service Lifecycle Control](#service-lifecycle-control)
6. [Configuration Options](#configuration-options)
7. [Troubleshooting](#troubleshooting)

## Installation

To begin using the j8s framework, install it via npm or JSR. The framework supports both JavaScript and TypeScript projects.

```bash
# Install using npm
npm install j8s

# Or install using JSR
jsr add @hk/j8s
```

The framework has the following peer and direct dependencies:
- **Peer Dependency**: TypeScript ^5 (required for type checking)
- **Key Dependencies**: 
  - `@kunkun/kkrpc` for RPC communication between worker threads
  - `cron` for scheduled task execution
  - `hono` for REST API capabilities
  - `effect` for functional programming patterns

After installation, ensure your project includes a `tsconfig.json` file configured for modern ESNext modules, as shown in the framework's configuration.

**Section sources**
- [package.json](file://package.json#L1-L37)
- [tsconfig.json](file://tsconfig.json#L1-L29)

## Creating a Service Manager

The `ServiceManager` class is the central orchestration component that manages all services in your application. Create an instance using the default export from the package.

```typescript
import { ServiceManager } from "j8s";

const manager = new ServiceManager();
```

This manager instance will handle service lifecycle events, health checks, restart policies, and scheduling. It serves as the control plane for all services running in your application, whether they execute in the main thread or worker threads.

**Section sources**
- [src/ServiceManager.ts](file://src/ServiceManager.ts#L58-L67)

## Implementing Services

You can implement services in two ways: by extending `BaseService` for main-thread execution or using `createWorkerService` for worker-thread execution.

### Extending BaseService

For services that run in the main thread, extend the `BaseService` abstract class and implement the required methods:

```typescript
import { BaseService } from "j8s";

class MyService extends BaseService {
  async start(): Promise<void> {
    console.log("Service started");
    // Initialize your service logic here
  }

  async stop(): Promise<void> {
    console.log("Service stopped");
    // Clean up resources here
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      status: "running",
      details: {
        // Add custom health information
      },
    };
  }
}
```

The `BaseService` constructor requires a service name, which must be unique across all services managed by a single `ServiceManager`.

### Using createWorkerService

For services that should run in a separate worker thread, use the `createWorkerService` helper function:

```typescript
import { createWorkerService } from "j8s";

const workerService = createWorkerService(
  "worker-service",
  new URL("./path/to/worker.ts", import.meta.url),
  {
    autoTerminate: false,
    workerData: {
      config: { /* custom configuration */ },
    },
  }
);
```

In the worker file, implement the service using the `expose` function to make it accessible to the main thread:

```typescript
import { expose } from "j8s";
import type { IService } from "j8s";

class WorkerService implements IService {
  name = "worker-service";
  
  async start(): Promise<void> {
    // Worker initialization
  }
  
  async stop(): Promise<void> {
    // Worker cleanup
  }
  
  async healthCheck(): Promise<HealthCheckResult> {
    return { status: "running" };
  }
}

expose(new WorkerService());
```

**Section sources**
- [src/BaseService.ts](file://src/BaseService.ts#L0-L25)
- [index.ts](file://index.ts#L155-L181)
- [src/expose.ts](file://src/expose.ts#L47-L54)

## Creating a Complete Example

Based on the `examples/demo.ts` file, here's a complete working example that demonstrates creating and managing multiple services:

```typescript
import { ServiceManager, BaseService } from "j8s";

// Create a service that runs in the main thread
class SimpleService extends BaseService {
  private intervalId: NodeJS.Timeout | null = null;

  async start(): Promise<void> {
    console.log(`${this.name} started`);
    this.intervalId = setInterval(() => {
      console.log(`${this.name} is running...`);
    }, 5000);
  }

  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log(`${this.name} stopped`);
  }
}

// Set up the service manager
const manager = new ServiceManager();

// Add a main thread service
const mainService = new SimpleService("main-service");
manager.addService(mainService, { restartPolicy: "always" });

// Add a worker service
const workerService = createWorkerService(
  "logging-service",
  new URL("./services/logService.ts", import.meta.url)
);
manager.addService(workerService, { restartPolicy: "on-failure" });

// Start all services
await manager.startAllServices();
console.log("All services started!");

// Set up graceful shutdown
process.on("SIGINT", async () => {
  await manager.stopAllServices();
  process.exit(0);
});
```

This example shows how to create a service manager, add different types of services with restart policies, start them all, and handle graceful shutdown.

**Section sources**
- [examples/demo.ts](file://examples/demo.ts#L0-L166)

## Service Lifecycle Control

The j8s framework provides programmatic control over service lifecycles through the `ServiceManager` API.

### Starting and Stopping Services

Control individual services using their names:

```typescript
// Start a specific service
await manager.startService("main-service");

// Stop a specific service
await manager.stopService("main-service");

// Restart a service
await manager.restartService("main-service");
```

Start or stop all services at once:

```typescript
// Start all registered services
await manager.startAllServices();

// Stop all services gracefully
await manager.stopAllServices();
```

### Health Monitoring

Check the health status of services:

```typescript
// Get health for a specific service
const health = await manager.healthCheckService("main-service");

// Get health for all services
const allHealth = await manager.healthCheckAllServices();
```

The health check result includes both the service's reported status and additional details you provide.

**Section sources**
- [src/ServiceManager.ts](file://src/ServiceManager.ts#L104-L200)

## Configuration Options

When adding services to the manager, you can configure various options through the `ServiceConfig` interface.

### Restart Policies

Configure how services should be restarted after failure:

```typescript
manager.addService(service, {
  restartPolicy: "always", // or "unless-stopped", "on-failure", "no"
  maxRetries: 3, // Maximum retry attempts (for "on-failure")
});
```

Available policies:
- `"always"`: Always restart the service when it stops
- `"unless-stopped"`: Restart unless explicitly stopped by the user
- `"on-failure"`: Only restart if the service exits with an error
- `"no"`: Never restart the service

### Cron Jobs

Schedule services to run at specific times using cron expressions:

```typescript
manager.addService(service, {
  cronJob: {
    schedule: "0 0 * * *", // Run daily at midnight
    timeout: 60000, // 1 minute timeout
  },
});
```

The cron syntax follows standard format: `* * * * *` (second, minute, hour, day, month, day of week).

**Section sources**
- [src/interface.ts](file://src/interface.ts#L26-L30)
- [src/ServiceManager.ts](file://src/ServiceManager.ts#L300-L351)

## Troubleshooting

### Common Setup Issues

**Missing Dependencies**: Ensure all peer dependencies are installed, particularly TypeScript ^5. If you encounter type errors, verify your TypeScript version:

```bash
npm ls typescript
```

**Worker Path Resolution**: When using `createWorkerService`, always use `new URL()` with `import.meta.url` for proper path resolution:

```typescript
createWorkerService(
  "service-name",
  new URL("./worker.ts", import.meta.url) // Correct
);
```

Avoid relative paths that may resolve incorrectly in different execution contexts.

**TypeScript Configuration**: Ensure your `tsconfig.json` includes the necessary settings for ES modules:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true
  }
}
```

### Debugging Tips

- Enable verbose logging by adding console statements in your service's `start`, `stop`, and `healthCheck` methods
- Use the health check API to monitor service status programmatically
- Handle `SIGINT` and `SIGTERM` signals for graceful shutdown during development
- Check the service manager's internal state by inspecting the services array: `manager.services`

**Section sources**
- [tsconfig.json](file://tsconfig.json#L1-L29)
- [package.json](file://package.json#L1-L37)
- [examples/demo.ts](file://examples/demo.ts#L145-L165)