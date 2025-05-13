# j8s

> A JavaScript service orchestration framework for running multiple services in a single process.

j8s allows you to run multiple JavaScript services as worker threads within a single Node.js process.
It provides a simple way to manage, start, stop, and monitor services while keeping them isolated in separate threads.

## Features

- **Isolated Services**: Each service runs in its own worker thread via `Worker`
- **Simple API**: Easy-to-use API for creating and managing services
- **Restart Policies**: Multiple restart policies including `always`, `unless-stopped`, `on-failure`, and `no`
- **Cron Support**: Run services on a schedule using cron expressions
- **Health Checks**: Monitor service health status
- **Timeout Support**: Set timeouts for short-lived jobs
- **Remote Workers**: Support for workers from remote sources

## Installation

```bash
npm install j8s
```

## Quick Start

### 1. Create a Service

Create a service by implementing the `IService` interface:

```typescript
// myService.ts
import { ServiceWorker, type IService } from "j8s";

class MyService implements IService {
  name = "myService";

  async start(): Promise<void> {
    console.log("My service started");

    // Your service logic here
    setInterval(() => {
      console.log("Service running...");
    }, 5000);
  }

  async stop(): Promise<void> {
    console.log("My service stopped");
    // Cleanup resources
  }
}

// Initialize the worker - this is all you need to expose your service!
new ServiceWorker(new MyService());
```

### 2. Register and Manage Services

```typescript
// main.ts
import { ServiceManager } from "j8s";
import path from "path";

async function main() {
  // Create a service manager
  const manager = new ServiceManager();

  // Register a service
  manager.register({
    name: "myService",
    script: path.resolve(__dirname, "./myService.ts"),
    longRunning: true,
    restartPolicy: "always",
  });

  // Start all services
  await manager.startAll();
  console.log("All services started");

  // Get service status
  console.log("Services status:", manager.status());

  // Later, to stop services
  // await manager.stopAll();
}

main().catch(console.error);
```

## Service Worker Options

### Approach 1: Use a Script Path (Recommended)

The simplest way is to provide a script path:

```typescript
manager.register({
  name: "myService",
  script: "/absolute/path/to/myService.ts", // Absolute path recommended
  longRunning: true,
  restartPolicy: "always",
});
```

### Approach 2: Provide a Pre-Created Worker

Useful for remote scripts or when you need more control over worker creation:

```typescript
const worker = new Worker("https://example.com/path/to/worker.js", {
  type: "module",
});

manager.register({
  name: "remoteService",
  worker: worker,
  longRunning: true,
});
```

## Service Configuration Options

```typescript
{
  // Required
  name: "myService",          // Unique service name

  // Either script or worker is required
  script: "./path/to/service.js", // Path to worker script
  // OR
  worker: workerInstance,     // Pre-created worker instance

  // Optional
  longRunning: true,          // Default: true - false for short-lived jobs
  restartPolicy: "always",    // Default: "no" - other options: "unless-stopped", "on-failure", or {type: "on-failure", maxRetries: 5}
  cron: "*/10 * * * *",       // Cron schedule for short-lived jobs
  timeout: 30000,             // Timeout in ms for short-lived jobs
}
```

## Restart Policies

- `"no"`: Don't restart when service crashes (default)
- `"always"`: Always restart when service crashes
- `"unless-stopped"`: Restart unless explicitly stopped
- `{type: "on-failure", maxRetries: 5}`: Restart on failure up to maxRetries times

## Service Manager API

```typescript
// Create a manager
const manager = new ServiceManager();

// Register a service
const instance = manager.register(config);

// Start/stop individual service
await manager.start("serviceName");
await manager.stop("serviceName");

// Start/stop all services
await manager.startAll();
await manager.stopAll();

// Get service status
const status = manager.status();

// Get a service instance
const service = manager.get("serviceName");

// Remove a service
await manager.remove("serviceName");

// List all services
const services = manager.list();
```

## Communication

j8s handles worker communication internally using [kkrpc](https://github.com/khusamov/kkrpc), but you don't need to use it directly. The ServiceWorker helper class encapsulates all the necessary RPC setup.

## Examples

Check the [examples](./examples) directory for more detailed examples.

### Cron Job Example

Here's an example of a service that runs every 5 minutes:

```typescript
// cronService.ts
import { ServiceWorker, type IService } from "j8s";

class CronService implements IService {
  name = "cronService";

  async start(): Promise<void> {
    console.log("Cron service started");
    
    // Your scheduled task logic here
    console.log("Running scheduled task...");
    
    // For cron jobs, the service should exit after completing its task
    // The service manager will restart it based on the cron schedule
    process.exit(0);
  }

  async stop(): Promise<void> {
    console.log("Cron service stopped");
  }
}

// Initialize the worker
new ServiceWorker(new CronService());
```

And here's how to register it with a cron schedule:

```typescript
// main.ts
import { ServiceManager } from "j8s";
import path from "path";

async function main() {
  const manager = new ServiceManager();

  // Register a cron service that runs every 5 minutes
  manager.register({
    name: "cronService",
    script: path.resolve(__dirname, "./cronService.ts"),
    longRunning: false, // Set to false for cron jobs
    cron: "*/5 * * * *", // Runs every 5 minutes
    timeout: 60000, // 1 minute timeout
  });

  await manager.startAll();
}

main().catch(console.error);
```

## License

MIT
