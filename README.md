# j8s - JavaScript Service Orchestrator

https://jsr.io/@hk/j8s

A lightweight service orchestration framework for JavaScript/TypeScript. Run multiple services in a single process using worker threads.

## Features

- Run services in main thread or worker threads
- Health checks for all services
- Restart policies (always, unless-stopped, on-failure, no)
- Run services on a schedule (cron jobs)
- Timeout support for services
- Communication between worker and main thread using RPC

## Basic Usage

### Running a service in the main thread

```typescript
import { BaseService, ServiceManager } from "j8s";

// Create a service that runs in the main thread
class MyService extends BaseService {
  async start(): Promise<void> {
    console.log("Service started");
    this.setStatus("running");
  }

  async stop(): Promise<void> {
    console.log("Service stopped");
    this.setStatus("stopped");
  }
}

// Create a service manager
const manager = new ServiceManager();

// Add the service
const myService = new MyService("my-service");
manager.addService(myService, {
  restartPolicy: "always",
});

// Start the service
await manager.startService(myService);
```

### Running a service in a worker thread

```typescript
import { ServiceManager, createWorkerService } from "j8s";

// Create a worker service
const workerService = createWorkerService(
  "worker-service",
  new URL("./path/to/worker.ts", import.meta.url),
  { autoTerminate: false }
);

// Add the service with restart policy
const manager = new ServiceManager();
manager.addService(workerService, {
  restartPolicy: "on-failure",
  maxRetries: 3,
});

// Start the service
await manager.startService(workerService);
```

### Creating a worker service

To create a worker service, you need to implement the `IService` interface in the worker file:

```typescript
// worker.ts
import { WorkerChildIO, RPCChannel } from "@kunkun/kkrpc";
import type { IService, HealthCheckResult } from "j8s";

const io = new WorkerChildIO();

class WorkerService implements IService {
  name = "worker-service";
  private running = false;

  async start(): Promise<void> {
    console.log("Worker service started");
    this.running = true;
    // Do your initialization here
  }

  async stop(): Promise<void> {
    console.log("Worker service stopped");
    this.running = false;
    // Do your cleanup here
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      status: this.running ? "running" : "stopped",
      details: {
        // Add custom health check details
      },
    };
  }
}

// Expose the service via RPC
const rpc = new RPCChannel(io, {
  expose: new WorkerService(),
});
```

### Running a service as a cron job

```typescript
import { BaseService, ServiceManager } from "j8s";

class BackupService extends BaseService {
  async start(): Promise<void> {
    console.log("Running backup...");
    // Do backup logic here
    this.setStatus("running");

    // Simulate work
    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log("Backup completed");
    this.setStatus("stopped");
  }

  async stop(): Promise<void> {
    // Handle stop if needed
    this.setStatus("stopped");
  }
}

const manager = new ServiceManager();
const backupService = new BackupService("backup-service");

// Add service with cron job configuration
manager.addService(backupService, {
  cronJob: {
    schedule: "0 0 * * *", // Run at midnight every day
    timeout: 60000, // 1 minute timeout
  },
});
```

## REST API

j8s includes a built-in REST API for managing services:

```typescript
import { serve } from "@hono/node-server";
import { ServiceManager, createServiceManagerAPI } from "j8s";

// Create and configure your service manager
const manager = new ServiceManager();
// Add services...

// Create the REST API
const app = createServiceManagerAPI(manager);

// Start the HTTP server
serve({
  fetch: app.fetch,
  port: 3000,
});

console.log("API server running on http://localhost:3000");
```

### Available Endpoints

- `GET /services` - List all services
- `GET /services/:name` - Get service details
- `GET /services/:name/health` - Get health for a specific service
- `POST /services/:name/start` - Start a service
- `POST /services/:name/stop` - Stop a service
- `POST /services/:name/restart` - Restart a service
- `DELETE /services/:name` - Remove a service
- `GET /health` - Get health for all services
- `POST /services/start-all` - Start all services
- `POST /services/stop-all` - Stop all services

## API Reference

### Interfaces

#### IService

```typescript
interface IService {
  name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  healthCheck(): Promise<HealthCheckResult>;
}
```

#### ServiceConfig

```typescript
interface ServiceConfig {
  restartPolicy?: RestartPolicy; // 'always' | 'unless-stopped' | 'on-failure' | 'no'
  maxRetries?: number; // Used with 'on-failure' policy
  cronJob?: CronJobConfig;
}
```

#### CronJobConfig

```typescript
interface CronJobConfig {
  schedule: string; // Cron expression
  timeout?: number; // Optional timeout in milliseconds
}
```

### Classes

#### BaseService

A base class for services running in the main thread.

#### ServiceManager

Manages all services, handling starting, stopping, health checks, and restart policies.

#### WorkerService

A wrapper for services running in worker threads.

## Examples

Check out the [examples](./examples) directory for more usage examples.

## License

MIT
